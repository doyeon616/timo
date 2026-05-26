import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT_DIR = resolve(__dirname);
loadEnvFile(join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_ANON_KEY = normalizeConfiguredValue(process.env.SUPABASE_ANON_KEY, "your-anon-public-key");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_ORIGIN = normalizeOrigin(
  process.env.APP_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""),
);
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".eot": "application/vnd.ms-fontobject",
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

const PUBLIC_ROOT_FILES = new Set([
  "app.js",
  "icon 2.svg",
  "icon.svg",
  "index.html",
  "logo.svg",
  "manifest.webmanifest",
  "new logo.svg",
  "styles.css",
  "sw.js",
  "theme.css",
  "variables.css",
]);
const PUBLIC_ASSET_DIRECTORIES = new Set(["assets", "goorm sans 2"]);
const PUBLIC_ASSET_EXTENSIONS = new Set([".eot", ".otf", ".svg", ".ttf", ".woff", ".woff2"]);
const AUTH_RATE_LIMITS = {
  login: {
    ip: { limit: 30, windowMs: 15 * 60 * 1000 },
    email: { limit: 10, windowMs: 15 * 60 * 1000 },
  },
  signup: {
    ip: { limit: 10, windowMs: 60 * 60 * 1000 },
    email: { limit: 3, windowMs: 60 * 60 * 1000 },
  },
};
const RATE_LIMIT_SWEEP_INTERVAL_MS = 60 * 1000;
const rateLimitBuckets = new Map();
let lastRateLimitSweep = 0;

export default async function handler(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
      sendJson(response, error.status, { error: error.message || "Request failed." });
      return;
    }
    if (error.code === "CONFIGURATION_ERROR") {
      sendJson(response, 500, { error: error.message });
      return;
    }
    sendJson(response, 500, { error: "Internal server error" });
  }
}

if (isDirectRun()) {
  createServer(handler).listen(PORT, () => {
    console.log(`Timo server running at http://localhost:${PORT}`);
    console.log(`Auth/storage: ${USE_SUPABASE ? "Supabase Auth" : "unconfigured"}`);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "timo",
      storage: USE_SUPABASE ? "supabase-auth" : "unconfigured",
      serverless: IS_SERVERLESS,
      time: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/signup") {
    if (!checkAuthRateLimit(request, response, "signup", "ip")) return;

    const body = await readJsonBody(request);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!checkAuthRateLimit(request, response, "signup", "email", email)) return;

    const passwordError = getPasswordRuleError(password);
    if (!name || !email || passwordError) {
      sendJson(response, 400, { error: passwordError || "Name and email are required." });
      return;
    }

    const authResult = await signUpWithSupabaseAuth(request, { name, email, password });
    if (authResult.access_token) {
      const user = await getOrCreateUserProfile(authResult.user);
      sendJson(response, 201, createAuthSessionPayload(authResult, user));
      return;
    }

    sendJson(response, 201, {
      requiresEmailVerification: true,
      message: "Check your email to verify your account before logging in.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    if (!checkAuthRateLimit(request, response, "login", "ip")) return;

    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!checkAuthRateLimit(request, response, "login", "email", email)) return;

    const authResult = await loginWithSupabaseAuth(email, password);
    if (!authResult?.access_token || !authResult?.user) {
      sendJson(response, 401, { error: "Invalid email or password." });
      return;
    }
    const user = await getOrCreateUserProfile(authResult.user);
    sendJson(response, 200, createAuthSessionPayload(authResult, user));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/refresh") {
    const body = await readJsonBody(request);
    const authResult = await refreshSupabaseSession(String(body.refreshToken || ""));
    if (!authResult?.access_token || !authResult?.user) {
      sendJson(response, 401, { error: "Authentication required." });
      return;
    }
    const user = await getOrCreateUserProfile(authResult.user);
    sendJson(response, 200, createAuthSessionPayload(authResult, user));
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

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    await logoutSupabaseSession(user.token);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, { state: user.state || null });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    const body = await readJsonBody(request);
    await updateUserState(user, body.state || null);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/account") {
    await deleteUserAccount(user);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function serveStatic(response, pathname) {
  const staticTarget = getStaticTarget(pathname);

  if (staticTarget.type === "bad-request") {
    sendText(response, 400, "Bad request");
    return;
  }

  if (staticTarget.type === "not-found") {
    sendText(response, 404, "Not found");
    return;
  }

  if (staticTarget.type === "app-route") {
    await serveFile(response, join(ROOT_DIR, "index.html"));
    return;
  }

  try {
    await serveFile(response, staticTarget.filePath);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function serveFile(response, filePath) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error("Not a file");
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(filePath).pipe(response);
}

function getStaticTarget(pathname) {
  let decodedPath = "";
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { type: "bad-request" };
  }

  if (decodedPath.includes("\0")) return { type: "bad-request" };

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const publicPath = normalizedPath.replace(/^[/\\]+/, "");
  const segments = publicPath.split(/[\\/]+/).filter(Boolean);

  if (segments.some((segment) => segment.startsWith("."))) return { type: "not-found" };

  const filePath = resolve(ROOT_DIR, ...segments);
  if (!isPathInsideRoot(filePath)) return { type: "not-found" };

  if (segments.length === 1 && PUBLIC_ROOT_FILES.has(publicPath)) {
    return { type: "file", filePath };
  }

  if (PUBLIC_ASSET_DIRECTORIES.has(segments[0]) && PUBLIC_ASSET_EXTENSIONS.has(extname(filePath))) {
    return { type: "file", filePath };
  }

  if (!extname(publicPath)) return { type: "app-route" };

  return { type: "not-found" };
}

function isPathInsideRoot(filePath) {
  const relativePath = relative(ROOT_DIR, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

async function requireUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;
  const authUser = await getSupabaseAuthUser(token).catch(() => null);
  if (!authUser || !isAuthEmailVerified(authUser)) return null;
  const user = await getOrCreateUserProfile(authUser);
  return user ? { ...user, token } : null;
}

function createAuthSessionPayload(authResult, user) {
  return {
    token: authResult.access_token,
    refreshToken: authResult.refresh_token,
    expiresAt: toAuthExpiresAt(authResult),
    user: publicUser(user),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
  };
}

function getRequestOrigin(request) {
  const protocol = getHeaderValue(request, "x-forwarded-proto") || "http";
  const host = getHeaderValue(request, "x-forwarded-host") || getHeaderValue(request, "host") || "localhost";
  return normalizeOrigin(`${protocol.split(",")[0]}://${host.split(",")[0]}`);
}

async function signUpWithSupabaseAuth(request, { name, email, password }) {
  ensureSupabaseAuthAvailable();
  const redirectTo = APP_ORIGIN || getRequestOrigin(request);
  return supabaseAuthRequest(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: {
      email,
      password,
      data: { name },
    },
  });
}

async function loginWithSupabaseAuth(email, password) {
  ensureSupabaseAuthAvailable();
  try {
    return await supabaseAuthRequest("/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
  } catch (error) {
    if (error.status === 400 && /confirm|verified|verification/i.test(error.message)) {
      const verificationError = new Error("Verify your email before logging in.");
      verificationError.status = 403;
      throw verificationError;
    }
    throw error;
  }
}

async function refreshSupabaseSession(refreshToken) {
  ensureSupabaseAuthAvailable();
  if (!refreshToken) return null;
  return supabaseAuthRequest("/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

async function getSupabaseAuthUser(accessToken) {
  ensureSupabaseAuthAvailable();
  const response = await supabaseAuthRequest("/user", { accessToken });
  return response?.user || response;
}

async function logoutSupabaseSession(accessToken) {
  ensureSupabaseAuthAvailable();
  await supabaseAuthRequest("/logout", { method: "POST", accessToken });
}

async function deleteSupabaseAuthUser(userId) {
  ensureSupabaseAuthAvailable();
  await supabaseAuthRequest(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    admin: true,
  });
}

async function supabaseAuthRequest(path, options = {}) {
  const apiKey = options.admin ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const bearerToken = options.admin ? SUPABASE_SERVICE_ROLE_KEY : options.accessToken || SUPABASE_ANON_KEY;
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text ? { message: text } : null;
  }

  if (!response.ok) {
    const error = new Error(body?.msg || body?.message || body?.error_description || body?.error || "Supabase Auth request failed.");
    error.status = response.status;
    throw error;
  }

  return body;
}

function isAuthEmailVerified(authUser) {
  return Boolean(authUser.email_confirmed_at || authUser.confirmed_at);
}

function toAuthExpiresAt(authResult) {
  if (authResult.expires_at) return new Date(authResult.expires_at * 1000).toISOString();
  if (authResult.expires_in) return new Date(Date.now() + authResult.expires_in * 1000).toISOString();
  return null;
}

function checkAuthRateLimit(request, response, action, scope, value) {
  const config = AUTH_RATE_LIMITS[action]?.[scope];
  if (!config) return true;

  const identity = scope === "ip" ? getClientIp(request) : normalizeRateLimitIdentity(value);
  if (!identity) return true;

  const result = consumeRateLimitToken(`${action}:${scope}:${identity}`, config);
  if (result.allowed) return true;

  sendJson(
    response,
    429,
    { error: "Too many authentication attempts. Try again later." },
    {
      "Retry-After": String(result.retryAfterSeconds),
      "RateLimit-Limit": String(config.limit),
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": String(result.resetAtSeconds),
    },
  );
  return false;
}

function consumeRateLimitToken(key, config) {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const existing = rateLimitBuckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + config.windowMs };

  if (bucket.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAtSeconds: Math.ceil(bucket.resetAt / 1000),
    };
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return { allowed: true, resetAtSeconds: Math.ceil(bucket.resetAt / 1000) };
}

function pruneRateLimitBuckets(now) {
  if (now - lastRateLimitSweep < RATE_LIMIT_SWEEP_INTERVAL_MS) return;
  lastRateLimitSweep = now;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function getClientIp(request) {
  const forwardedFor = getHeaderValue(request, "x-forwarded-for");
  const forwardedIp = forwardedFor.split(",")[0]?.trim();
  const directIp =
    forwardedIp ||
    getHeaderValue(request, "x-real-ip") ||
    getHeaderValue(request, "cf-connecting-ip") ||
    request.socket?.remoteAddress ||
    "unknown";
  return normalizeRateLimitIdentity(directIp);
}

function getHeaderValue(request, name) {
  const value = request.headers[name];
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function normalizeRateLimitIdentity(value) {
  return String(value || "").trim().toLowerCase().slice(0, 128);
}

function getPasswordRuleError(password) {
  const ruleText = "Use 8+ characters with uppercase, lowercase, number, and special character.";
  if (password.length < 8) return ruleText;
  if (password.length > 64) return "Use a password with 64 characters or fewer.";
  if (!hasLowercaseLetter(password)) return ruleText;
  if (!hasUppercaseLetter(password)) return ruleText;
  if (!/\d/.test(password)) return ruleText;
  if (!/[^A-Za-z0-9]/.test(password)) return ruleText;
  return "";
}

function hasLowercaseLetter(value) {
  return /[a-z]/.test(value);
}

function hasUppercaseLetter(value) {
  return /[A-Z]/.test(value);
}

function loadEnvFile(filePath) {
  try {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional. Hosted environments should use platform env vars.
  }
}

async function getOrCreateUserProfile(authUser) {
  ensureSupabaseAuthAvailable();
  const id = String(authUser?.id || "").trim();
  const email = normalizeEmail(authUser?.email);
  if (!id || !email) return null;

  const existing = await getUserProfileById(id);
  const authName = String(authUser.user_metadata?.name || "").trim();
  const fallbackName = authName || email.split("@")[0] || "User";
  const emailVerified = isAuthEmailVerified(authUser);

  if (existing) {
    const next = {
      ...existing,
      name: existing.name || fallbackName,
      email,
      emailVerified,
      updatedAt: new Date().toISOString(),
    };
    if (
      next.name !== existing.name ||
      next.email !== existing.email ||
      next.emailVerified !== existing.emailVerified
    ) {
      await upsertUserProfile(next);
    }
    return next;
  }

  const now = new Date().toISOString();
  const user = {
    id,
    name: fallbackName,
    email,
    emailVerified,
    state: null,
    createdAt: now,
    updatedAt: now,
  };
  await upsertUserProfile(user);
  return user;
}

async function getUserProfileById(id) {
  ensureSupabaseAuthAvailable();
  const rows = await supabaseRequest(`/timo_users?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? fromSupabaseProfile(rows[0]) : null;
}

async function upsertUserProfile(user) {
  ensureSupabaseAuthAvailable();
  await supabaseRequest("/timo_users?on_conflict=id", {
    method: "POST",
    body: toSupabaseProfile(user),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

async function updateUserState(user, state) {
  ensureSupabaseAuthAvailable();
  await supabaseRequest(`/timo_users?id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    body: {
      app_state: state,
      email_verified: Boolean(user.emailVerified),
      updated_at: new Date().toISOString(),
    },
    headers: { Prefer: "return=minimal" },
  });
  await syncTasksForUser(user, state);
}

async function syncTasksForUser(user, state) {
  const taskRows = getTaskRowsFromState(user.id, state);
  const now = new Date().toISOString();

  if (taskRows.length > 0) {
    await supabaseRequest("/timo_tasks?on_conflict=user_id,id", {
      method: "POST",
      body: taskRows.map((row) => ({
        ...row,
        deleted_at: null,
        synced_at: now,
        updated_at: now,
      })),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }

  await markMissingTasksDeleted(user.id, taskRows.map((task) => task.id), now);
}

async function markMissingTasksDeleted(userId, activeTaskIds, deletedAt) {
  const idFilter =
    activeTaskIds.length > 0
      ? `&id=not.in.(${activeTaskIds.map((id) => `"${escapePostgrestListValue(id)}"`).join(",")})`
      : "";

  await supabaseRequest(`/timo_tasks?user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null${idFilter}`, {
    method: "PATCH",
    body: {
      deleted_at: deletedAt,
      synced_at: deletedAt,
      updated_at: deletedAt,
    },
    headers: { Prefer: "return=minimal" },
  });
}

function getTaskRowsFromState(userId, state) {
  if (!state?.days || typeof state.days !== "object") return [];

  return Object.entries(state.days).flatMap(([date, day]) => {
    if (!Array.isArray(day?.tasks)) return [];
    return day.tasks.filter((task) => task?.id && task?.name).map((task) => toTaskRow(userId, date, task));
  });
}

function toTaskRow(userId, date, task) {
  return {
    user_id: userId,
    id: String(task.id),
    task_date: date,
    name: String(task.name || ""),
    tag: task.tag ? String(task.tag) : null,
    estimate_minutes: toInteger(task.estimateMinutes),
    note: task.note ? String(task.note) : null,
    status: task.status ? String(task.status) : "pending",
    priority: task.priority ? String(task.priority) : null,
    actual_seconds: toInteger(task.actualSeconds),
    extensions: toInteger(task.extensions),
    task_order: toNullableNumber(task.order),
    timebox_order: toNullableNumber(task.timeboxOrder),
    timebox_start_minute: toNullableInteger(task.timeboxStartMinute),
    timebox_duration_minutes: toNullableInteger(task.timeboxDurationMinutes),
    raw_task: task,
  };
}

async function deleteUserAccount(user) {
  ensureSupabaseAuthAvailable();
  await deleteSupabaseAuthUser(user.id);
  await supabaseRequest(`/timo_users?id=eq.${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

function ensureSupabaseAuthAvailable() {
  if (USE_SUPABASE) return;
  const error = new Error("Supabase Auth environment variables are required.");
  error.code = "CONFIGURATION_ERROR";
  throw error;
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

function toSupabaseProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    email_verified: Boolean(user.emailVerified),
    app_state: user.state,
    created_at: user.createdAt,
    updated_at: user.updatedAt || user.createdAt,
  };
}

function fromSupabaseProfile(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    state: row.app_state || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function normalizeSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeConfiguredValue(value, ...placeholders) {
  const normalized = String(value || "").trim();
  return placeholders.includes(normalized) ? "" : normalized;
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function toNullableInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapePostgrestListValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}
