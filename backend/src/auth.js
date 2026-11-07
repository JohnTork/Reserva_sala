const crypto = require("node:crypto");
const express = require("express");

const sessionDurationMs = 1000 * 60 * 60 * 12;
const delegablePermissions = [
  "rooms:manage",
  "reservations:manage",
  "cleaning:manage",
];
const rolePermissions = {
  coordinator: ["*"],
  substitute: [],
  teacher: ["rooms:read", "reservations:create_own", "reservations:read_own", "reservations:cancel_own"],
  cleaning: ["rooms:read", "cleaning:read_own", "cleaning:update_own"],
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") {
    return false;
  }
  const [salt, key] = storedHash.split(":");
  if (!salt || !key || !/^[a-f0-9]{128}$/.test(key)) {
    return false;
  }

  const candidate = await hashPassword(password, salt);
  const candidateKey = Buffer.from(candidate.split(":")[1], "hex");
  const storedKey = Buffer.from(key, "hex");
  return candidateKey.length === storedKey.length && crypto.timingSafeEqual(candidateKey, storedKey);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function serializeUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    situacao: user.situacao,
  };
}

function requirePermission(permission) {
  return (request, response, next) => {
    if (request.user?.permissions.includes("*") || request.user?.permissions.includes(permission)) {
      next();
      return;
    }

    response.status(403).json({ error: "Você não tem permissão para esta ação." });
  };
}

function createAuthentication(database) {
  return async (request, response, next) => {
    const authorization = request.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";

    if (!token) {
      response.status(401).json({ error: "Autenticação necessária." });
      return;
    }

    try {
      const [rows] = await database.query(
        `SELECT u.id, u.nome, u.email, u.perfil, u.situacao
         FROM sessoes s
         JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = ? AND s.expira_em > CURRENT_TIMESTAMP AND u.situacao = 'ativo'`,
        [hashToken(token)],
      );

      if (rows.length === 0) {
        response.status(401).json({ error: "Sessão inválida ou expirada." });
        return;
      }

      const user = rows[0];
      const permissions = [...rolePermissions[user.perfil]];
      if (user.perfil !== "coordinator") {
        const [delegations] = await database.query(
          `SELECT permissao FROM delegacoes
           WHERE funcionario_id = ? AND revogada_em IS NULL
             AND (expira_em IS NULL OR expira_em > CURRENT_TIMESTAMP)`,
          [user.id],
        );
        permissions.push(...delegations.map((delegation) => delegation.permissao));
        if (permissions.includes("rooms:manage")) {
          permissions.push("rooms:read");
        }
      }

      request.user = { ...serializeUser(user), permissions };
      next();
    } catch (error) {
      console.error("Failed to authenticate request:", error);
      response.status(500).json({ error: "Não foi possível validar a sessão." });
    }
  };
}

function createAuthRouter({ database }) {
  const router = express.Router();

  router.post("/register", async (request, response) => {
    const { nome, email, senha } = request.body || {};
    if (typeof nome !== "string" || nome.trim().length === 0 || nome.trim().length > 120
      || typeof email !== "string" || email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || typeof senha !== "string" || senha.length < 10 || senha.length > 200) {
      response.status(400).json({
        error: "Informe nome, e-mail válido e senha com pelo menos 10 caracteres.",
      });
      return;
    }

    try {
      const passwordHash = await hashPassword(senha);
      const [result] = await database.query(
        "INSERT INTO usuarios (nome, email, senha_hash, perfil, situacao) VALUES (?, ?, ?, 'teacher', 'pendente')",
        [nome.trim(), email.trim().toLowerCase(), passwordHash],
      );
      response.status(201).json({
        id: result.insertId,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        perfil: "teacher",
        situacao: "pendente",
        message: "Cadastro enviado para aprovação da coordenação.",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        response.status(409).json({ error: "Este e-mail já está cadastrado." });
        return;
      }
      console.error("Failed to register user:", error);
      response.status(500).json({ error: "Não foi possível concluir o cadastro." });
    }
  });

  router.post("/login", async (request, response) => {
    const { email, senha } = request.body || {};
    if (typeof email !== "string" || typeof senha !== "string") {
      response.status(400).json({ error: "Informe e-mail e senha." });
      return;
    }

    try {
      const [users] = await database.query(
        "SELECT id, nome, email, senha_hash, perfil, situacao FROM usuarios WHERE email = ?",
        [email.trim().toLowerCase()],
      );
      if (users.length === 0 || !(await verifyPassword(senha, users[0].senha_hash))) {
        response.status(401).json({ error: "E-mail ou senha incorretos." });
        return;
      }
      if (users[0].situacao !== "ativo") {
        response.status(403).json({ error: "Seu cadastro ainda não foi aprovado pela coordenação." });
        return;
      }

      const token = crypto.randomBytes(32).toString("base64url");
      await database.query(
        "INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES (?, ?, ?)",
        [users[0].id, hashToken(token), new Date(Date.now() + sessionDurationMs)],
      );
      response.json({ token, usuario: serializeUser(users[0]) });
    } catch (error) {
      console.error("Failed to log in:", error);
      response.status(500).json({ error: "Não foi possível entrar no sistema." });
    }
  });

  return router;
}

function createAuthenticatedRouter({ database }) {
  const router = express.Router();

  router.get("/me", (request, response) => {
    response.json({
      usuario: serializeUser(request.user),
      permissoes: request.user.permissions,
    });
  });

  router.post("/logout", async (request, response) => {
    const token = request.get("authorization").slice(7);
    try {
      await database.query("DELETE FROM sessoes WHERE token_hash = ?", [hashToken(token)]);
      response.status(204).end();
    } catch (error) {
      console.error("Failed to log out:", error);
      response.status(500).json({ error: "Não foi possível encerrar a sessão." });
    }
  });

  return router;
}

function createSessionRouter({ database }) {
  const router = express.Router();
  router.use(createAuthentication(database));
  router.use(createAuthenticatedRouter({ database }));
  return router;
}

async function bootstrapCoordinator(database) {
  const { INITIAL_COORDINATOR_NAME: nome, INITIAL_COORDINATOR_EMAIL: email,
    INITIAL_COORDINATOR_PASSWORD: senha } = process.env;
  if (!nome && !email && !senha) {
    return;
  }
  if (!nome || !email || !senha || senha.length < 10) {
    throw new Error("Configure nome, e-mail e senha inicial (mínimo 10 caracteres) da coordenação.");
  }

  const [coordinators] = await database.query(
    "SELECT id FROM usuarios WHERE perfil = 'coordinator' LIMIT 1",
  );
  if (coordinators.length > 0) {
    return;
  }

  const passwordHash = await hashPassword(senha);
  try {
    await database.query(
      "INSERT INTO usuarios (nome, email, senha_hash, perfil, situacao) VALUES (?, ?, ?, 'coordinator', 'ativo')",
      [nome.trim(), email.trim().toLowerCase(), passwordHash],
    );
    console.log("Initial coordinator account created.");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("O e-mail inicial já pertence a outra conta; revise a configuração da coordenação.");
    }
    throw error;
  }
}

module.exports = {
  bootstrapCoordinator,
  createAuthRouter,
  createAuthenticatedRouter,
  createAuthentication,
  createSessionRouter,
  delegablePermissions,
  requirePermission,
};
