"use strict";
const dayjs = require("dayjs");
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Password extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      models.Password.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
      });
      models.Password.belongsTo(models.Category, {
        foreignKey: "categoryId",
        as: "category",
      });
      models.Password.hasMany(models.PasswordHistory, {
        foreignKey: "passwordId",
        as: "history",
      });
      models.Password.hasMany(models.SecurityLog, {
        foreignKey: "passwordId",
        as: "securityLogs",
      });
      models.Password.belongsToMany(models.User, {
        through: models.Like,
        foreignKey: "passwordId",
        as: "LikeUsers",
      });
    }
  }
  Password.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "category_id",
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      encryptedPassword: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: "encrypted_password",
      },
      url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isFavorite: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_favorite",
      },
      customFields: {
        type: DataTypes.JSON,
        defaultValue: {},
        field: "custom_fields",
      },
      passwordStrength: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "password_strength",
      },
      lastUsed: {
        type: DataTypes.DATE,
        field: "last_used",
        get() {
          if (this.getDataValue("lastUsed")) {
            return dayjs(this.getDataValue("lastUsed")).format(
              "YYYY-MM-DD HH:mm:ss",
            );
          }
          return null;
        },
      },
      createdAt: {
        allowNull: true,
        type: DataTypes.DATE,
        get() {
          return dayjs(this.getDataValue("createdAt")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
      updatedAt: {
        allowNull: true,
        type: DataTypes.DATE,
        get() {
          return dayjs(this.getDataValue("updatedAt")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
      deletedAt: {
        allowNull: true,
        type: DataTypes.DATE,
        get() {
          if (this.getDataValue("deletedAt")) {
            return dayjs(this.getDataValue("deletedAt")).format(
              "YYYY-MM-DD HH:mm:ss",
            );
          }
          return null;
        },
      },
    },
    {
      sequelize,
      modelName: "Password",
      paranoid: true, // 启用软删除
    },
  );
  return Password;
};
