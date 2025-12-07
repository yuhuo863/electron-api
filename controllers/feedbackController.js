const { Feedback, User } = require("../models");
const { sendErr, sendOk } = require("../utils/response");

// 周期性评分的冷却时间（天）
const FEEDBACK_COOLDOWN_DAYS = 180;
// 新用户免打扰期（天）
const NEW_USER_GRACE_DAYS = 3;

const feedbackController = {
  // 检查用户是否可以再次评分
  async checkFeedbackStatus(req, res) {
    try {
      const currentUser = req.user;
      const { id: userId } = req.user;

      const lastFeedback = await Feedback.findOne({
        where: {
          userId,
        },
        order: [["createdAt", "DESC"]], // 按时间倒序，取最新的一条
      });

      let shouldShow = false;
      let message = "";

      if (!lastFeedback) {
        // 情况 A (用户从未评过分) -> 检查新用户免打扰期
        const registerTime = new Date(currentUser.createdAt);
        const now = new Date();
        const diffTime = now.getTime() - registerTime.getTime();
        const daysSinceRegistration = Math.floor(
          diffTime / (1000 * 60 * 60 * 24),
        );
        if (daysSinceRegistration >= NEW_USER_GRACE_DAYS) {
          shouldShow = true;
          message = "首次评分";
        } else {
          shouldShow = false;
          message = `新用户免打扰期内, 不予显示`;
        }
      } else {
        // 情况 B: 用户评过分 -> 计算时间差
        const lastDate = new Date(lastFeedback.createdAt);
        const now = new Date();
        const diffTime = now.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > FEEDBACK_COOLDOWN_DAYS) {
          shouldShow = true;
          message = "距离上次评分已超过周期，可以再次评分";
        } else {
          shouldShow = false;
          message = "近期已评分";
        }
      }

      return sendOk(res, 200, "检查反馈状态成功", {
        should_show: shouldShow,
        message,
        last_feedback_date: lastFeedback ? lastFeedback.createdAt : null,
      });
    } catch (error) {
      console.error("检查反馈状态失败:", error);
      sendErr(res, error);
    }
  },
  // 提交评分
  async submitFeedback(req, res) {
    try {
      const { id: userId } = req.user;
      const { score, content } = req.body;

      await Feedback.create({
        userId,
        score: parseInt(score),
        content: content || "",
        appVersion: "v1.0.0", // 可以从 req.headers['x-app-version'] 获取
        platform: "web",
      });

      if (score <= 2) {
        // await sendAlertToAdmin(...)
        console.log(`收到用户 ${userId} 的差评: ${content}`);
      }

      return sendOk(res, 201, "提交反馈成功");
    } catch (error) {
      console.error("提交反馈失败:", error);
      sendErr(res, error);
    }
  },
};

module.exports = feedbackController;
