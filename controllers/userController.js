const {
  User,
  SecurityLog,
  sequelize,
  Session,
  Password,
} = require("../models");
const { validationResult } = require("express-validator");
const { sendOk, sendErr } = require("../utils/response");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const { parseBoolean } = require("../utils/parsers");
const crypto = require("crypto");
const emailCaptchaTemplate = require("../templates/captcha");
const { mailProducer } = require("../utils/rabbitMQ");
const redisClient = require("../services/redisService");

const userController = {
  // 获取个人信息
  async getProfile(req, res) {
    try {
      const { id: userId } = req.user;

      const user = await User.findByPk(userId, {
        attributes: [
          "id",
          "email",
          "username",
          "avatar",
          "createdAt",
          "updatedAt",
          "isActive",
          "lastLogin",
          "role",
        ],
      });

      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "用户不存在",
        });
      }

      return sendOk(res, 200, "用户信息检索成功", { user });
    } catch (error) {
      console.error("用户信息检索失败", error);
      return sendErr(res, error);
    }
  },

  // 更新个人信息
  async updateProfile(req, res) {
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

      const { id: userId } = req.user;
      const { username, email, avatar } = req.body;

      const user = await User.findByPk(userId);

      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "用户不存在",
        });
      }

      // 检查用户名和邮箱是否已被其他用户使用
      if (username && username !== user.username) {
        const existingUser = await User.findOne({
          where: {
            username,
            id: { [Op.ne]: userId },
          },
        });
        if (existingUser) {
          return sendErr(res, {
            isOperational: true,
            statusCode: 400,
            message: "用户名已被其他用户使用",
          });
        }
      }

      if (email && email !== user.email) {
        const existingUser = await User.findOne({
          where: {
            email,
            id: { [Op.ne]: userId },
          },
        });
        if (existingUser) {
          return sendErr(res, {
            isOperational: true,
            statusCode: 400,
            message: "邮箱已被其他用户使用",
          });
        }
      }

      // 更新用户信息
      await user.update({
        username: username || user.username,
        email: email || user.email,
        avatar: avatar || user.avatar,
      });

      return sendOk(
        res,
        200,
        "更新用户信息成功",
        {
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
        "updatedUser",
      );
    } catch (error) {
      console.error("更新用户信息失败", error);
      return sendErr(res, error);
    }
  },

  // 发送邮箱验证码
  async sendEmailCode(req, res) {
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
      const { email } = req.body;
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "用户不存在",
        });
      }
      const code = crypto.randomInt(100000, 1000000).toString();
      await redisClient.setEx(`email-reset-pwd:${email}`, 60 * 15, code);
      const html = emailCaptchaTemplate(code);
      const msg = {
        to: email,
        subject: "[KeyValut Pro] 邮箱验证码",
        html,
      };
      await mailProducer(msg);
      return sendOk(res, 200, "验证码已发送至您的邮箱");
    } catch (error) {
      console.error("发送邮箱验证码失败", error);
      return sendErr(res, error);
    }
  },

  // 校验邮箱验证码
  async verifyEmailCode(req, res) {
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
      const { newPassword, email, code } = req.body;

      const code_key = `email-reset-pwd:${email}`;
      const storedCode = await redisClient.get(code_key);
      if (!storedCode || storedCode !== code) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "验证码错误或已过期",
        });
      }
      await redisClient.del(code_key);

      const user = await User.scope("withHashes").findOne(
        {
          where: { email },
        },
        { transaction },
      );
      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "用户不存在",
        });
      }
      await user.update({ passwordHash: newPassword }, { transaction });

      await user.increment("tokenVersion", { transaction });

      await Session.destroy(
        {
          where: {
            userId: user.id,
          },
        },
        { transaction },
      );

      await transaction.commit();
      return sendOk(res, 200, "邮箱验证成功");
    } catch (error) {
      await transaction.rollback();
      console.error("校验邮箱验证码失败:", error);
      return sendErr(res, error);
    }
  },

  // 更新账户主密码
  async changePassword(req, res) {
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

      const { id: userId } = req.user;
      const { currentPassword, newPassword } = req.body;

      const user = await User.scope("withHashes").findOne(
        {
          where: {
            id: userId,
          },
        },
        { transaction },
      );

      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "用户不存在",
        });
      }

      // 验证当前密码是否正确
      const isPasswordValid = bcrypt.compareSync(
        currentPassword,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        await transaction.rollback();
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "当前密码不正确",
        });
      }

      // 验证新密码是否与当前密码相同, 已经在路由中使用了自定义验证规则，此处不再重复验证

      // 这里直接修改password字段的值为新密码值即可。不用对newPassword进行哈希处理
      // 因为已经在用户模型中对password字段(set方法)已经进行了哈希处理
      await user.update(
        {
          passwordHash: newPassword,
        },
        { transaction },
      );

      // 更新用户的token版本号，以确保所有旧令牌失效 -> 增加版本号
      await user.increment("tokenVersion", { transaction });

      // 清理会话
      await Session.destroy(
        {
          where: {
            userId,
          },
        },
        { transaction },
      );

      await transaction.commit();

      return sendOk(res, 200, "主密码更新成功，请使用新密码重新登录");
    } catch (error) {
      await transaction.rollback();
      console.error("更改密码失败", error);
      return sendErr(res, error);
    }
  },

  //  获取当前用户的密码操作日志
  async getPasswordLogs(req, res) {
    try {
      const { id: userId } = req.user;
      const { page = 1, limit = 10 } = req.query;

      const offset = (page - 1) * limit;

      const { count, rows: logs } = await SecurityLog.findAndCountAll({
        where: {
          userId,
          passwordId: {
            [Op.not]: null,
          },
        },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "email"],
          },
          {
            model: Password,
            as: "password",
            attributes: ["title"],
            paranoid: false, // 这里需要关闭软删除，查询被删除的密码
          },
        ],
        order: [["timestamp", "DESC"]],
        offset,
        limit: parseInt(limit),
      });

      return sendOk(res, 200, "安全日志检索成功", {
        logs,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error("安全日志检索失败", error);
      return sendErr(res, error);
    }
  },

  // 验证锁屏状态下用户输入的主密码是否正确
  async validateScreenLockPassword(req, res) {
    try {
      const { id: userId } = req.user;
      const { password } = req.body;

      const user = await User.scope("withHashes").findByPk(userId);
      if (!user) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "账号不存在",
        });
      }

      const isValid = bcrypt.compareSync(password, user.passwordHash);

      if (!isValid) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "密码错误",
        });
      }

      return sendOk(res, 200, "密码验证成功");
    } catch (error) {
      console.error("密码验证失败", error);
      return sendErr(res, error);
    }
  },
};

module.exports = userController;
