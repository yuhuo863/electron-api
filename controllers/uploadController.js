const { sendOk, sendErr } = require("../utils/response");
const { singleFileUpload } = require("../utils/aliyun");

const uploadController = {
  upload(req, res) {
    try {
      singleFileUpload(req, res, function (error) {
        if (error) {
          return sendErr(res, error);
        }
        if (!req.file) {
          return sendErr(res, {
            isOperational: true,
            statusCode: 400,
            message: "请选择要上传的文件",
          });
        }
        return sendOk(res, 200, "上传成功", { file: req.file });
      });
    } catch (error) {
      return sendErr(res, error);
    }
  },
};

module.exports = uploadController;
