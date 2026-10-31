const mysql = require("mysql2/promise");

const requiredVariables = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  throw new Error(`Missing database configuration: ${missingVariables.join(", ")}`);
}

const port = Number(process.env.DB_PORT || 3306);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be a valid TCP port");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nome VARCHAR(120) NOT NULL,
      andar VARCHAR(50) NOT NULL,
      capacidade SMALLINT UNSIGNED NOT NULL,
      recursos JSON NOT NULL,
      criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
  `);
}

module.exports = { pool, initializeDatabase };
