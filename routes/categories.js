const express = require("express");
const { body, param } = require("express-validator");
const categoryController = require("../controllers/categoryController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

// 所有分类路由都需要认证
router.use(authenticate);

// 创建分类
router.post(
  "/",
  [
    body("name")
      .notEmpty()
      .withMessage("Category name is required")
      .isLength({ max: 50 })
      .withMessage("Category name must be less than 50 characters"),
    body("color")
      .optional()
      .matches(
        /^rgba?\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\s*(?:,\s*(1|0?\.\d+|0)\s*)?\)$/i,
      )
      .withMessage("Color must be a valid rgba color"),
    body("icon")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Icon name must be less than 50 characters"),
  ],
  categoryController.create,
);

// 获取分类列表
router.get("/", categoryController.getAll);

// 更新分类
router.put(
  "/:id",
  [
    param("id").isUUID().withMessage("Invalid category ID"),
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Category name cannot be empty")
      .isLength({ max: 50 })
      .withMessage("Category name must be less than 50 characters"),
    body("color")
      .optional()
      .matches(
        /^rgba?\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\s*(?:,\s*(1|0?\.\d+|0)\s*)?\)$/i,
      )
      .withMessage("Color must be a valid rgba color"),
    body("icon")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Icon name must be less than 50 characters"),
  ],
  categoryController.update,
);

// 删除分类
router.delete(
  "/:id",
  [param("id").isUUID().withMessage("Invalid category ID")],
  categoryController.delete,
);

module.exports = router;
