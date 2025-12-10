const express = require("express");
const { body, query } = require("express-validator");
const userController = require("../controllers/userController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

// 获取个人信息
router.get("/profile", authenticate, userController.getProfile);

// 更新个人信息
router.put(
  "/profile",
  [
    body("username")
      .optional()
      .isLength({ min: 3, max: 50 })
      .withMessage("Username must be between 3 and 50 characters"),
    body("email")
      .optional()
      .isEmail()
      .withMessage("Please provide a valid email"),
    body("masterPasswordHint")
      .optional()
      .isLength({ max: 255 })
      .withMessage("Master password hint must be less than 255 characters"),
  ],
  authenticate,
  userController.updateProfile,
);

// 发送邮箱验证码
router.post(
  "/email-captcha",
  [
    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Please provide a valid email"),
  ],
  userController.sendEmailCode,
);

// 验证邮箱验证码
router.post(
  "/email-captcha/verify",
  [
    body("newPassword")
      .notEmpty()
      .withMessage("New password is required")
      .isLength({ min: 8, max: 36 })
      .withMessage("New password must be between 8 and 36 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/) // 至少包含一个小写字母，一个大写字母和一个数字
      .withMessage(
        "New password must contain at least one lowercase letter, one uppercase letter, and one number",
      ),
    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Please provide a valid email"),
    body("code")
      .notEmpty()
      .withMessage("Code is required")
      .isLength({ min: 6, max: 6 })
      .withMessage("Code must be 6 characters long"),
  ],
  userController.verifyEmailCode,
);

// 修改密码
router.put(
  "/password",
  [
    body("currentPassword").notEmpty().withMessage("当前密码为必填项"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("新密码必须至少8位")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/) // 至少包含一个小写字母，一个大写字母和一个数字
      .withMessage("新密码必须包含至少一个小写字母，一个大写字母和一个数字")
      .custom((value, { req }) => {
        // 验证新密码是否与当前密码相同
        if (value === req.body.currentPassword) {
          throw new Error("新密码不能与当前密码相同");
        }
        return true;
      }),
  ],
  authenticate,
  userController.changePassword,
);

// 获取当前用户的密码操作日志
router.get(
  "/password-logs",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
  authenticate,
  userController.getPasswordLogs,
);

// 验证锁屏状态下用户输入的主密码是否正确
router.post(
  "/screen-lock-password",
  [body("password").notEmpty().withMessage("主密码为必填项")],
  authenticate,
  userController.validateScreenLockPassword,
);

module.exports = router;
