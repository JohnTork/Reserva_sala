const express = require("express");

const validSituations = new Set(["pendente", "aprovada", "cancelada"]);

function getSalaId(reserva) {
  return reserva.sala_id ?? (typeof reserva.sala === "object" ? reserva.sala.id : reserva.sala);
}

function getData(reserva) {
  return reserva.data instanceof Date ? reserva.data.toISOString().slice(0, 10) : reserva.data;
}

function getHorario(horario) {
  return horario.slice(0, 5);
}

function canManageReservations(user) {
  return user.permissions.includes("*") || user.permissions.includes("reservations:manage");
}

function canReadOwnReservations(user) {
  return user.permissions.includes("reservations:read_own")
    || user.permissions.includes("reservations:create_own");
}

function canCreateReservations(request, response, next) {
  if (request.user.permissions.includes("*")
    || request.user.permissions.includes("reservations:manage")
    || request.user.permissions.includes("reservations:create_own")) {
    next();
    return;
  }
  response.status(403).json({ error: "Você não tem permissão para criar reservas." });
}

function cabeNaSala(quantidadeAlunos, salaId, salas) {
  if (!Number.isSafeInteger(quantidadeAlunos) || quantidadeAlunos < 1
    || !Number.isSafeInteger(salaId) || !Array.isArray(salas)) {
    return false;
  }

  const sala = salas.find((item) => item.id === salaId);
  return sala !== undefined
    && Number.isSafeInteger(sala.capacidade)
    && sala.capacidade >= quantidadeAlunos;
}

function existeConflito(novaReserva, reservas) {
  if (novaReserva.situacao === "cancelada") {
    return false;
  }

  return reservas.some((reserva) => reserva.situacao !== "cancelada"
    && getSalaId(reserva) === getSalaId(novaReserva)
    && getData(reserva) === getData(novaReserva)
    && getHorario(novaReserva.inicio) < getHorario(reserva.fim)
    && getHorario(novaReserva.fim) > getHorario(reserva.inicio));
}

class ReservationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateReserva(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { errors: { body: "O corpo da requisição deve ser um objeto JSON." } };
  }

  const errors = {};
  const value = {};
  const requiredFields = ["sala_id", "data", "inicio", "fim", "responsavel", "finalidade", "situacao"];

  for (const field of requiredFields) {
    value[field] = body[field];
  }

  if (Object.hasOwn(value, "sala_id")
    && (!Number.isSafeInteger(value.sala_id) || value.sala_id < 1)) {
    errors.sala_id = "Informe um identificador de sala válido.";
  }

  value.quantidade_alunos = body.quantidade_alunos ?? 1;
  if (!Number.isSafeInteger(value.quantidade_alunos) || value.quantidade_alunos < 1) {
    errors.quantidade_alunos = "Informe uma quantidade positiva de alunos.";
  }

  if (Object.hasOwn(value, "data")) {
    const date = value.data;
    const parsedDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00Z`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== date) {
      errors.data = "Informe uma data válida no formato AAAA-MM-DD.";
    }
  }

  for (const field of ["inicio", "fim"]) {
    if (Object.hasOwn(value, field)
      && (typeof value[field] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value[field]))) {
      errors[field] = "Informe um horário válido no formato HH:MM.";
    }
  }

  if (Object.hasOwn(value, "inicio") && Object.hasOwn(value, "fim")
    && typeof value.inicio === "string" && typeof value.fim === "string"
    && value.inicio >= value.fim) {
    errors.fim = "O horário de fim deve ser posterior ao horário de início.";
  }

  for (const [field, maxLength] of [["responsavel", 120], ["finalidade", 500]]) {
    if (Object.hasOwn(value, field)
      && (typeof value[field] !== "string" || value[field].trim().length === 0
        || value[field].trim().length > maxLength)) {
      errors[field] = `Informe um texto de até ${maxLength} caracteres.`;
    } else if (Object.hasOwn(value, field)) {
      value[field] = value[field].trim();
    }
  }

  if (Object.hasOwn(value, "situacao") && !validSituations.has(value.situacao)) {
    errors.situacao = "A situação deve ser pendente, aprovada ou cancelada.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { value };
}

function mapReserva(row) {
  return {
    id: row.id,
    sala: { id: row.sala_id, nome: row.sala_nome },
    data: row.data instanceof Date ? row.data.toISOString().slice(0, 10) : row.data,
    inicio: row.inicio.slice(0, 5),
    fim: row.fim.slice(0, 5),
    responsavel: row.responsavel,
    quantidade_alunos: row.quantidade_alunos,
    finalidade: row.finalidade,
    situacao: row.situacao,
  };
}

async function saveReserva(database, reservaId, values, user) {
  let connection;
  let transactionStarted = false;

  try {
    connection = await database.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    if (reservaId !== undefined) {
      const [existing] = await connection.query(
        "SELECT id, usuario_id, situacao FROM reservas WHERE id = ? FOR UPDATE",
        [reservaId],
      );
      if (existing.length === 0) {
        throw new ReservationError(404, "Reserva não encontrada.");
      }
      if (!canManageReservations(user)
        && (existing[0].usuario_id !== user.id || existing[0].situacao !== "pendente")) {
        throw new ReservationError(403, "Você só pode editar suas próprias reservas pendentes.");
      }
    }

    const [rooms] = await connection.query(
      "SELECT id, nome, capacidade FROM salas WHERE id = ? FOR UPDATE",
      [values.sala_id],
    );
    if (rooms.length === 0) {
      throw new ReservationError(404, "Sala não encontrada.");
    }

    if (!cabeNaSala(values.quantidade_alunos, values.sala_id, rooms)) {
      throw new ReservationError(400, "A quantidade de alunos excede a capacidade da sala.");
    }

    if (values.situacao !== "cancelada") {
      const parameters = [values.sala_id, values.data];
      let exclusion = "";
      if (reservaId !== undefined) {
        exclusion = " AND id <> ?";
        parameters.push(reservaId);
      }

      const [reservas] = await connection.query(
        `SELECT sala_id, data, inicio, fim, situacao FROM reservas
         WHERE sala_id = ? AND data = ?
           AND situacao <> 'cancelada'${exclusion}`,
        parameters,
      );
      if (existeConflito({ ...values }, reservas)) {
        throw new ReservationError(409, "Já existe uma reserva ativa nesse horário para a sala.");
      }
    }

    let id = reservaId;
    if (reservaId === undefined) {
      const [result] = await connection.query(
        `INSERT INTO reservas
         (sala_id, usuario_id, data, inicio, fim, responsavel, finalidade, situacao, quantidade_alunos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          values.sala_id,
          user.id,
          values.data,
          values.inicio,
          values.fim,
          values.responsavel,
          values.finalidade,
          values.situacao,
          values.quantidade_alunos,
        ],
      );
      id = result.insertId;
    } else {
      await connection.query(
        `UPDATE reservas
         SET sala_id = ?, data = ?, inicio = ?, fim = ?, responsavel = ?, finalidade = ?, situacao = ?,
             quantidade_alunos = ?
         WHERE id = ?`,
        [
          values.sala_id,
          values.data,
          values.inicio,
          values.fim,
          values.responsavel,
          values.finalidade,
          values.situacao,
          values.quantidade_alunos,
          reservaId,
        ],
      );
    }

    await connection.commit();
    transactionStarted = false;
    return mapReserva({
      id,
      sala_id: values.sala_id,
      sala_nome: rooms[0].nome,
      ...values,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

function createReservasRouter({ database }) {
  const router = express.Router();

  router.get("/", async (request, response) => {
    if (!canManageReservations(request.user) && !canReadOwnReservations(request.user)) {
      response.status(403).json({ error: "Você não tem permissão para consultar reservas." });
      return;
    }

    try {
      const ownReservationsOnly = !canManageReservations(request.user);
      const [rows] = await database.query(
        `SELECT r.id, r.sala_id, s.nome AS sala_nome, r.data, r.inicio, r.fim,
                r.responsavel, r.finalidade, r.situacao, r.quantidade_alunos, r.usuario_id
         FROM reservas r
         JOIN salas s ON s.id = r.sala_id
         ${ownReservationsOnly ? "WHERE r.usuario_id = ?" : ""}
         ORDER BY r.data, r.inicio, r.id`,
        ownReservationsOnly ? [request.user.id] : [],
      );
      response.json(rows.map(mapReserva));
    } catch (error) {
      console.error("Failed to list reservas:", error);
      response.status(500).json({ error: "Não foi possível listar as reservas." });
    }
  });

  router.post("/", canCreateReservations, async (request, response) => {
    const body = { ...request.body };
    body.responsavel = request.user.nome;
    if (!canManageReservations(request.user) || !Object.hasOwn(body, "situacao")) {
      body.situacao = "pendente";
    }

    const result = validateReserva(body);
    if (result.errors) {
      response.status(400).json({ error: "Dados inválidos.", details: result.errors });
      return;
    }

    try {
      const values = {
        ...result.value,
        responsavel: request.user.nome,
      };
      response.status(201).json(await saveReserva(database, undefined, values, request.user));
    } catch (error) {
      if (error instanceof ReservationError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      console.error("Failed to create reserva:", error);
      response.status(500).json({ error: "Não foi possível criar a reserva." });
    }
  });

  router.get("/:id", async (request, response) => {
    if (!canManageReservations(request.user) && !canReadOwnReservations(request.user)) {
      response.status(403).json({ error: "Você não tem permissão para consultar reservas." });
      return;
    }

    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de reserva inválido." });
      return;
    }

    try {
      const [rows] = await database.query(
        `SELECT r.id, r.sala_id, s.nome AS sala_nome, r.data, r.inicio, r.fim,
                r.responsavel, r.finalidade, r.situacao, r.quantidade_alunos, r.usuario_id
         FROM reservas r
         JOIN salas s ON s.id = r.sala_id
         WHERE r.id = ?`,
        [id],
      );
      if (rows.length === 0) {
        response.status(404).json({ error: "Reserva não encontrada." });
        return;
      }
      if (!canManageReservations(request.user) && rows[0].usuario_id !== request.user.id) {
        response.status(403).json({ error: "Você só pode consultar suas próprias reservas." });
        return;
      }
      response.json(mapReserva(rows[0]));
    } catch (error) {
      console.error("Failed to get reserva:", error);
      response.status(500).json({ error: "Não foi possível buscar a reserva." });
    }
  });

  router.put("/:id", async (request, response) => {
    if (!canManageReservations(request.user)
      && !request.user.permissions.includes("reservations:create_own")) {
      response.status(403).json({ error: "Você não tem permissão para editar reservas." });
      return;
    }

    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de reserva inválido." });
      return;
    }

    const result = validateReserva(request.body);
    if (result.errors) {
      response.status(400).json({ error: "Dados inválidos.", details: result.errors });
      return;
    }

    if (!canManageReservations(request.user) && result.value.situacao !== "pendente") {
      response.status(403).json({ error: "Somente a coordenação pode aprovar ou cancelar reservas." });
      return;
    }

    try {
      const values = canManageReservations(request.user)
        ? result.value
        : { ...result.value, responsavel: request.user.nome };
      response.json(await saveReserva(database, id, values, request.user));
    } catch (error) {
      if (error instanceof ReservationError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      console.error("Failed to update reserva:", error);
      response.status(500).json({ error: "Não foi possível atualizar a reserva." });
    }
  });

  router.delete("/:id", async (request, response) => {
    if (!canManageReservations(request.user)
      && !request.user.permissions.includes("reservations:cancel_own")) {
      response.status(403).json({ error: "Você não tem permissão para cancelar reservas." });
      return;
    }
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Identificador de reserva inválido." });
      return;
    }

    try {
      const manager = canManageReservations(request.user);
      const [result] = manager
        ? await database.query("UPDATE reservas SET situacao = 'cancelada' WHERE id = ?", [id])
        : await database.query(
          `UPDATE reservas SET situacao = 'cancelada'
           WHERE id = ? AND usuario_id = ? AND situacao = 'pendente'`,
          [id, request.user.id],
        );
      if (result.affectedRows === 0) {
        const [rows] = await database.query("SELECT usuario_id, situacao FROM reservas WHERE id = ?", [id]);
        if (rows.length === 0) {
          response.status(404).json({ error: "Reserva não encontrada." });
          return;
        }
        response.status(403).json({
          error: "Você só pode cancelar suas próprias reservas pendentes.",
        });
        return;
      }
      response.status(204).end();
    } catch (error) {
      console.error("Failed to cancel reserva:", error);
      response.status(500).json({ error: "Não foi possível cancelar a reserva." });
    }
  });

  return router;
}

module.exports = { cabeNaSala, createReservasRouter, existeConflito };
