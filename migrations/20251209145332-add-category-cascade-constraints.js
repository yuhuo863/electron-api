"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("Passwords", {
      fields: ["category_id"],
      type: "foreign key",
      name: "fk_passwords_category_id",
      references: {
        table: "categories",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "Passwords",
      "fk_passwords_category_id",
    );
  },
};
