"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Feedbacks", {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        field: "user_id",
        comment: "关联的用户ID",
      },
      score: {
        type: Sequelize.BIGINT,
        allowNull: false,
        field: "score",
        comment: "评分数值: 1-5",
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
        field: "content",
        comment: "用户的文字反馈建议",
      },
      appVersion: {
        type: Sequelize.STRING,
        allowNull: true,
        field: "app_version",
        comment: "提交反馈时的系统版本号",
      },
      platform: {
        type: Sequelize.STRING,
        defaultValue: "web",
        field: "platform",
        comment: "提交反馈时的平台类型",
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "提交时间",
      },
    });
    await queryInterface.addIndex("Feedbacks", {
      fields: ["user_id"],
      name: "idx_feedbacks_user_id",
      unique: false,
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Feedbacks");
    await queryInterface.removeIndex("Feedbacks", "idx_feedbacks_user_id");
  },
};
