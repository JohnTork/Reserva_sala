const express = require("express");
const { requirePermission } = require("./auth");

function createTarefasLimpezaRouter({ database }) {
  const router = express.Router();

  router.get("/", async (request, response) => {
    if (!request.user.permissions.includes("*")
      && !request.user.permissions.includes("cleaning:manage")
      && !request.user.permissions.includes("cleaning:read_own")) {
      response.status(403).json({ error: "Você não tem permissão para consultar tarefas." });
      return;
    }

    try {
      const ownTasksOnly = request.user.perfil === "cleaning"
        && !request.user.permissions.includes("cleaning:manage")
        && !request.user.permissions.includes("*");
      const [rows] = await database.query(
        `SELECT t.id, t.sala_id, s.nome AS sala_nome, t.funcionario_id,
                u.nome AS funcionario, t.data, t.descricao, t.situacao,
                t.criada_por, t.concluida_em
         FROM tarefas_limpeza t
         JOIN salas s ON s.id = t.sala_id
         JOIN usuarios u ON u.id = t.funcionario_id
         ${ownTasksOnly ? "WHERE t.funcionario_id = ?" : ""}
         ORDER BY t.data, t.id`,
        ownTasksOnly ? [request.user.id] : [],
      );
      response.json(rows);
    } catch (error) {
      console.error("Failed to list cleaning tasks:", error);
      response.status(500).json({ error: "Não foi possível listar as tarefas." });
    }
  });

  router.post("/", requirePermission("cleaning:manage"), async (request, response) => {
    const { sala_id: roomId, funcionario_id: employeeId, data, descricao } = request.body || {};
    if (!Number.isSafeInteger(roomId) || roomId < 1
      || !Number.isSafeInteger(employeeId) || employeeId < 1
      || typeof data !== "string" || !isValidDate(data)
      || typeof descricao !== "string" || descricao.trim().length === 0 || descricao.trim().length > 500) {
      response.status(400).json({ error: "Informe sala, funcionário, data e descrição válidos." });
      return;
    }

    try {
      const [rooms] = await database.query("SELECT id FROM salas WHERE id = ?", [roomId]);
      if (rooms.length === 0) {
        response.status(404).json({ error: "Sala não encontrada." });
        return;
      }
      const [employees] = await database.query(
        "SELECT id FROM usuarios WHERE id = ? AND perfil = 'cleaning' AND situacao = 'ativo'",
        [employeeId],
      );
      if (employees.length === 0) {
        response.status(400).json({ error: "O funcionário selecionado não tem perfil ativo de limpeza." });
        return;
      }
      const [result] = await database.query(
        `INSERT INTO tarefas_limpeza (sala_id, funcionario_id, data, descricao, criada_por)
         VALUES (?, ?, ?, ?, ?)`,
        [roomId, employeeId, data, descricao.trim(), request.user.id],
      );
      response.status(201).json({
        id: result.insertId,
        sala_id: roomId,
        funcionario_id: employeeId,
        data,
        descricao: descricao.trim(),
        situacao: "pendente",
      });
    } catch (error) {
      if (error.code === "ER_NO_REFERENCED_ROW_2") {
        response.status(404).json({ error: "Sala não encontrada." });
        return;
      }
      console.error("Failed to create cleaning task:", error);
      response.status(500).json({ error: "Não foi possível criar a tarefa." });
    }
  });

  router.patch("/:id/concluir", requirePermission("cleaning:update_own"), async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de tarefa inválido." });
      return;
    }
    try {
      const [result] = await database.query(
        `UPDATE tarefas_limpeza SET situacao = 'concluida', concluida_em = CURRENT_TIMESTAMP
         WHERE id = ? AND funcionario_id = ? AND situacao = 'pendente'`,
        [id, request.user.id],
      );
      if (result.affectedRows === 0) {
        response.status(404).json({ error: "Tarefa pendente não encontrada para este funcionário." });
        return;
      }
      response.json({ id, situacao: "concluida" });
    } catch (error) {
      console.error("Failed to complete cleaning task:", error);
      response.status(500).json({ error: "Não foi possível concluir a tarefa." });
    }
  });

  return router;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

module.exports = { createTarefasLimpezaRouter };
