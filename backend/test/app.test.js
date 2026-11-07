const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const request = require("supertest");
const { createApp: createBaseApp } = require("../src/app");
const { cabeNaSala, existeConflito } = require("../src/reservas");

function createAppAs(options, user) {
  return createBaseApp({
    ...options,
    authentication: (request, _response, next) => {
      request.user = user;
      next();
    },
  });
}

function createApp(options) {
  return createAppAs(options, {
    id: 1,
    nome: "Ana Souza",
    email: "ana@example.com",
    perfil: "coordinator",
    situacao: "ativo",
    permissions: ["*"],
  });
}

let originalConsoleError;

before(() => {
  originalConsoleError = console.error;
  console.error = () => {};
});

after(() => {
  console.error = originalConsoleError;
});

test("GET /api/health reports that the API is available", async () => {
  const app = createApp({ database: { query: async () => [] } });
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("GET /api/health/db confirms a successful database connection", async () => {
  const database = {
    query: async (sql) => {
      assert.equal(sql, "SELECT 1");
      return [[{ 1: 1 }], []];
    },
  };
  const app = createApp({ database });
  const response = await request(app).get("/api/health/db");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", database: "connected" });
});

test("GET /api/health/db reports database failures without exposing details", async () => {
  const app = createApp({
    database: { query: async () => { throw new Error("private connection detail"); } },
  });
  const response = await request(app).get("/api/health/db");

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: "error", database: "unavailable" });
  assert.equal(JSON.stringify(response.body).includes("private connection detail"), false);
});

test("POST /api/salas creates a room and returns its fields", async () => {
  const database = {
    query: async (sql, values) => {
      assert.match(sql, /^INSERT INTO salas/);
      assert.deepEqual(values, ["Sala 101", "1º andar", 12, '["Quadro","Datashow"]']);
      return [{ insertId: 7 }, []];
    },
  };
  const app = createApp({ database });
  const response = await request(app).post("/api/salas").send({
    nome: " Sala 101 ",
    andar: " 1º andar ",
    capacidade: 12,
    recursos: ["Quadro", " Datashow ", "Quadro"],
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    id: 7,
    nome: "Sala 101",
    andar: "1º andar",
    capacidade: 12,
    recursos: ["Quadro", "Datashow"],
  });
});

test("POST /api/salas rejects invalid room data", async () => {
  const app = createApp({ database: { query: async () => { throw new Error("should not query"); } } });
  const response = await request(app).post("/api/salas").send({
    nome: "",
    andar: "Térreo",
    capacidade: 0,
    recursos: "Datashow",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys(response.body.details).sort(), ["capacidade", "nome", "recursos"]);
});

test("POST /api/salas rejects capacity above 30 outside the auditorium", async () => {
  const app = createApp({ database: { query: async () => { throw new Error("should not query"); } } });
  const response = await request(app).post("/api/salas").send({
    nome: "Sala grande",
    andar: "Térreo",
    capacidade: 31,
    recursos: [],
  });

  assert.equal(response.status, 400);
  assert.match(response.body.details.capacidade, /auditório/);
});

test("GET /api/salas lists rooms and decodes JSON resources", async () => {
  const database = {
    query: async (sql) => {
      assert.match(sql, /ORDER BY nome, id/);
      return [[{
        id: 3,
        nome: "Sala 3",
        andar: "Térreo",
        capacidade: 20,
        recursos: '["Quadro"]',
      }], []];
    },
  };
  const app = createApp({ database });
  const response = await request(app).get("/api/salas");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body[0].recursos, ["Quadro"]);
});

test("GET /api/salas/:id returns 404 when the room does not exist", async () => {
  const app = createApp({ database: { query: async () => [[], []] } });
  const response = await request(app).get("/api/salas/99");

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Sala não encontrada." });
});

test("PUT /api/salas/:id updates a room", async () => {
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql) => {
      if (sql.includes("SELECT id FROM salas")) {
        return [[{ id: 2 }], []];
      }
      if (sql.includes("SELECT COUNT(*)")) {
        return [[{ total: 0 }], []];
      }
      assert.match(sql, /^UPDATE salas/);
      return [{ affectedRows: 1 }, []];
    },
  };
  const database = {
    getConnection: async () => connection,
  };
  const app = createApp({ database });
  const response = await request(app).put("/api/salas/2").send({
    nome: "Sala atualizada",
    andar: "2º andar",
    capacidade: 8,
    recursos: [],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: 2,
    nome: "Sala atualizada",
    andar: "2º andar",
    capacidade: 8,
    recursos: [],
  });
});

test("DELETE /api/salas/:id deletes a room", async () => {
  const database = {
    query: async (sql, values) => {
      assert.match(sql, /^DELETE FROM salas/);
      assert.deepEqual(values, [4]);
      return [{ affectedRows: 1 }, []];
    },
  };
  const app = createApp({ database });
  const response = await request(app).delete("/api/salas/4");

  assert.equal(response.status, 204);
  assert.equal(response.text, "");
});

test("POST /api/reservas creates a pending reservation", async () => {
  const statements = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes("FROM salas")) {
        return [[{ id: 2, nome: "Sala 202", capacidade: 30 }], []];
      }
      if (sql.includes("FROM reservas")) {
        return [[], []];
      }
      if (sql.includes("INSERT INTO reservas")) {
        return [{ insertId: 11 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const app = createApp({ database: { getConnection: async () => connection } });
  const response = await request(app).post("/api/reservas").send({
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:00",
    fim: "10:00",
    responsavel: "  Ana Souza ",
    finalidade: " Aula ",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    id: 11,
    sala: { id: 2, nome: "Sala 202" },
    data: "2026-11-10",
    inicio: "09:00",
    fim: "10:00",
    responsavel: "Ana Souza",
    quantidade_alunos: 1,
    finalidade: "Aula",
    situacao: "pendente",
  });
  assert.ok(statements.some(({ sql }) => sql.includes("FOR UPDATE")));
});

test("POST /api/reservas rejects invalid dates, times and situations", async () => {
  const app = createApp({ database: { getConnection: async () => { throw new Error("should not connect"); } } });
  const response = await request(app).post("/api/reservas").send({
    sala_id: 1,
    data: "2026-02-31",
    inicio: "14:00",
    fim: "13:00",
    responsavel: "Professor",
    finalidade: "Aula",
    situacao: "em análise",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys(response.body.details).sort(), ["data", "fim", "situacao"]);
});

test("POST /api/reservas rejects overlapping reservations in the same room", async () => {
  let rolledBack = false;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => { rolledBack = true; },
    release: () => {},
    query: async (sql) => {
      if (sql.includes("FROM salas")) {
        return [[{ id: 2, nome: "Sala 202", capacidade: 30 }], []];
      }
      if (sql.includes("FROM reservas")) {
        return [[{
          sala_id: 2,
          data: "2026-11-10",
          inicio: "09:00:00",
          fim: "10:00:00",
          situacao: "aprovada",
        }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const app = createApp({ database: { getConnection: async () => connection } });
  const response = await request(app).post("/api/reservas").send({
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:30",
    fim: "10:30",
    responsavel: "Ana Souza",
    finalidade: "Aula",
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /reserva ativa/);
  assert.equal(rolledBack, true);
});

test("POST /api/reservas rejects a class larger than the room capacity", async () => {
  let rolledBack = false;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => { rolledBack = true; },
    release: () => {},
    query: async (sql) => {
      assert.match(sql, /FROM salas/);
      return [[{ id: 2, nome: "Sala 202", capacidade: 30 }], []];
    },
  };
  const app = createApp({ database: { getConnection: async () => connection } });
  const response = await request(app).post("/api/reservas").send({
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:00",
    fim: "10:00",
    quantidade_alunos: 31,
    finalidade: "Aula",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /capacidade/);
  assert.equal(rolledBack, true);
});

test("teachers cannot manage rooms", async () => {
  const app = createAppAs({
    database: { query: async () => { throw new Error("should not query"); } },
  }, {
    id: 8,
    nome: "Professor",
    email: "professor@example.com",
    perfil: "teacher",
    situacao: "ativo",
    permissions: ["rooms:read", "reservations:create_own"],
  });
  const response = await request(app).post("/api/salas").send({
    nome: "Sala proibida",
    andar: "Térreo",
    capacidade: 20,
    recursos: [],
  });

  assert.equal(response.status, 403);
});

test("GET /api/reservas returns reservations with their room", async () => {
  const database = {
    query: async (sql) => {
      assert.match(sql, /JOIN salas/);
      return [[{
        id: 5,
        sala_id: 3,
        sala_nome: "Auditório",
        data: "2026-11-12",
        inicio: "13:00:00",
        fim: "14:30:00",
        responsavel: "João Pereira",
        finalidade: "Palestra",
        situacao: "aprovada",
        quantidade_alunos: 25,
        usuario_id: 1,
      }], []];
    },
  };
  const app = createApp({ database });
  const response = await request(app).get("/api/reservas");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body[0].sala, { id: 3, nome: "Auditório" });
  assert.equal(response.body[0].situacao, "aprovada");
});

test("DELETE /api/reservas/:id cancels the reservation", async () => {
  const database = {
    query: async (sql, values) => {
      assert.match(sql, /SET situacao = 'cancelada'/);
      assert.deepEqual(values, [6]);
      return [{ affectedRows: 1 }, []];
    },
  };
  const app = createApp({ database });
  const response = await request(app).delete("/api/reservas/6");

  assert.equal(response.status, 204);
});

test("existeConflito detects overlapping reservations for the same room and date", () => {
  const novaReserva = {
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:30",
    fim: "10:30",
    situacao: "pendente",
  };
  const reservas = [{
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:00:00",
    fim: "10:00:00",
    situacao: "aprovada",
  }];

  assert.equal(existeConflito(novaReserva, reservas), true);
});

test("existeConflito ignores cancelled reservations", () => {
  const novaReserva = {
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:30",
    fim: "10:30",
    situacao: "pendente",
  };
  const reservas = [{
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:00",
    fim: "10:00",
    situacao: "cancelada",
  }];

  assert.equal(existeConflito(novaReserva, reservas), false);
  assert.equal(existeConflito({ ...novaReserva, situacao: "cancelada" }, [{
    ...reservas[0],
    situacao: "aprovada",
  }]), false);
});

test("existeConflito ignores other rooms, dates and adjacent time ranges", () => {
  const novaReserva = {
    sala_id: 2,
    data: "2026-11-10",
    inicio: "09:00",
    fim: "10:00",
    situacao: "pendente",
  };
  const reservas = [
    { sala_id: 3, data: "2026-11-10", inicio: "09:30", fim: "10:30", situacao: "aprovada" },
    { sala_id: 2, data: "2026-11-11", inicio: "09:30", fim: "10:30", situacao: "aprovada" },
    { sala_id: 2, data: "2026-11-10", inicio: "10:00", fim: "11:00", situacao: "aprovada" },
  ];

  assert.equal(existeConflito(novaReserva, reservas), false);
});

test("cabeNaSala accepts a class equal to the room capacity", () => {
  const salas = [{ id: 2, capacidade: 30 }];

  assert.equal(cabeNaSala(30, 2, salas), true);
});

test("cabeNaSala rejects a class larger than the room capacity", () => {
  const salas = [{ id: 2, capacidade: 30 }];

  assert.equal(cabeNaSala(31, 2, salas), false);
});

test("cabeNaSala rejects missing rooms and invalid class sizes", () => {
  const salas = [{ id: 2, capacidade: 30 }];

  assert.equal(cabeNaSala(10, 3, salas), false);
  assert.equal(cabeNaSala(0, 2, salas), false);
  assert.equal(cabeNaSala(-1, 2, salas), false);
  assert.equal(cabeNaSala(10.5, 2, salas), false);
});
