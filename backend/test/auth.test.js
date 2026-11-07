const assert = require("node:assert/strict");
const { scryptSync } = require("node:crypto");
const { test } = require("node:test");
const request = require("supertest");
const { createApp } = require("../src/app");

test("protected APIs require an authenticated session", async () => {
  const app = createApp({ database: { query: async () => { throw new Error("should not query"); } } });
  const response = await request(app).get("/api/salas");

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Autenticação necessária." });
});

test("registration creates a pending teacher account with a password hash", async () => {
  let insertedValues;
  const app = createApp({
    database: {
      query: async (_sql, values) => {
        insertedValues = values;
        return [{ insertId: 12 }, []];
      },
    },
  });
  const response = await request(app).post("/api/auth/register").send({
    nome: "  Maria Silva ",
    email: "MARIA@example.com",
    senha: "senha-super-segura",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.perfil, "teacher");
  assert.equal(response.body.situacao, "pendente");
  assert.equal(insertedValues[0], "Maria Silva");
  assert.equal(insertedValues[1], "maria@example.com");
  assert.notEqual(insertedValues[2], "senha-super-segura");
  assert.match(insertedValues[2], /^[a-f0-9]{32}:[a-f0-9]{128}$/);
});

test("pending accounts cannot log in", async () => {
  const salt = "a".repeat(32);
  const senhaHash = `${salt}:${scryptSync("senha-super-segura", salt, 64).toString("hex")}`;
  const app = createApp({
    database: {
      query: async (sql) => {
        assert.match(sql, /FROM usuarios WHERE email/);
        return [[{
          id: 2,
          nome: "Maria Silva",
          email: "maria@example.com",
          senha_hash: senhaHash,
          perfil: "teacher",
          situacao: "pendente",
        }], []];
      },
    },
  });
  const response = await request(app).post("/api/auth/login").send({
    email: "maria@example.com",
    senha: "senha-super-segura",
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /aprovado/);
});

test("active coordinators can log in, inspect their profile and log out", async () => {
  const salt = "b".repeat(32);
  const senhaHash = `${salt}:${scryptSync("senha-super-segura", salt, 64).toString("hex")}`;
  let sessionValues;
  const user = {
    id: 1,
    nome: "Coordenadora",
    email: "coord@example.com",
    senha_hash: senhaHash,
    perfil: "coordinator",
    situacao: "ativo",
  };
  const database = {
    query: async (sql, values) => {
      if (sql.includes("FROM usuarios WHERE email")) {
        return [[user], []];
      }
      if (sql.includes("INSERT INTO sessoes")) {
        sessionValues = values;
        return [{ insertId: 1 }, []];
      }
      if (sql.includes("FROM sessoes")) {
        return [[user], []];
      }
      if (sql.includes("DELETE FROM sessoes")) {
        assert.deepEqual(values, [sessionValues[1]]);
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const app = createApp({ database });
  const login = await request(app).post("/api/auth/login").send({
    email: user.email,
    senha: "senha-super-segura",
  });

  assert.equal(login.status, 200);
  assert.equal(typeof login.body.token, "string");
  assert.notEqual(sessionValues[1], login.body.token);
  assert.equal(sessionValues[1].length, 64);

  const profile = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.usuario.perfil, "coordinator");
  assert.deepEqual(profile.body.permissoes, ["*"]);

  const logout = await request(app)
    .post("/api/auth/logout")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(logout.status, 204);
});
