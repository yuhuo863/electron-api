const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { authenticate } = require("../middlewares/auth");
const feedbackController = require("../controllers/feedbackController");

router.use(authenticate);

router.get("/status", feedbackController.checkFeedbackStatus);

router.post(
  "/",
  authenticate,
  body("score")
    .notEmpty()
    .withMessage("Score is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("Score must be between 1 and 5"),
  body("content").optional().isString().withMessage("Content must be a string"),
  feedbackController.submitFeedback,
);

module.exports = router;
