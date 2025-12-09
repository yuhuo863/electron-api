const loadEnv = require("./utils/loadEnv");
loadEnv(__dirname);

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const { join } = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const routes = require("./routes/index");
const cors = require("cors");

const app = express();

// 解决跨域问题
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // 允许携带cookie
    optionsSuccessStatus: 200, // 让OPTIONS请求返回200状态码, 默认是204
    maxAge: 86400, // 预检请求的缓存时间，单位是秒 24小时
  }),
);

// 启动邮件消费者
const { mailConsumer } = require("./utils/rabbitMQ");
(async () => {
  await mailConsumer();
  console.log("邮件消费者已启动");
})();

// 安全中间件
app.use(helmet());

// 压缩响应内容中间件
app.use(compression());

// 请求日志中间件
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// 解析cookie中间件
app.use(cookieParser());
// 静态文件中间件
app.use(express.static(join(__dirname, "public")));

app.use("/api", routes);

module.exports = app;
