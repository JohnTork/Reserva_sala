const express = require("express");

const resourceLimit = 50;

function validateSala(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { errors: { body: "O corpo da requisição deve ser um objeto JSON." } };
  }

  const errors = {};

  if (typeof body.nome !== "string" || body.nome.trim().length === 0 || body.nome.trim().length > 120) {
    errors.nome = "Informe um nome com até 120 caracteres.";
  }

  if (typeof body.andar !== "string" || body.andar.trim().length === 0 || body.andar.trim().length > 50) {
    errors.andar = "Informe um andar com até 50 caracteres.";
  }

  if (!Number.isInteger(body.capacidade) || body.capacidade < 1 || body.capacidade > 65535) {
    errors.capacidade = "A capacidade deve ser um número inteiro entre 1 e 65535.";
  }

  if (!Array.isArray(body.recursos) || body.recursos.length > resourceLimit
    || body.recursos.some((resource) => typeof resource !== "string"
      || resource.trim().length === 0 || resource.trim().length > 100)) {
    errors.recursos = "Informe uma lista de até 50 recursos, com nomes de até 100 caracteres.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    value: {
      nome: body.nome.trim(),
      andar: body.andar.trim(),
      capacidade: body.capacidade,
      recursos: [...new Set(body.recursos.map((resource) => resource.trim()))],
    },
  };
}

function parseResources(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function mapSala(row) {
  return {
    id: row.id,
    nome: row.nome,
    andar: row.andar,
    capacidade: row.capacidade,
    recursos: parseResources(row.recursos),
  };
}

function createSalasRouter({ database }) {
  const router = express.Router();

  router.get("/", async (_request, response) => {
    try {
      const [rows] = await database.query(
        "SELECT id, nome, andar, capacidade, recursos FROM salas ORDER BY nome, id",
      );
      response.json(rows.map(mapSala));
    } catch (error) {
      console.error("Failed to list salas:", error);
      response.status(500).json({ error: "Não foi possível listar as salas." });
    }
  });

  router.post("/", async (request, response) => {
    const result = validateSala(request.body);

    if (result.errors) {
      response.status(400).json({ error: "Dados inválidos.", details: result.errors });
      return;
    }

    try {
      const { nome, andar, capacidade, recursos } = result.value;
      const [insertResult] = await database.query(
        "INSERT INTO salas (nome, andar, capacidade, recursos) VALUES (?, ?, ?, ?)",
        [nome, andar, capacidade, JSON.stringify(recursos)],
      );
      response.status(201).json({
        id: insertResult.insertId,
        nome,
        andar,
        capacidade,
        recursos,
      });
    } catch (error) {
      console.error("Failed to create sala:", error);
      response.status(500).json({ error: "Não foi possível criar a sala." });
    }
  });

  router.get("/:id", async (request, response) => {
    const id = Number(request.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de sala inválido." });
      return;
    }

    try {
      const [rows] = await database.query(
        "SELECT id, nome, andar, capacidade, recursos FROM salas WHERE id = ?",
        [id],
      );

      if (rows.length === 0) {
        response.status(404).json({ error: "Sala não encontrada." });
        return;
      }

      response.json(mapSala(rows[0]));
    } catch (error) {
      console.error("Failed to get sala:", error);
      response.status(500).json({ error: "Não foi possível buscar a sala." });
    }
  });

  router.put("/:id", async (request, response) => {
    const id = Number(request.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de sala inválido." });
      return;
    }

    const result = validateSala(request.body);

    if (result.errors) {
      response.status(400).json({ error: "Dados inválidos.", details: result.errors });
      return;
    }

    try {
      const { nome, andar, capacidade, recursos } = result.value;
      const [updateResult] = await database.query(
        "UPDATE salas SET nome = ?, andar = ?, capacidade = ?, recursos = ? WHERE id = ?",
        [nome, andar, capacidade, JSON.stringify(recursos), id],
      );

      if (updateResult.affectedRows === 0) {
        const [rows] = await database.query("SELECT id FROM salas WHERE id = ?", [id]);

        if (rows.length === 0) {
          response.status(404).json({ error: "Sala não encontrada." });
          return;
        }
      }

      response.json({ id, nome, andar, capacidade, recursos });
    } catch (error) {
      console.error("Failed to update sala:", error);
      response.status(500).json({ error: "Não foi possível atualizar a sala." });
    }
  });

  router.delete("/:id", async (request, response) => {
    const id = Number(request.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de sala inválido." });
      return;
    }

    try {
      const [deleteResult] = await database.query("DELETE FROM salas WHERE id = ?", [id]);

      if (deleteResult.affectedRows === 0) {
        response.status(404).json({ error: "Sala não encontrada." });
        return;
      }

      response.status(204).end();
    } catch (error) {
      console.error("Failed to delete sala:", error);
      response.status(500).json({ error: "Não foi possível excluir a sala." });
    }
  });

  return router;
}

module.exports = { createSalasRouter };
