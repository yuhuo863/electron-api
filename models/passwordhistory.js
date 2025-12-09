"use strict";
const dayjs = require("dayjs");
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class PasswordHistory extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      models.PasswordHistory.belongsTo(models.Password, {
        foreignKey: "passwordId",
        as: "password",
        onDelete: "CASCADE", // 当密码被删除时，与之相关的密码历史记录也应被级联删除
      });
    }
  }
  PasswordHistory.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      passwordId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "password_id",
      },
      encryptedPassword: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "encrypted_password",
      },
      changedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: "changed_at",
        get() {
          return dayjs(this.getDataValue("changedAt")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
    },
    {
      sequelize,
      modelName: "PasswordHistory",
      timestamps: false,
    },
  );
  return PasswordHistory;
};
