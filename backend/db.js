require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const config = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};

const pool = mysql.createPool({ ...config, database: "tutorhub", dateStrings: true });

const DEFAULT_HOURS = ["09:00", "17:00", "12:00", "13:00", "Mon,Tue,Wed,Thu,Fri"];

const NEW_COLUMNS = {
  users: [
    ["work_start", "TIME NULL"],
    ["work_end", "TIME NULL"],
    ["break_start", "TIME NULL"],
    ["break_end", "TIME NULL"],
    ["days", "VARCHAR(40) NULL"],
  ],
  appointments: [
    ["new_date", "DATE NULL"],
    ["new_start", "TIME NULL"],
    ["new_end", "TIME NULL"],
    ["change_reason", "VARCHAR(255) NULL"],
  ],
};

async function initDb() {
  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  await conn.query(fs.readFileSync(path.join(__dirname, "../database/schema.sql"), "utf8"));
  await conn.end();

  for (const [table, columns] of Object.entries(NEW_COLUMNS))
    for (const [column, type] of columns) {
      const [[{ n }]] = await pool.query(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'tutorhub' AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        [table, column],
      );
      if (!n) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`Database updated: added ${table}.${column}`);
      }
    }
  await pool.query(
    "UPDATE users SET work_start = ?, work_end = ?, break_start = ?, break_end = ?, days = ? WHERE role = 'tutor' AND work_start IS NULL",
    DEFAULT_HOURS,
  );

  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users");
  if (n > 0) return;
  const h = (p) => bcrypt.hashSync(p, 10);
  await pool.query(
    "INSERT INTO users (name, email, password, role, subjects, rate, work_start, work_end, break_start, break_end, days, bio) VALUES ?",
    [
      [
        ["Student Demo", "student@demo.com", h("student123"), "student", null, null, null, null, null, null, null, null],
        ["Maria Santos", "maria@demo.com", h("tutor123"), "tutor", "Math,Physics", 350, ...DEFAULT_HOURS.slice(0, 4), DEFAULT_HOURS[4], "Math and science tutor"],
        ["John Reyes", "john@demo.com", h("tutor123"), "tutor", "Programming,English", 400, ...DEFAULT_HOURS.slice(0, 4), DEFAULT_HOURS[4], "IT and English tutor"],
        ["Admin", "admin@demo.com", h("admin123"), "admin", null, null, null, null, null, null, null, null],
      ],
    ],
  );
  console.log("Demo accounts created.");
}

module.exports = { pool, initDb, DEFAULT_HOURS };
