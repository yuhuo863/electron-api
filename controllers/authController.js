const bcrypt = require("bcrypt");
const { User, Category, Session, sequelize } = require("../models");
const { validationResult } = require("express-validator");
const { parseUserAgent } = require("../utils/deviceParser");
const {
  generateTokenPair,
  verifyToken,
  decodeToken,
} = require("../services/authService");
const { sendOk, sendErr } = require("../utils/response");
const { logSecurityEvent } = require("../utils/logger");
const {
  addToBlacklist,
  isBlacklisted,
} = require("../services/blacklistService");
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const redisService = require("../services/redisService");
const registerEmailTemplate = require("../templates/register");
const { mailProducer } = require("../utils/rabbitMQ");

const authController = {
  // 用户注册
  async register(req, res) {
    // 开启事务支持
    const transaction = await sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { username, email, password } = req.body;

      // 检查用户名或邮箱是否存在
      const existingUser = await User.findOne(
        {
          where: {
            [Op.or]: [{ username }, { email }],
          },
        },
        { transaction },
      );

      if (existingUser) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 409,
          message: "用户名或邮箱已存在",
        });
      }

      // 创建新用户
      const newUser = await User.create(
        {
          username,
          email,
          passwordHash: password,
          tokenVersion: 1,
          refreshTokenHash: null,
          masterPasswordHint: null,
        },
        { transaction },
      );

      // 为新用户创建默认分类(相当于密码记录的初始容器)
      await Category.create(
        {
          userId: newUser.id,
          name: "General",
          color: "#95a5a6",
          icon: "folder",
          isDefault: true, // 设置为默认分类 默认 false
        },
        { transaction },
      );

      // 记录安全日志
      await logSecurityEvent(
        newUser.id,
        "account_created",
        {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        null,
        transaction,
      );

      await transaction.commit(); // 提交事务

      // 删除临时生成的验证码key, 防止重复利用
      await redisService.del(req.body.captchaKey);

      const html = registerEmailTemplate(newUser.username);

      const msg = {
        to: newUser.email,
        subject: "Welcome to KeyVault Pro",
        html: html,
      };

      await mailProducer(msg);

      return sendOk(res, 201, "用户注册成功", {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.createdAt,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("用户注册失败", error);
      return sendErr(res, error);
    }
  },

  // 用户登录
  async login(req, res) {
    // 开启事务支持
    const transaction = await sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { username, password } = req.body;

      // 查找用户, 限定scope为'withHashes', 这样可以直接访问passwordHash等hash字段
      const user = await User.scope("withHashes").findOne(
        {
          where: {
            // 支持用户名或邮箱登录
            [Op.or]: [{ username }, { email: username }],
          },
        },
        { transaction },
      );

      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "账号不存在",
        });
      }

      // 检查用户是否被锁定 (例如，多次登录失败后)
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 423,
          message: "账户已被锁定，请稍后再试",
        });
      }

      // 检查用户是否激活
      if (!user.isActive) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 403,
          message: "用户未激活",
        });
      }

      // 验证密码是否正确
      const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);

      if (!isPasswordValid) {
        // 增加登录失败次数
        await user.increment("failedLoginAttempts");

        // 如果登录失败次数超过阈值，锁定账户
        if (user.failedLoginAttempts >= 5) {
          // 阈值为5次
          const lockTime = new Date();
          // 锁定1分钟
          lockTime.setMinutes(lockTime.getMinutes() + 1);
          // 更新锁定时间
          await user.update({
            lockedUntil: lockTime,
          });
          // 记录安全日志
          await logSecurityEvent(user.id, "user_locked", {
            targetUserId: user.id,
          });

          return sendErr(res, {
            isOperational: true,
            statusCode: 423,
            message: "账户已被锁定，请稍后再试",
          });
        }

        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "用户名或密码错误",
        });
      }

      // 重置登录失败次数和锁定状态，并记录最后登录时间
      if (user.failedLoginAttempts > 0) {
        await user.update(
          {
            failedLoginAttempts: 0,
            lockedUntil: null, // 解锁账户
          },
          { transaction },
        );
      }
      // 生成JWT令牌对，包含访问令牌和刷新令牌
      const { accessToken, refreshToken } = generateTokenPair(user);

      // 将刷新令牌哈希存储在用户记录中，以便后续可以验证刷新令牌
      const newRefreshTokenHash = await bcrypt.hash(refreshToken, 10);
      await user.update(
        {
          refreshTokenHash: newRefreshTokenHash,
          lastLogin: new Date(), // 记录当前时间为登录时间
        },
        { transaction },
      );

      // 无论何时登录都销毁旧会话->创建新会话
      await Session.destroy(
        {
          where: {
            userId: user.id,
          },
        },
        { transaction },
      );

      // 解码JWT以获取过期时间等信息
      const decoded = jwt.decode(accessToken);

      const atExpiresAt = new Date(decoded.exp * 1000);

      // 手动为刷新令牌设置过期时间，设置为7天
      const rtExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // 记录会话信息
      const deviceInfo = parseUserAgent(req.get("User-Agent")); // 解析用户代理字符串以获取设备信息

      await Session.create(
        {
          userId: user.id,
          jti: JSON.stringify({
            at: decoded.jti, // AT的jti
            rt: refreshToken, // RT本身就是一个UUID, 它的jti就是它自己
          }),
          deviceInfo,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
          expiresAt: atExpiresAt,
          rtExpiresAt: rtExpiresAt,
        },
        { transaction },
      );

      await transaction.commit();

      return sendOk(res, 200, "登录成功", {
        accessToken,
        refreshToken,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("登录失败", error);
      return sendErr(res, error);
    }
  },

  // 用户登出
  async logout(req, res) {
    try {
      const userId = req.user.id;
      const currentAT = req.token; // AT

      const decode = verifyToken(currentAT);
      if (!decode) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "无效的访问令牌",
        });
      }

      const user = await User.findOne({
        where: {
          id: userId,
        },
      });

      const currentSession = await Session.findOne({
        where: {
          userId,
          isActive: true,
        },
      });

      if (!currentSession) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "会话不存在或已过期，请重新登录",
        });
      }

      // 从会话记录中解析出双jti
      let jtiObj;
      try {
        jtiObj = JSON.parse(currentSession.jti);
      } catch (e) {
        console.error("解析会话JTI失败", e);
        return sendErr(res, {
          isOperational: true,
          statusCode: 500,
          message: "内部服务器错误, 无法解析会话JTI",
        });
      }

      // 计算AT和RT的剩余有效时间
      const now = Math.floor(Date.now() / 1000);
      const atExpiresIn = decode.exp - now;
      const rtExpiresIn =
        Math.floor(new Date(currentSession.rtExpiresAt).getTime() / 1000) - now;

      // 将AT的jti加入黑名单
      if (atExpiresIn > 0) {
        await addToBlacklist(jtiObj.at, atExpiresIn);
        console.log(
          `Access token ${jtiObj.at} added to blacklist with TTL ${atExpiresIn}s.`,
        );
      }
      // 将RT的jti加入黑名单
      if (jtiObj.rt && rtExpiresIn > 0) {
        await addToBlacklist(jtiObj.rt, rtExpiresIn);
        console.log(
          `Refresh token ${jtiObj.rt} added to blacklist with TTL ${rtExpiresIn}s.`,
        );
      }
      // 注销会话
      await Session.destroy({
        where: {
          userId,
        },
      });

      // 清除user的refreshTokenHash
      // 即使黑名单 Redis 出现故障或延迟，只要 refreshTokenHash 被清除
      // refreshToken 接口中的 User.findByRefreshToken 验证就会失败，从而确保该 RT 立即失效，无法被重用。
      await user.update({
        refreshTokenHash: null,
      });

      return sendOk(res, 200, "登出成功");
    } catch (error) {
      console.error("登出失败", error);
      return sendErr(res, error);
    }
  },

  // 刷新JWT令牌
  async refreshToken(req, res) {
    // 开启事务
    const transaction = await sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { refreshToken } = req.body;

      const isInBlacklisted = await isBlacklisted(refreshToken);
      if (isInBlacklisted) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "会话已被撤销，请重新登录",
        });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "未提供访问令牌",
        });
      }
      const oldAccessToken = authHeader.substring(7);
      const decodeOldAT = decodeToken(oldAccessToken);

      if (!decodeOldAT || !decodeOldAT.payload || !decodeOldAT.payload.userId) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "无效的访问令牌",
        });
      }

      const userId = decodeOldAT.payload.userId;

      // 使用模型中自定义方法查找用户
      const user = await User.findByRefreshToken(userId, refreshToken);

      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "会话已过期或令牌无效，请重新登录",
        });
      }

      // 查找并验证旧的会话记录
      const oldSession = await Session.findOne({
        where: {
          userId: decodeOldAT.payload.userId, // 确保RT属于正确的用户
        },
      });

      if (!oldSession) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "会话不存在或已过期",
        });
      }

      // 从旧的会话记录的jti字段中解析出旧的RT
      let jtiObj;
      try {
        jtiObj = JSON.parse(oldSession.jti);
      } catch (e) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 500,
          message: "内部服务器错误, 无法解析会话JTI",
        });
      }

      if (jtiObj.rt !== refreshToken) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "令牌不匹配，请重新登录",
        });
      }
      if (oldSession.rtExpiresAt < new Date()) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 401,
          message: "刷新令牌已过期",
        });
      }

      // 计算RT的剩余有效时间，并将其加入黑名单。
      // 刷新令牌接口只需要将旧的RT加入黑名单即可，无需处理AT。因为旧的AT已经失效所以才来请求这个接口。
      const now = Math.floor(Date.now() / 1000);
      const oldRTExpiresIn =
        Math.floor(new Date(oldSession.rtExpiresAt).getTime() / 1000) - now;

      if (oldRTExpiresIn > 0) {
        await addToBlacklist(jtiObj.rt, oldRTExpiresIn);
      }

      // 生成新的令牌对
      const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(
        user.dataValues,
      );

      const decodedNewAT = decodeToken(accessToken);
      const newAtExpiresAt = new Date(decodedNewAT.payload.exp * 1000);
      // 更新用户的会话状态
      await oldSession.update(
        {
          jti: JSON.stringify({
            at: decodedNewAT.jti,
            rt: newRefreshToken,
          }),
          expiresAt: newAtExpiresAt, // 更新为新 AT 的过期时间
          // 如果想要实现“滑动窗口”过期（只要有活动就延长 RT 过期），这里也可以更新 rtExpiresAt
          // 滑动窗口过期，又称滚动会话 (Rolling Session)，指的是：
          // 只要用户在会话有效期内保持活跃（即不断使用 Access Token 访问受保护资源，并因此触发 Refresh Token 刷新），那么 Refresh Token 的过期时间就会被延长。
          // 只有当用户在一段时间内（例如 7 天）没有任何活动时，其 Refresh Token 才会真正过期，用户才会被强制登出。
          rtExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        { transaction },
      );

      // 更新用户的刷新令牌哈希
      const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
      await user.update(
        {
          refreshTokenHash: newRefreshTokenHash,
        },
        { transaction },
      );

      await transaction.commit();

      return sendOk(res, 200, "令牌刷新成功", {
        accessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      console.error("刷新令牌失败", error);
      return sendErr(res, error);
    }
  },
};

module.exports = authController;
