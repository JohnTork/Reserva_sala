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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      sala_id INT UNSIGNED NOT NULL,
      data DATE NOT NULL,
      inicio TIME NOT NULL,
      fim TIME NOT NULL,
      responsavel VARCHAR(120) NOT NULL,
      finalidade VARCHAR(500) NOT NULL,
      situacao ENUM('pendente', 'aprovada', 'cancelada') NOT NULL DEFAULT 'pendente',
      criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_reservas_sala_data_horario (sala_id, data, situacao, inicio, fim),
      CONSTRAINT fk_reservas_sala FOREIGN KEY (sala_id) REFERENCES salas (id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nome VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL,
      senha_hash VARCHAR(200) NOT NULL,
      perfil ENUM('coordinator', 'substitute', 'teacher', 'cleaning') NOT NULL,
      situacao ENUM('pendente', 'ativo', 'bloqueado') NOT NULL DEFAULT 'pendente',
      criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_usuarios_email (email)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessoes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expira_em DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_sessoes_token_hash (token_hash),
      INDEX idx_sessoes_usuario (usuario_id),
      CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS delegacoes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      funcionario_id INT UNSIGNED NOT NULL,
      criado_por INT UNSIGNED NOT NULL,
      permissao ENUM('rooms:manage', 'reservations:manage', 'cleaning:manage') NOT NULL,
      expira_em DATETIME NULL,
      revogada_em DATETIME NULL,
      criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_delegacoes_funcionario (funcionario_id, revogada_em, expira_em),
      CONSTRAINT fk_delegacoes_funcionario FOREIGN KEY (funcionario_id) REFERENCES usuarios (id),
      CONSTRAINT fk_delegacoes_criador FOREIGN KEY (criado_por) REFERENCES usuarios (id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tarefas_limpeza (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      sala_id INT UNSIGNED NOT NULL,
      funcionario_id INT UNSIGNED NOT NULL,
      data DATE NOT NULL,
      descricao VARCHAR(500) NOT NULL,
      situacao ENUM('pendente', 'concluida') NOT NULL DEFAULT 'pendente',
      criada_por INT UNSIGNED NOT NULL,
      criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      concluida_em DATETIME NULL,
      PRIMARY KEY (id),
      INDEX idx_tarefas_funcionario (funcionario_id, data, situacao),
      CONSTRAINT fk_tarefas_sala FOREIGN KEY (sala_id) REFERENCES salas (id),
      CONSTRAINT fk_tarefas_funcionario FOREIGN KEY (funcionario_id) REFERENCES usuarios (id),
      CONSTRAINT fk_tarefas_criador FOREIGN KEY (criada_por) REFERENCES usuarios (id)
    ) ENGINE=InnoDB
  `);

  await ensureColumn("reservas", "usuario_id", "INT UNSIGNED NULL");
  await ensureColumn("reservas", "quantidade_alunos", "SMALLINT UNSIGNED NOT NULL DEFAULT 1");
}

async function ensureColumn(table, column, definition) {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.DB_NAME, table, column],
  );
  if (columns.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

module.exports = { pool, initializeDatabase };
