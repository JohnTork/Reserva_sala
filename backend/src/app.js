const cors = require("cors");
const express = require("express");
const {
  createAuthRouter,
  createAuthentication,
  createSessionRouter,
} = require("./auth");
const { createReservasRouter } = require("./reservas");
const { createSalasRouter } = require("./salas");
const { createTarefasLimpezaRouter } = require("./tarefas-limpeza");
const { createUsuariosRouter } = require("./usuarios");

function createApp({ database, authentication }) {
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  }));
  app.use(express.json({ limit: "10kb" }));
  app.use("/api/auth", createAuthRouter({ database }));
  app.use("/api/auth", createSessionRouter({ database }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/health/db", async (_request, response) => {
    try {
      await database.query("SELECT 1");
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("Database health check failed:", error);
      response.status(503).json({ status: "error", database: "unavailable" });
    }
  });

  app.use(authentication || createAuthentication(database));
  app.use("/api/salas", createSalasRouter({ database }));
  app.use("/api/reservas", createReservasRouter({ database }));
  app.use("/api/usuarios", createUsuariosRouter({ database }));
  app.use("/api/tarefas-limpeza", createTarefasLimpezaRouter({ database }));

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  return app;
}

module.exports = { createApp };
