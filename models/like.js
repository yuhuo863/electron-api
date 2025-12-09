"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Like extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      models.Like.belongsTo(models.Password, {
        foreignKey: "passwordId",
        as: "password",
        onDelete: "CASCADE", // 当密码被删除时, 收藏记录也应该被级联删除
      });
      models.Like.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
        // onDelete: "CASCADE", // 正常用户被删除时, 收藏记录也应该被级联删除, 但当前系统设计为禁用用户
      });
    }
  }
  Like.init(
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
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
    },
    {
      sequelize,
      modelName: "Like",
    },
  );
  return Like;
};
