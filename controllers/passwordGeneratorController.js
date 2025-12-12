const {
  generateRandomPassword,
  generateSuperStrongPassword,
} = require("../services/encryptionService");
const { calculatePasswordStrength } = require("../services/passwordService");
const { sendOk, sendErr } = require("../utils/response");

const passwordGeneratorController = {
  // 生成随机密码
  async generate(req, res) {
    try {
      const {
        length = 12,
        includeUppercase = true,
        includeLowercase = true,
        includeNumbers = true,
        includeSymbols = true,
        excludeSimilar = true,
        excludeAmbiguous = true,
        superStrong = false, // 生成超强密码，默认不开启
        // 添加其他配置选项...
      } = req.body;

      if (length < 4 || length > 128) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "密码长度必须在4到128之间",
        });
      }
      if (
        !includeUppercase &&
        !includeLowercase &&
        !includeNumbers &&
        !includeSymbols
      ) {
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "密码必须包含至少一种字符类型(",
        });
      }

      let password = generateRandomPassword(length, {
        includeUppercase,
        includeLowercase,
        includeNumbers,
        includeSymbols,
        excludeSimilar,
        excludeAmbiguous,
      });

      // 生成超强密码
      if (superStrong) {
        password = generateSuperStrongPassword(); // 默认长度为64个字符
      }

      // 计算密码强度评分
      const passwordStrength = calculatePasswordStrength(password);
      return sendOk(
        res,
        200,
        `${superStrong ? "超强密码" : "随机密码"}生成成功`,
        {
          password,
          strength: passwordStrength,
        },
      );
    } catch (error) {
      console.error("生成随机密码失败", error);
      return sendErr(res, error);
    }
  },
};

module.exports = passwordGeneratorController;
