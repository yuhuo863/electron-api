"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Feedback extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      models.Feedback.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
      });
    }
  }
  Feedback.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      score: {
        type: DataTypes.BIGINT,
        allowNull: false,
        validate: {
          min: 1,
          max: 5, // 数据库层面限制只能是 1-5
        },
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "content",
        defaultValue: "",
      },
      appVersion: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: "app_version",
      },
      platform: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "platform",
        defaultValue: "web",
      },
    },
    {
      sequelize,
      modelName: "Feedback",
      timestamps: true,
      updatedAt: false,
    },
  );
  return Feedback;
};
