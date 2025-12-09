"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("Likes", {
      type: "foreign key",
      name: "fk_likes_passwords_id",
      fields: ["password_id"],
      references: {
        table: "passwords",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint("Likes", "fk_likes_passwords_id");
  },
};
