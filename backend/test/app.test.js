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
