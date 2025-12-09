const { Password, Category } = require("../models");
const { encrypt, decrypt } = require("../services/encryptionService");
const { calculatePasswordStrength } = require("../services/passwordService");
const { sendOk, sendErr } = require("../utils/response");
const { logSecurityEvent } = require("../utils/logger");
const csv = require("csv-parser");
const fs = require("fs");

const importExportController = {
  // 导出密码
  async export(req, res) {
    try {
      const { id: userId } = req.user;
      const { format = "json", categoryId } = req.query;

      // 构建查询条件
      const whereClause = {
        userId,
      };

      if (categoryId) {
        whereClause.categoryId = categoryId;
      }

      // 获取密码列表
      const passwords = await Password.findAll({
        where: whereClause,
        include: [
          {
            model: Category,
            as: "category",
            attributes: ["name"],
          },
        ],
        order: [["title", "ASC"]],
      });

      // 解密密码
      const decryptedPasswords = passwords.map((password) => {
        const passwordData = password.toJSON();
        passwordData.password = decrypt(
          passwordData.encryptedPassword,
          process.env.MASTER_PASSWORD,
        );
        delete passwordData.encryptedPassword;
        delete passwordData.userId;
        return passwordData;
      });

      // 记录安全日志
      await logSecurityEvent(userId, "export_data", {
        format,
        count: decryptedPasswords.length,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // 根据格式返回数据
      if (format === "csv") {
        // 转换为CSV格式
        const csvData = convertToCSV(decryptedPasswords);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=passwords.csv",
        );
        return res.send(csvData);
      } else {
        // 返回JSON格式
        return sendOk(res, 200, "密码导出成功", {
          passwords: decryptedPasswords,
        });
      }
    } catch (error) {
      console.error("密码导出失败", error);
      return sendErr(res, error);
    }
  },

  // 导入密码
  // async import(req, res) {
  //   try {
  //     const { id: userId } = req.user;
  //     // 这里的passwords 应该是一个数组，每个元素都是一个对象，包含密码的详细信息。例如：
  //     // [
  //     //     { title: 'Example', password: 'examplepassword', 'category': 'Example Category' },
  //     //     // ... 其他密码条目
  //     // ]
  //     const { format = "json" } = req.body;
  //     const passwords = req.body.passwords;

  //     if (format === "json" && !passwords) {
  //       return sendErr(res, {
  //         isOperational: true,
  //         statusCode: 400,
  //         message: "导入数据格式错误(json)",
  //       });
  //     }

  //     let importedPasswords = [];

  //     if (format === "json") {
  //       // 处理JSON导入
  //       for (const passwordData of passwords) {
  //         try {
  //           // 验证必要字段
  //           if (
  //             !passwordData.title ||
  //             !passwordData.username ||
  //             !passwordData.password
  //           ) {
  //             continue; // 跳过无效条目
  //           }

  //           // 检查是否已存在相同的密码
  //           const existingPassword = await Password.findOne({
  //             where: {
  //               userId,
  //               title: passwordData.title,
  //               username: passwordData.username || "",
  //             },
  //           });

  //           if (existingPassword) {
  //             continue; // 跳过重复条目
  //           }

  //           // 获取或创建分类
  //           let categoryId = null;
  //           if (passwordData.category) {
  //             let category = await Category.findOne({
  //               where: {
  //                 userId,
  //                 name: passwordData.category,
  //               },
  //             });

  //             if (!category) {
  //               category = await Category.create({
  //                 userId,
  //                 name: passwordData.category,
  //                 color: "#3498db",
  //                 icon: "folder",
  //               });
  //             }

  //             categoryId = category.id;
  //           }

  //           // 加密密码
  //           const encryptedPassword = encrypt(
  //             passwordData.password,
  //             process.env.MASTER_PASSWORD,
  //           );

  //           // 计算密码强度
  //           const passwordStrength = calculatePasswordStrength(
  //             passwordData.password,
  //           );

  //           // 创建密码记录
  //           const newPassword = await Password.create({
  //             userId,
  //             categoryId,
  //             title: passwordData.title,
  //             username: passwordData.username || "",
  //             encryptedPassword,
  //             url: passwordData.url || "",
  //             notes: passwordData.notes || "",
  //             customFields: passwordData.customFields || {},
  //             passwordStrength,
  //           });

  //           importedPasswords.push({
  //             id: newPassword.id,
  //             title: newPassword.title,
  //           });
  //         } catch (error) {
  //           console.error("Error importing password:", error);
  //           // 继续处理下一个密码
  //         }
  //       }
  //     } else if (format === "csv" && req.file) {
  //       // 处理CSV导入
  //       const results = [];

  //       return new Promise((resolve, reject) => {
  //         fs.createReadStream(req.file.path)
  //           .pipe(csv()) // 使用csv-parser解析CSV文件
  //           .on("data", (data) => results.push(data))
  //           .on("end", async () => {
  //             try {
  //               for (const passwordData of results) {
  //                 try {
  //                   // 验证必要字段
  //                   if (!passwordData.title || !passwordData.password) {
  //                     continue; // 跳过无效条目
  //                   }

  //                   // 检查是否已存在相同的密码
  //                   const existingPassword = await Password.findOne({
  //                     where: {
  //                       userId,
  //                       title: passwordData.title,
  //                       username: passwordData.username || "",
  //                     },
  //                   });

  //                   if (existingPassword) {
  //                     continue; // 跳过重复条目
  //                   }

  //                   // 查找或创建分类
  //                   let categoryId = null;
  //                   if (passwordData.category) {
  //                     let category = await Category.findOne({
  //                       where: {
  //                         userId,
  //                         name: passwordData.category,
  //                       },
  //                     });

  //                     if (!category) {
  //                       category = await Category.create({
  //                         userId,
  //                         name: passwordData.category,
  //                         color: "#3498db",
  //                         icon: "folder",
  //                       });
  //                     }

  //                     categoryId = category.id;
  //                   }

  //                   // 加密密码
  //                   const encryptedPassword = encrypt(
  //                     passwordData.password,
  //                     process.env.MASTER_PASSWORD,
  //                   );

  //                   // 计算密码强度
  //                   const passwordStrength = calculatePasswordStrength(
  //                     passwordData.password,
  //                   );

  //                   // 创建密码记录
  //                   const newPassword = await Password.create({
  //                     userId,
  //                     categoryId,
  //                     title: passwordData.title,
  //                     username: passwordData.username || "",
  //                     encryptedPassword,
  //                     url: passwordData.url || "",
  //                     notes: passwordData.notes || "",
  //                     passwordStrength,
  //                   });

  //                   importedPasswords.push({
  //                     id: newPassword.id,
  //                     title: newPassword.title,
  //                   });
  //                 } catch (error) {
  //                   console.error("Error importing password:", error);
  //                   // 继续处理下一个密码
  //                 }
  //               }

  //               // 删除临时文件
  //               fs.unlinkSync(req.file.path);

  //               resolve(
  //                 sendOk(res, 200, "密码导入成功", {
  //                   imported: importedPasswords.length,
  //                   passwords: importedPasswords,
  //                 }),
  //               );
  //             } catch (error) {
  //               reject(error);
  //             }
  //           });
  //       });
  //     } else {
  //       return sendErr(res, {
  //         isOperational: true,
  //         statusCode: 400,
  //         message: "不支持的文件格式",
  //       });
  //     }

  //     // 记录安全事件日志
  //     if (importedPasswords.length) {
  //       await logSecurityEvent(userId, "import_data", {
  //         format,
  //         count: passwords ? passwords.length : 0,
  //         ip: req.ip,
  //         userAgent: req.get("User-Agent"),
  //       });
  //     }

  //     return sendOk(res, 200, "密码导入成功", {
  //       imported: importedPasswords.length,
  //       passwords: importedPasswords,
  //     });
  //   } catch (error) {
  //     console.error("密码导入失败", error);
  //     return sendErr(res, error);
  //   }
  // },
  async import(req, res) {
    try {
      const { id: userId } = req.user;

      // 1. 获取 format
      const format = req.query.format || req.body.format || "json";

      let importedPasswords = [];

      if (format === "json") {
        // 2. 正确获取 passwords 数组
        let passwords = [];
        // 导入json格式
        if (Array.isArray(req.body)) {
          passwords = req.body;
        }

        if (!passwords || passwords.length === 0) {
          return sendErr(res, {
            isOperational: true,
            statusCode: 400,
            message: "JSON导入数据格式错误，未检测到密码数组。",
          });
        }

        // 3. 处理导入
        importedPasswords = await processPasswordImport(userId, passwords);

        // 4. JSON 路径日志记录
        if (importedPasswords.length > 0) {
          await logSecurityEvent(userId, "import_data", {
            format,
            count: importedPasswords.length, // 记录实际导入成功的数量
            ip: req.ip,
            userAgent: req.get("User-Agent"),
          });
        }

        return sendOk(res, 200, "密码导入成功", {
          imported: importedPasswords.length,
          // passwords: importedPasswords,
        });
      } else if (format === "csv" && req.file) {
        // 处理CSV导入
        const results = [];

        return new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path, { encoding: "utf8" })
            .pipe(csv())
            .on("data", (data) => {
              const cleanData = {};
              // 遍历所有字段，去除 BOM 字符和首尾空格
              for (const [key, value] of Object.entries(data)) {
                const cleanKey = key.replace(/^\ufeff/, "").trim();
                cleanData[cleanKey] = value;
              }
              results.push(cleanData);
            })
            .on("end", async () => {
              try {
                console.log("开始导入密码1", results);
                importedPasswords = await processPasswordImport(
                  userId,
                  results,
                );

                if (importedPasswords.length > 0) {
                  await logSecurityEvent(userId, "import_data", {
                    format,
                    count: importedPasswords.length, // 记录实际导入成功的数量
                    ip: req.ip,
                    userAgent: req.get("User-Agent"),
                  });
                }

                // 删除临时文件
                fs.unlinkSync(req.file.path);

                resolve(
                  sendOk(res, 200, "密码导入成功", {
                    imported: importedPasswords.length,
                    // passwords: importedPasswords,
                  }),
                );
              } catch (error) {
                // 失败时也删除文件
                if (req.file?.path) fs.unlinkSync(req.file.path);
                reject(error);
              }
            });
        });
      } else {
        // 5. 其他错误路径 (格式不支持或缺少文件)
        return sendErr(res, {
          isOperational: true,
          statusCode: 400,
          message: "不支持的文件格式或缺少文件",
        });
      }
    } catch (error) {
      console.error("密码导入失败", error);
      return sendErr(res, error);
    }
  },
};

// 将数据转换为CSV格式的辅助函数
function convertToCSV(data) {
  if (!data || data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(",");

  const csvRows = data.map((item) => {
    return headers
      .map((header) => {
        const value = item[header];
        // 处理包含逗号或引号的值
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(",");
  });

  return [csvHeaders, ...csvRows].join("\n");
}

async function processPasswordImport(userId, passwordDataList) {
  const importedPasswords = [];

  for (const passwordData of passwordDataList) {
    try {
      // 验证必要字段
      if (
        !passwordData.title ||
        !passwordData.username ||
        !passwordData.password
      ) {
        continue; // 跳过无效条目
      }

      // 检查是否已存在相同的密码
      const existingPassword = await Password.findOne({
        where: {
          userId,
          title: passwordData.title,
          username: passwordData.username || "",
        },
      });

      if (existingPassword) {
        continue; // 跳过重复条目
      }

      // 为导入密码归属到指定分类或默认分类下
      let categoryId = null;
      if (passwordData.category) {
        let category = await Category.findOne({
          where: { userId, name: passwordData.category },
        });

        if (!category) {
          category = await Category.create({
            userId,
            name: passwordData.category,
            color: "#95a5a6",
            icon: "folder",
          });
        }
        categoryId = category.id;
      } else {
        const defaultCategory = await Category.findOne({
          where: { userId, isDefault: true },
        });

        if (!defaultCategory) {
          await Category.create({
            userId,
            name: "Default",
            color: "#3498db",
            icon: "folder",
          });
        }
        categoryId = defaultCategory.id;
      }

      // 加密密码
      const encryptedPassword = encrypt(
        passwordData.password,
        process.env.MASTER_PASSWORD,
      );

      // 计算密码强度
      const passwordStrength = calculatePasswordStrength(passwordData.password);

      // 创建密码记录
      const newPassword = await Password.create({
        userId,
        categoryId,
        title: passwordData.title,
        username: passwordData.username || "",
        encryptedPassword,
        url: passwordData.url || "",
        notes: passwordData.notes || "",
        customFields: passwordData.customFields || {},
        passwordStrength,
      });

      importedPasswords.push({
        id: newPassword.id,
        title: newPassword.title,
      });
    } catch (error) {
      console.error("Error importing password:", error);
      // 继续处理下一个密码
    }
  }
  return importedPasswords;
}

module.exports = importExportController;
