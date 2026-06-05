const fs = require("fs");
const path = require("path");
const db = require("./db");

async function initDb() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8").replace(/^\uFEFF/, "");
  await db.query(schemaSql);
}

module.exports = { initDb };
