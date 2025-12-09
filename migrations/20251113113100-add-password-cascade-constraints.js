"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("PasswordHistories", {
      fields: ["password_id"],
      type: "foreign key",
      name: "fk_password_history_password_id",
      references: {
        table: "passwords",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addConstraint("SecurityLogs", {
      fields: ["password_id"],
      type: "foreign key",
      name: "fk_security_logs_password_id",
      references: {
        table: "passwords",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "PasswordHistories",
      "fk_password_history_password_id",
    );
    await queryInterface.removeConstraint(
      "SecurityLogs",
      "fk_security_logs_password_id",
    );
  },
};
