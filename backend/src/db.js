const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "english_words",
  user: process.env.DB_USER || "english_words_user",
  password: process.env.DB_PASSWORD || "english_words_password",
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
