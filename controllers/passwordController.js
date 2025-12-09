const {
  Password,
  PasswordHistory,
  Category,
  Like,
  User,
  SecurityLog,
} = require("../models");
const { validationResult } = require("express-validator");
const { sendOk, sendErr } = require("../utils/response");
const { encrypt, decrypt } = require("../services/encryptionService");
const { calculatePasswordStrength } = require("../services/passwordService");
const { logSecurityEvent } = require("../utils/logger");
const { Op, fn, col } = require("sequelize");
const { sequelize } = require("../models");

const passwordController = {
  // 创建密码
  async create(req, res) {
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

      const {
        title,
        username,
        password,
        url,
        notes,
        categoryId,
        customFields,
      } = req.body;
      const { id: userId } = req.user;

      // 如果没有categoryId，则使用用户注册时创建的默认分类
      let findCategoryId = categoryId;
      if (!findCategoryId) {
        const defaultCategory = await Category.findOne({
          where: {
            userId,
            isDefault: true,
          },
        });
        if (!defaultCategory) {
          return sendErr(res, {
            isOperational: true,
            statusCode: 400,
            message: "默认分类不存在",
          });
        }
        findCategoryId = defaultCategory.id;
      }

      // categoryId 必须存在且是有效的分类ID
      const category = await Category.findByPk(findCategoryId);
      if (!category) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "分类不存在",
        });
      }

      // 加密密码
      const encryptedPassword = encrypt(password, process.env.MASTER_PASSWORD);

      // 计算密码强度
      const passwordStrength = calculatePasswordStrength(password);

      // 创建新密码记录
      const newPassword = await Password.create({
        userId,
        categoryId: findCategoryId,
        title,
        username,
        encryptedPassword,
        url,
        notes,
        customFields,
        passwordStrength,
      });

      // 记录安全日志
      await logSecurityEvent(
        userId,
        "password_created",
        {
          passwordId: newPassword.id,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        newPassword.id,
      );

      return sendOk(res, 201, "密码创建成功", {
        id: newPassword.id,
        title: newPassword.title,
        username: newPassword.username,
        url: newPassword.url,
        notes: newPassword.notes,
        categoryId: newPassword.categoryId,
        customFields: newPassword.customFields,
        passwordStrength: newPassword.passwordStrength,
        createdAt: newPassword.createdAt,
      });
    } catch (error) {
      console.error("密码创建失败", error);
      return sendErr(res, error);
    }
  },

  // 获取密码列表
  async getAll(req, res) {
    try {
      const { id: userId } = req.user;
      const {
        categoryId,
        search,
        currentPage = 1,
        pageSize = 10,
        sortBy = "createdAt",
        sortOrder = "DESC",
        isFavorite = false,
      } = req.query;

      const whereClause = {
        userId,
      };
      if (categoryId) {
        whereClause.categoryId = categoryId;
      }
      if (isFavorite) {
        whereClause.isFavorite = true;
      }
      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { username: { [Op.like]: `%${search}%` } },
        ];
      }

      const offset = (currentPage - 1) * pageSize;

      const { count, rows } = await Password.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Category,
            as: "category",
            attributes: ["id", "name", "color", "icon"],
          },
        ],
        // 返回密码的相关字段
        attributes: [
          "id",
          "url",
          "notes",
          "title",
          "username",
          "isFavorite",
          "passwordStrength",
          "encryptedPassword",
          "lastUsed",
        ],
        // 如果排除字段
        // attributes: {exclude: ["xx", "xxx"]}
        order: [[sortBy, sortOrder.toUpperCase()]],
        offset,
        limit: parseInt(pageSize),
      });

      // 解密每个密码
      const passwords = await Promise.all(
        rows.map((password) => {
          const decryptedPassword = decrypt(
            password.encryptedPassword,
            process.env.MASTER_PASSWORD,
          );
          return {
            ...password.toJSON(),
            password: decryptedPassword,
          };
        }),
      );

      return sendOk(res, 200, "密码列表检索成功", {
        passwords,
        pagination: {
          total: count,
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(count / pageSize),
          currentPage: parseInt(currentPage),
        },
      });
    } catch (error) {
      console.error("密码列表检索失败", error);
      return sendErr(res, error);
    }
  },

  // 获取密码详情
  async getById(req, res) {
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

      const { id } = req.params;

      const { id: userId } = req.user;

      const password = await Password.findOne({
        where: {
          id,
          userId,
        },
        include: [
          {
            model: Category,
            as: "category",
            attributes: ["name", "color", "icon"],
          },
        ],
      });

      if (!password) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "密码记录不存在",
        });
      }

      // 记录密码使用时间
      await password.update({ lastUsed: new Date() });

      // 解密密码
      const decryptedPassword = decrypt(
        password.encryptedPassword,
        process.env.MASTER_PASSWORD,
      );

      // 记录安全日志
      await logSecurityEvent(
        userId,
        "password_accessed",
        {
          passwordId: password.id,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        id,
      );

      return sendOk(res, 200, "密码详情获取成功", {
        title: password.title,
        username: password.username,
        password: decryptedPassword,
        url: password.url,
        notes: password.notes,
        category: password.category,
        passwordStrength: password.passwordStrength,
        isFavorite: password.isFavorite,
        createdAt: password.createdAt,
        updatedAt: password.updatedAt,
        lastUsed: password.lastUsed,
      });
    } catch (error) {
      console.error("密码详情获取失败", error);
      return sendErr(res, error);
    }
  },

  // 更新密码
  async update(req, res) {
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

      const { id } = req.params;
      const { id: userId } = req.user;
      const {
        title,
        username,
        password,
        url,
        notes,
        categoryId,
        // customFields,
      } = req.body;

      // 查找现有密码记录
      const existingPassword = await Password.findOne({
        where: {
          id,
          userId,
        },
      });

      if (!existingPassword) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "密码记录不存在",
        });
      }

      // 检查密码是否发生变化，如果变化保存密码历史记录
      if (
        password &&
        password !==
          decrypt(
            existingPassword.encryptedPassword,
            process.env.MASTER_PASSWORD,
          )
      ) {
        // 保存密码历史记录
        await PasswordHistory.create({
          passwordId: id, // 原始密码ID
          encryptedPassword: existingPassword.encryptedPassword, // 原始加密密码
        });
      }

      // 准备更新数据
      const updateData = {
        title,
        username,
        url,
        notes,
        categoryId,
        // customFields: customFields || {},
      };

      // 如果提供了新密码，则加密并更新
      if (password) {
        updateData.encryptedPassword = encrypt(
          password,
          process.env.MASTER_PASSWORD,
        ); // 加密新密码
        updateData.passwordStrength = calculatePasswordStrength(password); // 计算密码强度
      }

      // 更新密码记录
      await existingPassword.update(updateData);

      // 记录安全日志
      await logSecurityEvent(
        userId,
        "password_updated",
        {
          passwordId: id,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        id,
      );

      return sendOk(res, 200, "密码更新成功");
    } catch (error) {
      console.error("密码更新失败", error);
      return sendErr(res, error);
    }
  },

  // 删除密码存储
  async delete(req, res) {
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

      const { id } = req.params;
      const { id: userId } = req.user;

      // 查找并删除密码记录
      const password = await Password.findOne({
        where: {
          id,
          userId,
        },
      });

      if (!password) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "密码记录不存在",
        });
      }

      // 软删除
      await Password.destroy({ where: { id } });

      await logSecurityEvent(
        userId,
        "password_deleted",
        {
          targetUser: userId,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        id,
      );

      return sendOk(res, 200, "密码删除成功");
    } catch (error) {
      console.error("密码删除失败", error);
      return sendErr(res, error);
    }
  },

  // 批量删除密码
  async deleteBatch(req, res) {
    // Express默认不会解析DELETE请求中的body, 所以这里需要使用POST请求
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

      const { ids } = req.body;
      const { id: userId } = req.user;

      // 批量删除密码记录
      const affectRows = await Password.destroy({ where: { id: ids } });
      if (affectRows === 0) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "没有任何密码记录被删除",
        });
      }
      // 记录安全日志
      await logSecurityEvent(userId, "password_deleted_batch", {
        // 由于这个action是仅代表删除密码, 这里可标注批量删除相关信息
        passwordIds: ids,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      return sendOk(res, 200, "批量删除密码成功");
    } catch (error) {
      console.error("批量删除密码失败", error);
      return sendErr(res, error);
    }
  },

  // 获取密码历史记录
  async getHistory(req, res) {
    try {
      const { id } = req.params;
      const { id: userId } = req.user;

      // 验证密码是否属于当前用户
      const password = await Password.findOne({
        where: {
          id,
          userId,
        },
      });

      if (!password) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "密码历史记录不存在",
        });
      }

      // 获取密码历史记录
      const history = await PasswordHistory.findAll({
        where: { passwordId: id },
        order: [["changed_at", "DESC"]], // 按更改时间降序排列
      });

      // 解密历史记录中的密码
      const decryptedPasswords = history.map((h) => ({
        changedAt: h.changedAt,
        decryptedPassword: decrypt(
          h.encryptedPassword,
          process.env.MASTER_PASSWORD,
        ),
      }));

      return sendOk(res, 200, "密码历史记录检索成功", {
        history: decryptedPasswords,
      });
    } catch (error) {
      console.error("密码历史记录检索失败", error);
      return sendErr(res, error);
    }
  },

  // 获取回收站中的密码
  async getAllTrash(req, res) {
    try {
      const { id: userId } = req.user;
      const { currentPage = 1, pageSize = 10 } = req.query;

      const offset = (currentPage - 1) * pageSize;

      // 获取用户所有已删除的密码记录
      const { count, rows: deletedPasswords } = await Password.findAndCountAll({
        where: {
          userId,
          deletedAt: { [Op.not]: null }, // 只查询软删除的记录
        },
        attributes: ["id", "title", "username", "lastUsed", "deletedAt"],
        order: [["deletedAt", "DESC"]],
        limit: parseInt(pageSize),
        offset,
        paranoid: false, // 关闭软删除特性才能查询到软删除的记录
      });

      return sendOk(res, 200, "回收站密码记录检索成功", {
        passwords: deletedPasswords,
        pagination: {
          total: count,
          currentPage: parseInt(currentPage),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(count / pageSize),
        },
      });
    } catch (error) {
      console.error("回收站密码记录检索失败", error);
      return sendErr(res, error);
    }
  },

  // 还原指定密码
  async restore(req, res) {
    try {
      const { id } = req.params;
      const { id: userId } = req.user;

      // 查找并还原密码记录
      const passwordToRestore = await Password.findOne({
        where: {
          id,
          userId,
        },
        paranoid: false, // 关闭软删除特性才能查询到软删除的记录
      });

      if (!passwordToRestore) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "密码记录不存在",
        });
      }

      // 还原密码记录
      await Password.restore({ where: { id } });

      await SecurityLog.destroy({
        where: {
          userId,
          action: "password_deleted",
          passwordId: id,
        },
      });

      return sendOk(res, 200, "密码恢复成功");
    } catch (error) {
      console.error("密码恢复失败", error);
      return sendErr(res, error);
    }
  },

  // 批量还原密码
  async restoreAll(req, res) {
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

      const { ids } = req.body;
      const { id: userId } = req.user;

      // 批量还原密码记录
      await Password.restore({
        where: {
          id: ids, // 确保传入的是一个数组
          userId,
        },
      });

      return sendOk(res, 200, "密码批量恢复成功");
    } catch (error) {
      console.error("密码批量恢复失败", error);
      return sendErr(res, error);
    }
  },

  // 永久删除密码
  async deletePermanently(req, res) {
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

      const { id } = req.params;
      const { id: userId } = req.user;

      // 查找并永久删除密码记录
      await Password.destroy({
        where: {
          id,
          userId,
        },
        force: true, // 强制删除，忽略软删除标志
      });

      return sendOk(res, 200, "密码永久删除成功");
    } catch (error) {
      console.error("密码永久删除失败", error);
      return sendErr(res, error);
    }
  },

  // 批量永久删除密码
  async deleteBatchPermanently(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return (
          sendErr,
          {
            isOperational: true,
            statusCode: 400,
            message: "Validation failed",
            errors: errors.array(),
          }
        );
      }

      const { ids } = req.body;
      const { id: userId } = req.user;

      // 批量永久删除密码记录
      await Password.destroy({
        where: {
          id: ids,
          userId,
        },
        force: true, // 强制删除，忽略软删除标志
      });

      return sendOk(res, 200, "密码批量永久删除成功");
    } catch (error) {
      console.error("密码批量永久删除失败", error);
      return sendErr(res, error);
    }
  },

  // 永久删除所有密码
  async deletePermanentlyAll(req, res) {
    try {
      const { id: userId } = req.user;
      // 查找当前用户的所有密码记录
      await Password.destroy({
        where: {
          userId,
        },
        force: true, // 强制删除，忽略软删除标志
      });
      return sendOk(res, 200, "所有密码记录已永久删除");
    } catch (error) {
      console.error("删除所有密码记录失败", error);
      return sendErr(res, error);
    }
  },

  // 收藏/取消收藏密码
  async collectPassword(req, res) {
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
      const { passwordId } = req.body;
      const password = await Password.findByPk(passwordId, { transaction });
      if (!password) {
        return sendErr(res, new Error("password not found"));
      }
      const like = await Like.findOne(
        {
          where: { userId, passwordId },
        },
        { transaction },
      );

      if (!like) {
        await Like.create({ userId, passwordId }, { transaction });
        await password.update({ isFavorite: true }, { transaction });
        await transaction.commit();
        return sendOk(res, 201, "收藏成功");
      } else {
        await like.destroy({ transaction });
        await password.update({ isFavorite: false }, { transaction });
        await transaction.commit();
        return sendOk(res, 200, "取消收藏成功");
      }
    } catch (error) {
      await transaction.rollback();
      sendErr(res, error);
    }
  },

  // 查询用户收藏的密码
  async getUserFavoritePasswords(req, res) {
    const { id: userId } = req.user;

    // 分页
    const query = req.query;
    const currentPage = Math.abs(Number(query.currentPage)) || 1;
    const pageSize = Math.abs(Number(query.pageSize)) || 10;
    const offset = (currentPage - 1) * pageSize;

    const user = await User.findByPk(userId);

    // 查询当前用户收藏的密码记录
    const collectPasswords = await user.getLikedPasswords({
      // 查询多对多关联时，排除掉中间表
      joinTableAttributes: [], // 不查询关联表, 这里指点赞收藏表
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name", "color", "icon"],
        },
      ],
      attributes: [
        "id",
        "title",
        "url",
        "username",
        "encryptedPassword",
        "notes",
        "isFavorite",
        "passwordStrength",
        "lastUsed",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: pageSize,
    });

    // 解密收藏的密码
    const decryptedPasswords = await Promise.all(
      collectPasswords.map((password) => {
        const decryptedPassword = decrypt(
          password.encryptedPassword,
          process.env.MASTER_PASSWORD,
        );
        return { ...password.toJSON(), decryptedPassword };
      }),
    );
    // 查询当前用户收藏密码记录的总数
    const count = await user.countLikedPasswords();

    return sendOk(res, 200, "用户收藏的密码记录检索成功", {
      decryptedPasswords,
      pagination: {
        total: count,
        currentPage,
        pageSize,
      },
    });
  },

  // 获取用户所有密码强度均值
  async getPasswordStrengthAverage(req, res) {
    try {
      const { id: userId } = req.user;

      const result = await Password.findAll({
        // 使用 fn 和 col 计算平均值，并命名为 averageStrength
        attributes: [[fn("AVG", col("password_strength")), "averageStrength"]],
        where: {
          userId,
        },
        raw: true,
      });
      console.log("Result:", result);

      let averageStrength = result?.[0]?.averageStrength;

      if (averageStrength === null) {
        averageStrength = 0;
      } else {
        // 确保返回两位小数的数字字符串，更适合前端展示 (例如：85.33)
        averageStrength = parseFloat(averageStrength);
      }

      return sendOk(res, 200, "密码强度均值获取成功", {
        averageStrength: averageStrength,
      });
    } catch (error) {
      console.error("密码强度均值获取失败", error);
      return sendErr(res, error);
    }
  },
};

module.exports = passwordController;
