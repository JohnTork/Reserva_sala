const express = require("express");
const { delegablePermissions, requirePermission } = require("./auth");

function coordinatorOnly(request, response, next) {
  if (request.user.perfil !== "coordinator") {
    response.status(403).json({ error: "Somente a coordenação pode gerenciar acessos delegados." });
    return;
  }
  next();
}

function createUsuariosRouter({ database }) {
  const router = express.Router();

  router.get("/limpeza", requirePermission("cleaning:manage"), async (_request, response) => {
    try {
      const [rows] = await database.query(
        `SELECT id, nome, email, perfil, situacao FROM usuarios
         WHERE perfil = 'cleaning' AND situacao = 'ativo' ORDER BY nome`,
      );
      response.json(rows);
    } catch (error) {
      console.error("Failed to list cleaning staff:", error);
      response.status(500).json({ error: "Não foi possível listar a equipe de limpeza." });
    }
  });

  router.get("/", requirePermission("users:manage"), async (_request, response) => {
    try {
      const [rows] = await database.query(
        "SELECT id, nome, email, perfil, situacao, criada_em FROM usuarios ORDER BY criada_em DESC",
      );
      response.json(rows);
    } catch (error) {
      console.error("Failed to list users:", error);
      response.status(500).json({ error: "Não foi possível listar os usuários." });
    }
  });

  router.patch("/:id", requirePermission("users:manage"), async (request, response) => {
    const id = Number(request.params.id);
    const { perfil, situacao } = request.body || {};
    const validRoles = ["substitute", "teacher", "cleaning"];
    const validStatuses = ["ativo", "bloqueado"];

    if (!Number.isSafeInteger(id) || id < 1 || !validRoles.includes(perfil)
      || !validStatuses.includes(situacao)) {
      response.status(400).json({ error: "Informe um perfil e uma situação válidos." });
      return;
    }

    try {
      const [result] = await database.query(
        "UPDATE usuarios SET perfil = ?, situacao = ? WHERE id = ? AND perfil <> 'coordinator'",
        [perfil, situacao, id],
      );
      if (result.affectedRows === 0) {
        response.status(404).json({ error: "Usuário não encontrado ou não pode ser alterado." });
        return;
      }
      response.json({ id, perfil, situacao });
    } catch (error) {
      console.error("Failed to update user:", error);
      response.status(500).json({ error: "Não foi possível atualizar o usuário." });
    }
  });

  router.get("/delegacoes", coordinatorOnly, async (_request, response) => {
    try {
      const [rows] = await database.query(
        `SELECT d.id, d.funcionario_id, u.nome AS funcionario, d.permissao,
                d.expira_em, d.revogada_em
         FROM delegacoes d JOIN usuarios u ON u.id = d.funcionario_id
         ORDER BY d.criada_em DESC`,
      );
      response.json(rows);
    } catch (error) {
      console.error("Failed to list delegations:", error);
      response.status(500).json({ error: "Não foi possível listar as delegações." });
    }
  });

  router.post("/delegacoes", coordinatorOnly, async (request, response) => {
    const { funcionario_id: funcionarioId, permissao, expira_em: expiresAt } = request.body || {};
    if (!Number.isSafeInteger(funcionarioId) || funcionarioId < 1
      || !delegablePermissions.includes(permissao)) {
      response.status(400).json({ error: "Informe um funcionário e uma permissão delegável válidos." });
      return;
    }

    let expiration = null;
    if (expiresAt !== undefined && expiresAt !== null && expiresAt !== "") {
      expiration = new Date(expiresAt);
      if (Number.isNaN(expiration.getTime()) || expiration <= new Date()) {
        response.status(400).json({ error: "A validade da delegação deve ser uma data futura válida." });
        return;
      }
    }

    let connection;
    let transactionStarted = false;
    try {
      connection = await database.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;
      const [users] = await connection.query(
        "SELECT id FROM usuarios WHERE id = ? AND situacao = 'ativo' AND perfil <> 'coordinator' FOR UPDATE",
        [funcionarioId],
      );
      if (users.length === 0) {
        await connection.rollback();
        transactionStarted = false;
        response.status(404).json({ error: "Funcionário ativo não encontrado." });
        return;
      }

      const [result] = await connection.query(
        `INSERT INTO delegacoes (funcionario_id, criado_por, permissao, expira_em)
         VALUES (?, ?, ?, ?)`,
        [funcionarioId, request.user.id, permissao, expiration],
      );
      await connection.commit();
      transactionStarted = false;
      response.status(201).json({
        id: result.insertId,
        funcionario_id: funcionarioId,
        permissao,
        expira_em: expiration,
      });
    } catch (error) {
      if (connection && transactionStarted) {
        await connection.rollback();
      }
      console.error("Failed to create delegation:", error);
      response.status(500).json({ error: "Não foi possível conceder a delegação." });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  router.delete("/delegacoes/:id", coordinatorOnly, async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de delegação inválido." });
      return;
    }
    try {
      const [result] = await database.query(
        "UPDATE delegacoes SET revogada_em = CURRENT_TIMESTAMP WHERE id = ? AND revogada_em IS NULL",
        [id],
      );
      if (result.affectedRows === 0) {
        response.status(404).json({ error: "Delegação ativa não encontrada." });
        return;
      }
      response.status(204).end();
    } catch (error) {
      console.error("Failed to revoke delegation:", error);
      response.status(500).json({ error: "Não foi possível revogar a delegação." });
    }
  });

  return router;
}

module.exports = { createUsuariosRouter };
