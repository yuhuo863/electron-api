const express = require("express");
const { body, param, query } = require("express-validator");
const adminController = require("../controllers/adminController");
const { authenticate, requireRole } = require("../middlewares/auth");

const router = express.Router();

// 所有管理员路由都需要认证和管理员角色
router.use(authenticate);
router.use(requireRole("admin"));

// 获取所有用户
router.get(
  "/users",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("search")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Search term must be between 1 and 100 characters"),
    query("role")
      .optional()
      .isIn(["admin", "user", "vip"])
      .withMessage("Role must be admin, user, or vip"),
    query("status")
      .optional()
      .isIn(["active", "inactive"])
      .withMessage("Status must be active or inactive"),
  ],
  adminController.getAllUsers,
);

// 更新用户角色
router.put(
  "/users/:id/role",
  [
    param("id")
      .notEmpty()
      .withMessage("User ID is required")
      .isUUID()
      .withMessage("Invalid user ID"),
    body("role")
      .notEmpty()
      .withMessage("Role is required")
      .isIn(["user", "vip"])
      .withMessage("Role must be user or vip"),
    body("reason").optional().isString().withMessage("Reason must be a string"),
  ],
  adminController.updateUserRole,
);

// 禁用/启用用户
router.put(
  "/users/:id/status",
  [
    param("id")
      .notEmpty()
      .withMessage("User ID is required")
      .isUUID()
      .withMessage("Invalid user ID"),
    body("isActive")
      .notEmpty()
      .withMessage("isActive is required")
      .isBoolean()
      .withMessage("isActive must be a boolean"),
  ],
  adminController.toggleUserStatus,
);

// 获取系统统计信息
router.get("/stats", adminController.getSystemStats);

// 获取操作日志
router.get(
  "/action-logs",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("userId")
      .optional()
      .isUUID()
      .withMessage("User ID must be a valid UUID"),
    query("action")
      .optional()
      .isIn([
        "password_accessed",
        "password_created",
        "password_updated",
        "password_deleted",
        "account_created",
        "account_locked",
        "export_data",
        "import_data",
        "user_role_updated",
        "user_enabled",
        "user_disabled",
      ])
      .withMessage("Invalid action type"),
  ],
  adminController.getUserActionLogs,
);

// 获取所有接口运行日志
router.get(
  "/api-logs",
  [
    query("currentPage")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("pageSize")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
  adminController.getApiRuntimeLogs,
);

// 获取所有接口运行日志
module.exports = router;
