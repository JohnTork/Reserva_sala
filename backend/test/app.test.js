const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const request = require("supertest");
const { createApp } = require("../src/app");

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
  const database = {
    query: async (sql) => {
      assert.match(sql, /^UPDATE salas/);
      return [{ affectedRows: 1 }, []];
    },
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
