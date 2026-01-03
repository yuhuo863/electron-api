const { Category, Password, sequelize } = require("../models");
const { validationResult } = require("express-validator");
const { sendOk, sendErr } = require("../utils/response");
const { Op } = require("sequelize");
const { logSecurityEvent } = require("../utils/logger");

const categoryController = {
  // 创建分类
  async create(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "Validation Failed",
          errors: errors.array(),
        });
      }

      const { name, color, icon } = req.body;
      const { id: userId } = req.user;

      // 检查分类名称是否已存在
      const existingCategory = await Category.findOne({
        where: {
          name,
          userId,
        },
      });
      if (existingCategory) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 409,
          message: "分类名称已存在",
        });
      }

      // 创建分类
      const newCategory = await Category.create({
        userId,
        name,
        color: color || "#3498db",
        icon: icon || "folder",
      });
      return sendOk(res, 201, "创建分类成功", { newCategory });
    } catch (error) {
      console.error("创建分类失败:", error);
      return sendErr(res, error);
    }
  },

  // 获取分类列表
  async getAll(req, res) {
    try {
      const { id: userId } = req.user;

      // 获取用户所有分类
      const categories = await Category.findAll({
        where: {
          userId,
        },
        include: [
          {
            model: Password,
            as: "passwords",
            attributes: ["id"],
            required: false, // 即使没有密码，也返回分类
          },
        ],
        order: [["createdAt", "ASC"]],
      });

      // 添加密码数量到每个分类对象中
      const categoriesWithCount = categories.map((category) => {
        const categoryData = category.toJSON();
        categoryData.passwordCount = categoryData.passwords
          ? categoryData.passwords.length
          : 0;
        delete categoryData.passwords; // 移除密码数组，只保留计数
        return categoryData;
      });

      return sendOk(res, 200, "分类列表检索成功", {
        categories: categoriesWithCount,
      });
    } catch (error) {
      console.error("分类列表检索失败:", error);
      return sendErr(res, error);
    }
  },

  // 更新分类
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

      const { id: categoryId } = req.params;
      const { id: userId } = req.user;
      const { name, color, icon } = req.body;

      // 检查分类是否存在并属于当前用户
      const existingCategory = await Category.findOne({
        where: {
          id: categoryId,
          userId,
        },
      });

      if (!existingCategory) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "分类不存在",
        });
      }

      // 检查分类是否是默认分类
      // if (existingCategory.isDefault) {
      //     return sendErr(res, {
      //         isOperational: true,
      //         statusCode: 403,
      //         message: '无法更新默认分类'
      //     });
      // }

      // 检查新名称是否与其他分类冲突
      if (name && name !== existingCategory.name) {
        const duplicateCategory = await Category.findOne({
          where: {
            name,
            userId,
            id: { [Op.ne]: categoryId }, // 排除当前正在更新的分类，以避免冲突检查自身
          },
        });
        if (duplicateCategory) {
          return sendErr(res, {
            isOperational: true,
            statusCode: 409,
            message: "分类名称已存在",
          });
        }
      }
      // 更新分类
      await existingCategory.update({
        name: name || existingCategory.name, // 如果未提供新名称，则保留原始名称
        color: color || existingCategory.color, // 如果未提供新颜色，则保留原始颜色
        icon: icon || existingCategory.icon, // 如果未提供新图标，则保留原始图标
      });

      return sendOk(res, 200, "分类更新成功");
    } catch (error) {
      console.error("分类更新失败:", error);
      return sendErr(res, error);
    }
  },

  // 删除分类
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

      const { id: categoryId } = req.params;
      const { id: userId } = req.user;

      // 查找现有分类
      const existingCategory = await Category.findOne({
        where: {
          id: categoryId,
          userId,
        },
      });

      if (!existingCategory) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 404,
          message: "分类不存在",
        });
      }

      // 检查分类是否是默认分类
      if (existingCategory.isDefault) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "无法删除默认分类",
        });
      }

      // 检查是否有密码使用此分类, 避免孤儿记录的存在
      const passwordsCount = await Password.count({
        where: {
          categoryId,
        },
      });

      // 代表当前分类下还有关联的密码
      if (passwordsCount > 0) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 409,
          message: "无法删除，分类下还有密码",
        });
      }

      // 删除分类
      await existingCategory.destroy();

      return sendOk(res, 200, "分类删除成功");
    } catch (error) {
      console.error("分类删除失败:", error);
      return sendErr(res, error);
    }
  },
};

module.exports = categoryController;
