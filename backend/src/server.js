const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { createApp } = require("./app");
const { pool: database, initializeDatabase } = require("./database");
const { bootstrapCoordinator } = require("./auth");

const port = Number(process.env.API_PORT || 3001);
const app = createApp({ database });

let server;

initializeDatabase()
  .then(() => bootstrapCoordinator(database))
  .then(() => {
    server = app.listen(port);
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`API port ${port} is already in use. Set API_PORT to another available port.`);
      } else {
        console.error("Failed to start the API server:", error);
      }
      process.exitCode = 1;
    });
    server.on("listening", () => {
      console.log(`API listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize the database:", error);
    process.exitCode = 1;
  });

function shutdown() {
  if (!server) {
    return;
  }

  server.close(async (error) => {
    if (error) {
      console.error("Failed to close the API server:", error);
      process.exitCode = 1;
    }

    try {
      await database.end();
    } catch (databaseError) {
      console.error("Failed to close the database pool:", databaseError);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
