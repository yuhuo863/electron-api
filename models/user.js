"use strict";
const { Model, Op } = require("sequelize");
const bcrypt = require("bcrypt");
const { BadRequest } = require("http-errors");
const dayjs = require("dayjs");

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      models.User.hasMany(models.Password, {
        foreignKey: "userId",
        as: "passwords",
      });
      models.User.hasMany(models.Category, {
        foreignKey: "userId",
        as: "categories",
      });
      models.User.hasMany(models.Session, {
        foreignKey: "userId",
        as: "sessions",
      });
      models.User.hasMany(models.SecurityLog, {
        foreignKey: "userId",
        as: "securityLogs",
      });
      models.User.belongsToMany(models.Password, {
        through: models.Like,
        foreignKey: "userId",
        // 定义别名后,可以在查询到的user对象上直接使用getLikedPasswords进行查询收藏过的密码记录/countLikedPasswords进行计数
        // 例如: user.getLikedPasswords()/user.countLikedPasswords()
        as: "likedPasswords",
      });
      // 扩展用户定期评分, 此时用户可以拥有多个评分记录
      models.User.hasMany(models.Feedback, {
        foreignKey: "userId",
        as: "feedbacks",
      });
    }

    async compareRefreshToken(refreshToken) {
      if (!this.refreshTokenHash) return false;
      return await bcrypt.compare(refreshToken, this.refreshTokenHash);
    }

    // 请求刷新令牌接口需要通过 refreshToken 查找用户
    static async findByRefreshToken(userId, refreshToken) {
      if (!userId || !refreshToken) return null;
      const user = await this.scope("withHashes").findOne({
        where: {
          id: userId,
          refreshTokenHash: {
            [Op.ne]: null, // 确保用户有 hash
          },
        },
        raw: false, // 返回完整的模型实例，而不是原始对象
      });

      if (!user) return null; // 用户不存在或没有 hash

      const isMatch = await user.compareRefreshToken(refreshToken);
      if (isMatch) {
        return user; // 刷新令牌匹配，返回用户实例
      }
      return null; // 刷新令牌不匹配，返回 null
    }
  }
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          len: [3, 50],
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      avatar: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "avatar",
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "password_hash",
        set(value) {
          if (!value) throw new BadRequest("Password is required");
          if (value.length < 8 || value.length > 36)
            throw new BadRequest(
              "Password must be between 8 and 36 characters",
            );
          this.setDataValue("passwordHash", bcrypt.hashSync(value, 10));
        },
      },
      tokenVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        field: "token_version",
      },
      refreshTokenHash: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "refresh_token_hash",
      },
      role: {
        type: DataTypes.ENUM("admin", "user", "vip"),
        defaultValue: "user",
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_active",
      },
      lastLogin: {
        type: DataTypes.DATE,
        field: "last_login",
        get() {
          if (!this.getDataValue("lastLogin")) return null;
          return dayjs(this.getDataValue("lastLogin")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
      failedLoginAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "failed_login_attempts",
      },
      lockedUntil: {
        type: DataTypes.DATE,
        field: "locked_until",
        get() {
          if (!this.getDataValue("lockedUntil")) return null;
          return dayjs(this.getDataValue("lockedUntil")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
      masterPasswordHint: {
        type: DataTypes.STRING,
        field: "master_password_hint",
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE,
        get() {
          if (!this.getDataValue("createdAt")) return null;
          return dayjs(this.getDataValue("createdAt")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE,
        get() {
          if (!this.getDataValue("updatedAt")) return null;
          return dayjs(this.getDataValue("updatedAt")).format(
            "YYYY-MM-DD HH:mm:ss",
          );
        },
      },
    },
    {
      hooks: {},
      sequelize,
      modelName: "User",
      defaultScope: {
        attributes: {
          exclude: ["passwordHash", "refreshTokenHash"], // 默认不查询密码哈希和刷新令牌哈希
        },
      },
      scopes: {
        withHashes: {
          attributes: {
            include: ["passwordHash", "refreshTokenHash"], // 用于需要密码哈希和刷新令牌哈希的查询，例如登录验证/刷新令牌验证
          },
        },
      },
    },
  );
  return User;
};
