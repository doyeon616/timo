import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT_DIR = resolve(__dirname);
const DATA_DIR = join(ROOT_DIR, ".data");
const DB_PATH = join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const sessions = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
}).listen(PORT, () => {
  console.log(`Timo server running at http://localhost:${PORT}`);
  console.log(`Storage: ${USE_SUPABASE ? "Supabase" : "local file"}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "timo", time: new Date().toISOString() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/signup") {
    const body = await readJsonBody(request);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email || password.length < 8) {
      sendJson(response, 400, { error: "Name, email, and an 8+ character password are required." });
      return;
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      sendJson(response, 409, { error: "An account with this email already exists." });
      return;
    }

    const user = {
      id: stableUserId(email),
      name,
      email,
      password: hashPassword(password),
      emailVerified: true,
      createdAt: new Date().toISOString(),
      state: null,
    };
    await createUser(user);
    sendJson(response, 201, createSessionPayload(user));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = await getUserByEmail(email);

    if (!user || !verifyPassword(password, user.password)) {
      sendJson(response, 401, { error: "Invalid email or password." });
      return;
    }

    sendJson(response, 200, createSessionPayload(user));
    return;
  }

  const user = await requireUser(request);
  if (!user) {
    sendJson(response, 401, { error: "Authentication required." });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, { state: user.state || null });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    const body = await readJsonBody(request);
    await updateUserState(user.email, body.state || null);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/account") {
    await deleteUserByEmail(user.email);
    sessions.delete(user.token);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function serveStatic(response, pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = resolve(join(ROOT_DIR, safePath));

  if (relative(ROOT_DIR, filePath).startsWith("..")) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": MIME_TYPES[".html"],
    });
    createReadStream(join(ROOT_DIR, "index.html")).pipe(response);
  }
}

async function requireUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;
  const email = sessions.get(token);
  if (!email) return null;
  const user = await getUserByEmail(email);
  return user ? { ...user, token } : null;
}

function createSessionPayload(user) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, user.email);
  return { token, user: publicUser(user) };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
  };
}

async function readDb() {
  try {
    return JSON.parse(await readFile(DB_PATH, "utf8"));
  } catch {
    return { users: {} };
  }
}

async function writeDb(db) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

async function getUserByEmail(email) {
  if (USE_SUPABASE) {
    const rows = await supabaseRequest(`/timo_users?email=eq.${encodeURIComponent(email)}&select=*`);
    return rows[0] ? fromSupabaseUser(rows[0]) : null;
  }

  const db = await readDb();
  return db.users[email] || null;
}

async function createUser(user) {
  if (USE_SUPABASE) {
    await supabaseRequest("/timo_users", {
      method: "POST",
      body: toSupabaseUser(user),
      headers: { Prefer: "return=minimal" },
    });
    return;
  }

  const db = await readDb();
  db.users[user.email] = user;
  await writeDb(db);
}

async function updateUserState(email, state) {
  if (USE_SUPABASE) {
    await supabaseRequest(`/timo_users?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: {
        app_state: state,
        updated_at: new Date().toISOString(),
      },
      headers: { Prefer: "return=minimal" },
    });
    return;
  }

  const db = await readDb();
  const current = db.users[email];
  if (!current) return;
  current.state = state;
  current.updatedAt = new Date().toISOString();
  await writeDb(db);
}

async function deleteUserByEmail(email) {
  if (USE_SUPABASE) {
    await supabaseRequest(`/timo_users?email=eq.${encodeURIComponent(email)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return;
  }

  const db = await readDb();
  delete db.users[email];
  await writeDb(db);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function toSupabaseUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.password,
    email_verified: Boolean(user.emailVerified),
    app_state: user.state,
    created_at: user.createdAt,
    updated_at: user.updatedAt || user.createdAt,
  };
}

function fromSupabaseUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password_hash,
    emailVerified: Boolean(row.email_verified),
    state: row.app_state || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue = "") {
  const [salt, hash] = storedValue.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function stableUserId(email) {
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function normalizeSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getBearerToken(request) {
  const auth = request.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(JSON.stringify(body));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}
