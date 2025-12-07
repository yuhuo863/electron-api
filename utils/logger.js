const { SecurityLog } = require("../models");
const { createLogger, format, transports } = require("winston");
const MySQLTransport = require("winston-mysql");

const env = process.env.NODE_ENV || "development";
const config = require(__dirname + "/../config/config.json")[env];
const options = {
  host: config.host,
  user: config.username,
  password: config.password,
  database: config.database,
  table: "Logs",
};

const logger = createLogger({
  level: "info", // 默认日志级别
  format: format.combine(
    format.errors({ stack: true }), // 显示堆栈跟踪
    format.json(), // 输出JSON格式的日志
  ),
  defaultMeta: { service: "keyVault-log-service" }, // 默认元数据
  transports: [
    new MySQLTransport(options), // 数据库日志传输
  ],
});

if (env !== "production") {
  logger.add(
    new transports.Console({
      // 控制台日志传输
      format: format.combine(
        format.colorize(), // 彩色输出
        format.simple(), // 简单输出
      ),
    }),
  );
}

async function logSecurityEvent(
  userId,
  action,
  details = {},
  passwordId = null,
  transaction = null,
) {
  try {
    await SecurityLog.create(
      {
        userId,
        passwordId, // 确保传入passwordId, 如果对应的密码被删除, 该条安全日志会被自动删除
        action,
        details,
        ipAddress: details.ip || null,
        userAgent: details.userAgent || null,
      },
      { transaction },
    );
  } catch (error) {
    console.error("Error logging security event:", error);
  }
}

module.exports = {
  logSecurityEvent,
  logger,
};
