// js-files/aiConfig.js — AIRIS central AI provider configuration.
//
// ONE source of truth for provider/base URL/API key/model for every
// AI-powered feature (Node main process, renderer windows via IPC, and
// Python scripts via data/ai-config.json).
//
// Convention: all providers are OpenAI-compatible /v1 endpoints:
//   - models:    GET    {baseURL}/models          -> { data: [{ id }] }
//   - chat:      POST   {baseURL}/chat/completions
// Ollama, LM Studio, llama.cpp, vLLM, OpenAI, Groq, etc. all speak this.
// Nothing is hard-coded to a specific host: http://localhost:11434/v1
// (Ollama) is simply the persisted default; users can point AIRIS at any
// compatible endpoint from the AI Settings screen.

const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "data");
const CONFIG_FILE = path.join(CONFIG_DIR, "ai-config.json");

// ─── Errors ──────────────────────────────────────────────────────────────
class ConfigError extends Error {
  constructor(message, { code = "config_error" } = {}) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

// ─── Defaults ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = Object.freeze({
  provider: "openai-compatible",
  baseURL: "http://localhost:11434/v1",
  apiKey: "",
  model: "llava",
  timeoutMs: 120000,
  temperature: null,
  maxTokens: null,
  featureModels: {
    vision: "",
    summarizer: "",
    fast: "",
    transcription: "whisper",
  },
  status: { state: "unknown", message: "", checkedAt: null, lastSuccessfulAt: null },
});

// Endpoint presets for the settings UI (options, not hard-coded defaults).
const PROVIDER_PRESETS = Object.freeze([
  { id: "ollama-local", label: "Ollama (local)", baseURL: "http://localhost:11434/v1" },
  { id: "lmstudio-local", label: "LM Studio (local)", baseURL: "http://localhost:1234/v1" },
  { id: "llamacpp-local", label: "llama.cpp server (local)", baseURL: "http://127.0.0.1:8080/v1" },
  { id: "openai", label: "OpenAI hosted", baseURL: "https://api.openai.com/v1" },
  { id: "custom", label: "Custom OpenAI-compatible endpoint", baseURL: "" },
]);

// ─── Base URL normalization ──────────────────────────────────────────────
const _V1_TRIM = (s) => s.replace(/\/+$/g, "");

/** Normalize & validate a user-entered base URL.
 *  - trims whitespace, adds http:// when scheme is missing
 *  - collapses duplicated /v1, /v1/v1/v1/... -> /v1
 *  - strips trailing slashes; keeps only scheme://host[:port]/path
 *  - throws ConfigError with an actionable message when unusable
 */
function normalizeBaseURL(raw) {
  let candidate = String(raw === undefined || raw === null ? "" : raw).trim();
  if (!candidate) {
    throw new ConfigError("API base URL is required (e.g. http://localhost:11434/v1).", {
      code: "base_url_required",
    });
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ConfigError(
      `"${_clip(candidate)}" is not a valid URL. Expected something like http://localhost:11434/v1.`,
      { code: "base_url_invalid" }
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(
      `Unsupported protocol "${parsed.protocol}". Base URL must start with http:// or https://.`,
      { code: "base_url_invalid" }
    );
  }

  // Collapse duplicated /v1 segments anywhere in the path.
  let pathname = parsed.pathname.replace(/\/+$/g, "");
  pathname = pathname.replace(/^\/v1(\/v1)+$/i, "/v1");
  pathname = pathname.replace(/\/v1(\/v1)+/i, "/v1"); // e.g. /api/v1/v1

  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

/** Build an endpoint URL from a (possibly user-modified) base URL.
 *  Avoids https://x/v1 + https://x/v1/chat/completions-style duplication. */
function buildEndpointURL(baseURL, endpointPath) {
  const base = normalizeBaseURL(baseURL);
  const rel = String(endpointPath || "").startsWith("/")
    ? endpointPath
    : `/${endpointPath}`;
  const baseEndsWithV1 = /\/v1$/i.test(base);
  const relStartsWithV1 = /^\/v1(\/|$)/i.test(rel);
  const joined = baseEndsWithV1 && relStartsWithV1 ? `${base}${rel.slice(3)}` : `${base}${rel}`;
  return joined;
}

// ─── Model list parsing ──────────────────────────────────────────────────
/** Parse an OpenAI-style /models response into a normalized list of IDs.
 *  Accepts { data: [...] } (OpenAI/Ollama/LM Studio), { models: [...] }
 *  (some native servers), or a bare array. Model name may sit on
 *  `id`, `name`, or `model`. Returns [] for an empty list. */
function parseModelsResponse(body) {
  if (body === undefined) return [];

  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ConfigError("Model list endpoint returned invalid JSON.", {
        code: "models_invalid_json",
      });
    }
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new ConfigError("Unexpected model list response shape.", {
      code: "models_bad_shape",
    });
  }

  let list = null;
  if (Array.isArray(parsed)) list = parsed;
  else if (Array.isArray(parsed.data)) list = parsed.data;
  else if (Array.isArray(parsed.models)) list = parsed.models;
  else return [];

  if (!list.length) return [];

  const ids = [];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) {
      ids.push(item.trim());
    } else if (item && typeof item === "object") {
      const id = typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : typeof item.model === "string" ? item.model : "";
      if (id.trim()) ids.push(id.trim());
    }
  }
  // unique + case-sensitive stable sort
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

// ─── Persistence ─────────────────────────────────────────────────────────
function loadConfigFromDisk(file = CONFIG_FILE) {
  try {
    const text = fs.readFileSync(file, "utf8");
    if (!text.trim()) throw new ConfigError("AI config file is empty.", { code: "config_file_empty" });
    const data = JSON.parse(text);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new ConfigError("AI config file corrupt (expected an object).", { code: "config_file_corrupt" });
    }
    return data;
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    if (err && err.code === "ENOENT") return { _missing: true }; // first run
    if (err && err.name === "SyntaxError") {
      throw new ConfigError("AI config file is not valid JSON — it will be reset to defaults on next save.", {
        code: "config_file_corrupt",
      });
    }
    throw new ConfigError(`Could not read AI config: ${err.message}`, { code: "config_file_unreadable" });
  }
}

/** Merge a (possibly partial) persisted config onto defaults.
 *  Never crashes: unknown fields are preserved, corrupt values fall back.
 *  (Unknown keys survive migrations so other features can store their own
 *  settings in the same file without losing them.) */
function mergeWithDefaults(fileData) {
  const merged = deepClone(DEFAULT_CONFIG);
  const hasRealData =
    fileData && Object.keys(fileData).some((k) => k !== "_missing");
  if (!fileData || !hasRealData) return merged;

  for (const key of ["provider", "baseURL", "apiKey"]) {
    if (typeof fileData[key] === "string") merged[key] = fileData[key];
  }
  for (const key of ["model"]) {
    if (typeof fileData[key] === "string" && fileData[key].trim()) merged[key] = fileData[key].trim();
  }
  merged.timeoutMs = numberOr(fileData.timeoutMs, DEFAULT_CONFIG.timeoutMs);
  merged.temperature = numberOrNull(fileData.temperature);
  merged.maxTokens = numberOrNull(fileData.maxTokens);

  merged.featureModels = { ...DEFAULT_CONFIG.featureModels };
  if (fileData.featureModels && typeof fileData.featureModels === "object") {
    for (const [k, v] of Object.entries(fileData.featureModels)) {
      if (typeof v === "string") merged.featureModels[k] = v;
    }
  }
  if (fileData.status && typeof fileData.status === "object") {
    merged.status = { ...DEFAULT_CONFIG.status, ...fileData.status };
  }
  // Preserve any extra unrelated keys the app or other features stored here.
  for (const [key, value] of Object.entries(fileData)) {
    if (key === "_missing" || key in DEFAULT_CONFIG) continue;
    merged[key] = value;
  }
  // Legacy / migration fields (older AIRIS files persisted these names).
  if (fileData.ollamaURL && !fileData.baseURL) {
    merged.baseURL = mergeOllamaNativeToV1(fileData.ollamaURL);
  }
  if (fileData.ollamaModel && fileData.ollamaModel.trim()) {
    merged.model = merged.model === DEFAULT_CONFIG.model ? fileData.ollamaModel.trim() : merged.model;
  }
  return merged;
}

function mergeOllamaNativeToV1(url) {
  // old flavour: http://localhost:11434/api/generate → keep host, use /v1
  try {
    const u = new URL(String(url));
    return `${u.protocol}//${u.host}/v1`;
  } catch {
    return DEFAULT_CONFIG.baseURL;
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Persist a partial patch atomically (temp file + rename). */
let _saveSeq = 0;
function saveConfig(patch, file = CONFIG_FILE) {
  const current = readConfig(file);
  const patchObj = patch && typeof patch === "object" ? patch : {};
  const next = mergeWithDefaults({ ...readConfigRaw(file), ...patchObj });

  // Don't persist transient status patches the caller didn't send.
  next.status = patchObj.status
    ? { ...current.status, ...patchObj.status }
    : { ...current.status };

  // Normalize before writing so a bad URL can never be persisted.
  next.baseURL = normalizeBaseURL(next.baseURL);
  if (typeof next.model === "string") next.model = next.model.trim() || DEFAULT_CONFIG.model;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${(_saveSeq += 1)}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return next;
}

function readConfigRaw(file = CONFIG_FILE) {
  try {
    return loadConfigFromDisk(file);
  } catch (err) {
    if (err && err.code === "config_file_corrupt_bad_json") return err.rawData || {};
    return {}; // unreadable/corrupt → treat as missing; values keep defaults
  }
}

/** Tolerant read used by runtime/save paths: corrupt files fall back to
 *  defaults (possibly still carrying any parseable raw fields untouched). */
function readConfig(file = CONFIG_FILE) {
  try {
    return mergeWithDefaults(loadConfigFromDisk(file));
  } catch (err) {
    if (err instanceof ConfigError && err.code === "config_file_corrupt") {
      return mergeWithDefaults({});
    }
    throw err; // genuine FS errors (permissions etc.) surface to the caller
  }
}

/** Runtime accessor cached in memory (main process). Never throws:
 *  a corrupt/unreadable config degrades to defaults instead of crashing
 *  the whole app. */
let _cached = null;
function getActiveConfig() {
  if (!_cached) {
    try {
      _cached = readConfig();
    } catch (err) {
      console.error("[aiConfig] Falling back to default AI config:", err.message);
      _cached = mergeWithDefaults({});
    }
  }
  return deepClone(_cached);
}
function invalidateConfigCache() {
  _cached = null;
}
function updateActiveConfig(patch) {
  const saved = saveConfig(patch);
  _cached = deepClone(saved);
  return deepClone(saved);
}

// ─── Status persistence helpers ──────────────────────────────────────────
function setStatus(state, message, extra = {}) {
  const status = {
    state,
    message: sanitizeForDisplay(message, /*includeSecretSafe*/ true),
    checkedAt: new Date().toISOString(),
    lastSuccessfulAt: state === "ok" ? new Date().toISOString() : undefined,
    ...extra,
  };
  try {
    readConfig(); // ensure file exists / validate
    updateActiveConfig({ status });
  } catch {
    /* status persistence is best-effort; never block a request over it */
  }
  return status;
}

/** Strip anything that could leak a credential out of error text. */
function sanitizeForDisplay(text) {
  return String(text)
    .replace(/(Authorization\s*:\s*Bearer\s+)\S+/gi, "$1***")
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]{8,}/g, "Bearer ***")
    .replace(/(api[_-]?key["'\s:=]+)[^\s"',;]+/gi, "$1***")
    .slice(0, 500);
}

function _clip(s, n = 80) {
  return String(s).length > n ? `${String(s).slice(0, n)}…` : String(s);
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────
const _RUNTIME = { fetchImpl: (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null) };

/** Test-safety net: run everything through fetchImpl so unit tests can
 *  inject a fake server without a live network. */
function setFetchImpl(fn) {
  _RUNTIME.fetchImpl = fn;
}
function _fetch(url, options) {
  if (!_RUNTIME.fetchImpl) {
    throw new ConfigError("No HTTP client available in this runtime.", { code: "no_http" });
  }
  return _RUNTIME.fetchImpl(url, options);
}

function authHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey && config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  return headers;
}

/** Runs `fn(signal)` racing a hard timeout that also aborts the in-flight
 *  request (for fetch impls that honour the signal). Any pre-existing
 *  caller signal is chained onto ours. */
async function withTimeout(runWithSignal, ms, config, outerSignal) {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(outerSignal?.reason ?? new Error("aborted by caller"));
  if (outerSignal) {
    if (outerSignal.aborted) onOuterAbort();
    else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timeoutReason = new ConfigError(
    `Timed out after ${Math.round(ms / 1000)}s waiting for ${_clip(config.baseURL, 60)} — the server may be busy or unreachable.`,
    { code: "timeout" }
  );
  let timer;
  try {
    return await Promise.race([
      runWithSignal(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(timeoutReason);
          reject(timeoutReason);
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
  }
}

/** Convert a timeout/abort rejection (or abort error) into ConfigError. */
function wrapFetchFailure(err, config, urlLabel) {
  if (err instanceof ConfigError && err.code === "timeout") return err;
  const aborted =
    err && (err.name === "AbortError" || err.type === "aborted" || err.code === "ABORT_ERR" || err.code === 20);
  if (aborted) {
    const reason = err && err.reason;
    if (reason instanceof ConfigError) return reason;
    return new ConfigError(`Request to ${urlLabel} was aborted/cancelled.`, { code: "aborted" });
  }
  return new ConfigError(describeNetworkError(err, config), { code: "network" });
}

function describeNetworkError(err, config) {
  const cause = err && err.cause ? err.cause : err;
  const code = cause && (cause.code || cause.errno);
  switch (code) {
    case "ECONNREFUSED":
    case "ENOENT":
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "ETIMEDOUT":
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return `Could not reach ${config.baseURL} (${code}). Start the AI server, check the port, then retry.`;
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return `TLS certificate problem talking to ${config.baseURL} (${code}).`;
    default:
      return `Network error talking to ${config.baseURL}: ${_clip(String((cause && cause.message) || err.message || err), 160)}`;
  }
}

// ─── Public operations ───────────────────────────────────────────────────

/** GET {baseURL}/models → string[] of model ids (throws ConfigError). */
async function listModels({ baseURL, apiKey, timeoutMs } = {}, configOverride = null) {
  const config = configOverride || getActiveConfig();
  const url = buildEndpointURL(baseURL || config.baseURL, "/models");
  const timeout = timeoutMs || config.timeoutMs || DEFAULT_CONFIG.timeoutMs;
  let res;
  try {
    res = await withTimeout(
      (signal) =>
        _fetch(url, {
          method: "GET",
          headers: authHeaders({ ...config, baseURL: url, apiKey }),
          signal,
        }),
      timeout,
      { baseURL: url }
    );
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw wrapFetchFailure(err, { baseURL: url }, "the model list endpoint");
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new ConfigError("The server rejected the request (HTTP " + res.status + "). Check your API key.", {
      code: "auth",
    });
  }
  if (!res.ok) {
    throw new ConfigError(
      `Model list request failed: HTTP ${res.status} ${res.statusText || ""} at ${_clip(url, 80)}`.trim(),
      { code: "models_http_error", httpStatus: res.status }
    );
  }
  const models = parseModelsResponse(text);
  if (!models.length) {
    throw new ConfigError("The endpoint responded, but returned no models.", { code: "models_empty" });
  }
  return models;
}

/** Probe the endpoint: models discovery first, minimal chat completion
 *  as fallback so servers without /models still report "connected". */
async function testConnection(overrides = {}) {
  const method = overrides.method || "models";
  try {
    if (method === "models") {
      try {
        const models = await listModels({ ...(overrides.config || {}) });
        return {
          ok: true,
          state: "ok",
          models,
          message: models.length
            ? `Connected — ${models.length} model${models.length === 1 ? "" : "s"} available.`
            : "Connected — no models reported.",
        };
      } catch (err) {
        // Host-level failures won't be fixed by probing another path; real
        // discovery gaps (bad shape/empty/404-style) fall through to chat.
        if (["auth", "network", "timeout", "aborted", "no_http", "base_url_required", "base_url_invalid"].includes(err.code)) {
          throw err;
        }
        return testConnection({ ...overrides, method: "chat" });
      }
    }
    // method === "chat"
    try {
      await chat({
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        maxTokens: 5,
        stream: false,
        timeoutMs: overrides.timeoutMs,
        config: overrides.config,
      });
      return {
        ok: true,
        state: "ok",
        models: null,
        message: "Connected — chat works, but model discovery is unavailable. Use manual model entry.",
      };
    } catch (err) {
      // The server at least answered → still "connected"; auth/timeout are
      // real failures and propagate.
      if (
        err instanceof ConfigError &&
        (err.code === "http_error" || err.code === "bad_response_shape") &&
        !(err.httpStatus === 401 || err.httpStatus === 403)
      ) {
        return {
          ok: true,
          state: "ok",
          models: null,
          message: `Server is reachable (probe returned HTTP ${err.httpStatus ?? "?"}), but model discovery is unavailable. Use manual model entry.`,
        };
      }
      throw err;
    }
    return {
      ok: true,
      state: "ok",
      models: null,
      message: "Connected — chat works, but model discovery is unavailable. Use manual model entry.",
    };
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : sanitizeForDisplay(err.message || String(err));
    return { ok: false, state: "error", models: null, error: message };
  }
}

/**
 * POST {baseURL}/chat/completions (OpenAI format).
 *  messages: [{role, content<string|array-of-parts>}]
 *  options: { model, stream, onChunk, temperature, maxTokens, timeoutMs, signal,
 *             feature } — when `feature` is given (vision/summarizer/fast),
 *             it resolves the model from featureModels first.
 *  Returns the assistant text. onChunk is called per streamed token.
 */
async function chat({ messages, model, stream = false, onChunk, temperature, maxTokens, timeoutMs, signal, feature, config: configOverride } = {}) {
  let config = configOverride && typeof configOverride === "object"
    ? mergeWithDefaults({ ...getActiveConfig(), ...configOverride })
    : getActiveConfig();
  const resolved = model || (feature ? resolveFeatureModel(feature, config) : config.model);
  if (!resolved || !String(resolved).trim()) {
    throw new ConfigError("No model selected. Open AI Settings and choose or type a model id.", {
      code: "no_model",
    });
  }
  const url = buildEndpointURL(config.baseURL, "/chat/completions");
  const body = { model: resolved.trim(), messages: messages || [], stream: Boolean(stream) };
  if (temperature !== undefined && temperature !== null && Number.isFinite(Number(temperature))) {
    body.temperature = Number(temperature);
  } else if (config.temperature !== null && Number.isFinite(Number(config.temperature))) {
    body.temperature = Number(config.temperature);
  }
  if (maxTokens !== undefined && maxTokens !== null && Number.isFinite(Number(maxTokens))) {
    body.max_tokens = Number(maxTokens);
  } else if (config.maxTokens !== null && Number.isFinite(Number(config.maxTokens))) {
    body.max_tokens = Number(config.maxTokens);
  }

  let res;
  try {
    res = await withTimeout(
      (fetchSignal) =>
        _fetch(url, {
          method: "POST",
          headers: authHeaders(config),
          body: JSON.stringify(body),
          signal: fetchSignal,
        }),
      timeoutMs || config.timeoutMs || DEFAULT_CONFIG.timeoutMs,
      config,
      signal
    );
  } catch (err) {
    const e = err instanceof ConfigError && err.code === "timeout"
      ? err
      : err instanceof ConfigError && err.code === "no_http"
        ? err
        : wrapFetchFailure(err, config, "the chat endpoint");
    setStatus("error", e.message);
    throw e;
  }

  if (!res.ok) {
    let details = "";
    try {
      const text = await res.text();
      details = text;
    } catch {
      details = "";
    }
    let message;
    const safeDetails = sanitizeForDisplay(details || "");
    if (res.status === 401 || res.status === 403) {
      message = "Authentication failed (HTTP " + res.status + "). Verify your API key in AI Settings.";
    } else if (res.status === 404) {
      message = `HTTP 404 at ${_clip(url, 90)} — check that the base URL ends in the right version path (…/v1) and the model id exists on this server.`;
    } else if (res.status === 400) {
      message = `HTTP 400 — the request was rejected (often an unsupported parameter or a model id the server doesn't know). ${safeDetails}`;
    } else if (res.status >= 500) {
      message = `HTTP ${res.status} from the AI server. ${safeDetails || "It may be loading the model — retry shortly."}`;
    } else if (res.status === 429) {
      message = "Rate limited (HTTP 429). Wait a moment and retry.";
    } else {
      message = `Chat request failed: HTTP ${res.status} ${res.statusText || ""}. ${safeDetails}`;
    }
    const e = new ConfigError(sanitizeForDisplay(message), { code: "http_error", httpStatus: res.status });
    setStatus("error", e.message);
    throw e;
  }

  try {
    if (body.stream) return await _parseStream(res, onChunk);
    const json = await res.json();
    const content =
      json.choices?.[0]?.message?.content ??
      json.choices?.[0]?.text ??
      (typeof json.response === "string" ? json.response : undefined);
    if (content === undefined || content === null) {
      throw new ConfigError(
        `The server returned a chat response without content (HTTP ${res.status}). ${typeof json === "object" ? _clip(JSON.stringify(json), 200) : ""}`.trim(),
        { code: "bad_response_shape" }
      );
    }
    setStatus("ok", `Chat OK via ${resolved.trim()}.`);
    return content;
  } catch (err) {
    if (err instanceof ConfigError) {
      setStatus("error", err.message);
      throw err;
    }
    const e = new ConfigError(`Could not parse chat response: ${sanitizeForDisplay(err.message)}`, {
      code: "bad_response_shape",
    });
    setStatus("error", e.message);
    throw e;
  }
}

async function _parseStream(res, onChunk) {
  const full = [];
  const decoder = new (typeof TextDecoder !== "undefined" ? TextDecoder : require("util").TextDecoder)("utf-8");
  let buffer = "";
  // node-fetch v2 exposes res.body as a Node stream; undici (Electron/Node 18+)
  // exposes a Web ReadableStream. Support both.
  const iterator =
    typeof res.body?.[Symbol.asyncIterator] === "function"
      ? res.body
      : res.body && typeof res.body.on === "function"
        ? toAsyncIteratorNodeStream(res.body)
        : null;
  if (!iterator) {
    // Fall back: no stream support → read everything, emit once.
    const text = await res.text();
    onChunk && onChunk(text);
    return text;
  }

  for await (const chunk of iterator) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        const joined = full.join("");
        setStatus("ok", "Streamed response complete.");
        return joined;
      }
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue; // ignore keep-alives / partial lines
      }
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text ?? "";
      if (delta) {
        full.push(delta);
        onChunk && onChunk(delta);
      }
    }
  }
  const joined = full.join("");
  setStatus("ok", "Streamed response complete.");
  return joined;
}

function toAsyncIteratorNodeStream(nodeStream) {
  return (async function* () {
    for await (const chunk of nodeStream) yield chunk;
  })();
}

// ─── Convenience wrappers ────────────────────────────────────────────────
/** Simple one-shot text prompt → completion. */
async function generateText(prompt, options = {}) {
  return chat({ messages: [{ role: "user", content: prompt }], ...options });
}

/** Multi-part vision mail: prompt + base64 screenshot (no data URL). */
async function generateVisionText({ prompt, imageBase64, mimeType = "image/png", ...options } = {}) {
  const message = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
  ];
  return chat({ messages: [{ role: "user", content: message }], feature: "vision", ...options });
}

/** Which model handles a specialised feature (falls back to main model). */
function resolveFeatureModel(feature, configInput) {
  const config = configInput || getActiveConfig();
  const f = config.featureModels && config.featureModels[feature];
  return f && String(f).trim() ? String(f).trim() : String(config.model).trim();
}

/** Public info for UIs (settings screen). Returns full config incl. key:
 *  renderer processes in AIRIS run with nodeIntegration already and are
 *  the only callers; never log the result. */
function describeForUI() {
  const cfg = getActiveConfig();
  return { ...cfg, presets: PROVIDER_PRESETS };
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  PROVIDER_PRESETS,
  ConfigError,
  // config
  readConfig,
  readConfigRaw,
  getActiveConfig,
  updateActiveConfig,
  invalidateConfigCache,
  saveConfig,
  loadConfigFromDisk,
  mergeWithDefaults,
  resolveFeatureModel,
  describeForUI,
  // urls + parsing
  normalizeBaseURL,
  buildEndpointURL,
  parseModelsResponse,
  // operations
  listModels,
  testConnection,
  chat,
  generateText,
  generateVisionText,
  setStatus,
  sanitizeForDisplay,
  // test hooks
  setFetchImpl,
};
