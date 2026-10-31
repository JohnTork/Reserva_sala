require("dotenv").config();

const { createApp } = require("./app");
const { pool: database, initializeDatabase } = require("./database");

const port = Number(process.env.PORT || 3000);
const app = createApp({ database });

let server;

initializeDatabase()
  .then(() => {
    server = app.listen(port, () => {
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
