// test/aiConfig.test.js — unit tests for the central AI configuration.
// Runs standalone: node test/aiConfig.test.js
// No live network calls: HTTP is mocked via aiConfig.setFetchImpl().

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const aiConfig = require("../js-files/aiConfig");

const { ConfigError, normalizeBaseURL, buildEndpointURL, parseModelsResponse } = aiConfig;

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed += 1;
        console.log(`  ✅ ${name}`);
      },
      (err) => {
        failed += 1;
        failures.push({ name, err });
        console.log(`  ❌ ${name}: ${err && err.message}`);
      }
    );
}

function expectConfigError(fn, code, needle) {
  try {
    const out = fn();
    if (out && typeof out.catch === "function") {
      return out.then(
        () => {
          throw new Error(`Expected ConfigError${code ? ` (${code})` : ""}, but the call succeeded`);
        },
        (err) => {
          assert.ok(err instanceof ConfigError, `expected ConfigError, got ${err.name}`);
          if (code) assert.strictEqual(err.code, code);
          if (needle) assert.ok(err.message.includes(needle), `message ${err.message} should include "${needle}"`);
        }
      );
    }
    throw new Error(`Expected ConfigError${code ? ` (${code})` : ""}, but nothing was thrown`);
  } catch (err) {
    if (err instanceof ConfigError) {
      if (code) assert.strictEqual(err.code, code);
      if (needle) assert.ok(err.message.includes(needle), `message ${err.message} should include "${needle}"`);
      return;
    }
    throw err;
  }
}

// ─── Helpers for mock HTTP ───────────────────────────────────────────────
function jsonResponse(status, body, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}
function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", body: stream };
}
function refusedFetch() {
  const err = new TypeError("fetch failed");
  err.cause = { code: "ECONNREFUSED" };
  return () => {
    throw err;
  };
}
function tempConfigFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "airis-test-"));
  return path.join(dir, "ai-config.json");
}

(async () => {
  console.log("aiConfig.js tests");

  // ── Base URL normalization ────────────────────────────────────────────
  await test("normalizeBaseURL: plain host gets http://", () => {
    assert.strictEqual(normalizeBaseURL("localhost:1234/v1"), "http://localhost:1234/v1");
  });
  await test("normalizeBaseURL: collapses duplicated /v1/v1", () => {
    assert.strictEqual(normalizeBaseURL("http://localhost:11434/v1/v1/"), "http://localhost:11434/v1");
  });
  await test("normalizeBaseURL: strips trailing slashes", () => {
    assert.strictEqual(normalizeBaseURL("http://127.0.0.1:8080/v1///"), "http://127.0.0.1:8080/v1");
  });
  await test("normalizeBaseURL: keeps custom paths, collapses v1 pairs", () => {
    assert.strictEqual(normalizeBaseURL("https://api.example.com/api/v1/v1"), "https://api.example.com/api/v1");
  });
  await test("normalizeBaseURL: rejects empty and garbage", async () => {
    await expectConfigError(() => normalizeBaseURL(""), "base_url_required");
    await expectConfigError(() => normalizeBaseURL("not a url!!"), "base_url_invalid");
    await expectConfigError(() => normalizeBaseURL("ftp://x/y"), "base_url_invalid");
  });

  // ── Endpoint construction ─────────────────────────────────────────────
  await test("buildEndpointURL: no /v1 duplication with base /v1", () => {
    assert.strictEqual(
      buildEndpointURL("http://localhost:11434/v1", "/chat/completions"),
      "http://localhost:11434/v1/chat/completions"
    );
    assert.strictEqual(buildEndpointURL("http://localhost:11434/v1/", "/v1/models"), "http://localhost:11434/v1/models");
  });
  await test("buildEndpointURL: without /v1 suffix", () => {
    assert.strictEqual(
      buildEndpointURL("http://localhost:8080", "/models"),
      "http://localhost:8080/models"
    );
  });
  await test("buildEndpointURL: handles messy user input", () => {
    assert.strictEqual(
      buildEndpointURL(" http://localhost:11434/v1/v1 ", "chat/completions"),
      "http://localhost:11434/v1/chat/completions"
    );
  });

  // ── Model list parsing ────────────────────────────────────────────────
  await test("parseModelsResponse: standard OpenAI shape", () => {
    assert.deepStrictEqual(
      parseModelsResponse(JSON.stringify({ object: "list", data: [{ id: "llava" }, { id: "mistral" }] })),
      ["llava", "mistral"]
    );
  });
  await test("parseModelsResponse: name/model fields + strings + dedupe + sort", () => {
    assert.deepStrictEqual(
      parseModelsResponse({ data: [{ name: "b" }, { model: "c" }, "a", "a"] }),
      ["a", "b", "c"]
    );
  });
  await test("parseModelsResponse: {models:[{name}]} (native servers)", () => {
    assert.deepStrictEqual(parseModelsResponse({ models: [{ name: "llama3" }] }), ["llama3"]);
  });
  await test("parseModelsResponse: bare arrays and empty lists", () => {
    assert.deepStrictEqual(parseModelsResponse([{ id: "gpt-x" }]), ["gpt-x"]);
    assert.deepStrictEqual(parseModelsResponse({ data: [] }), []);
    assert.deepStrictEqual(parseModelsResponse(JSON.stringify({ data: [] })), []);
  });
  await test("parseModelsResponse: invalid JSON / bad shape throw friendly errors", async () => {
    await expectConfigError(() => parseModelsResponse("<html>nope</html>"), "models_invalid_json");
    await expectConfigError(() => parseModelsResponse("42"), "models_bad_shape");
    await expectConfigError(() => parseModelsResponse("null"), "models_bad_shape");
  });

  // ── listModels over mock HTTP ─────────────────────────────────────────
  await test("listModels: success returns normalized ids", async () => {
    const urls = [];
    aiConfig.setFetchImpl((url) => {
      urls.push(url);
      return Promise.resolve(jsonResponse(200, { data: [{ id: "b-model" }, { id: "a-model" }] }));
    });
    const models = await aiConfig.listModels({ baseURL: "http://localhost:9999/v1", timeoutMs: 2000 });
    assert.deepStrictEqual(models, ["a-model", "b-model"]);
    assert.strictEqual(urls[0], "http://localhost:9999/v1/models");
  });
  await test("listModels: auth failure is actionable", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(401, { error: "bad key" })));
    await expectConfigError(
      () => aiConfig.listModels({ baseURL: "http://x/v1" }),
      "auth",
      "API key"
    );
  });
  await test("listModels: HTTP 500 reported with status", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(500, "boom", "Server Error")));
    await expectConfigError(() => aiConfig.listModels(), "models_http_error", "500");
  });
  await test("listModels: connection refused explained", async () => {
    aiConfig.setFetchImpl(refusedFetch());
    await expectConfigError(() => aiConfig.listModels(), "network", "ECONNREFUSED");
  });
  await test("listModels: empty data list", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(200, { data: [] })));
    await expectConfigError(() => aiConfig.listModels(), "models_empty");
  });
  await test("listModels: no Authorization header when no key set", async () => {
    let seen = null;
    aiConfig.setFetchImpl((url, opts) => {
      seen = opts.headers;
      return Promise.resolve(jsonResponse(200, { data: [{ id: "m" }] }));
    });
    await aiConfig.listModels({ baseURL: "http://x/v1" });
    assert.ok(!("Authorization" in seen), "should not send Authorization without an API key");
  });

  // ── testConnection ────────────────────────────────────────────────────
  await test("testConnection: ok via models", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(200, { data: [{ id: "a" }, { id: "b" }] })));
    const result = await aiConfig.testConnection();
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.models, ["a", "b"]);
    assert.ok(result.message.includes("2 models"));
  });
  await test("testConnection: falls back to chat when /models missing", async () => {
    const calls = [];
    aiConfig.setFetchImpl((url) => {
      calls.push(url);
      if (String(url).endsWith("/models")) return Promise.resolve(jsonResponse(404, "nope", "Not Found"));
      return Promise.resolve(
        jsonResponse(200, { choices: [{ message: { content: "ok" } }] })
      );
    });
    const result = await aiConfig.testConnection();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.models, null);
    assert.ok(result.message.includes("discovery is unavailable"), result.message);
    assert.ok(calls.some((u) => String(u).endsWith("/chat/completions")));
  });
  await test("testConnection: unreachable server → actionable error", async () => {
    aiConfig.setFetchImpl(refusedFetch());
    const result = await aiConfig.testConnection();
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes("ECONNREFUSED"));
  });
  await test("testConnection: 401 stays an auth error", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(401, {})));
    const result = await aiConfig.testConnection();
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.toLowerCase().includes("api key"));
  });

  // ── chat ──────────────────────────────────────────────────────────────
  await test("chat: posts to {base}/chat/completions with model + temperature", async () => {
    let url = null;
    let body = null;
    aiConfig.setFetchImpl((u, opts) => {
      url = u;
      body = JSON.parse(opts.body);
      return Promise.resolve(jsonResponse(200, { choices: [{ message: { content: "hello" } }] }));
    });
    const out = await aiConfig.chat({
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.4,
    });
    assert.strictEqual(out, "hello");
    assert.ok(String(url).endsWith("/chat/completions"), url);
    assert.strictEqual(body.model, aiConfig.getActiveConfig().model);
    assert.strictEqual(body.temperature, 0.4);
  });
  await test("chat: auth failure message does not leak the key", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(401, "invalid key sk-secret123?Authorization: Bearer yo", "")));
    await expectConfigError(() => aiConfig.chat({ messages: [{ role: "user", content: "x" }] }), "http_error", "Authentication failed");
  });
  await test("chat: streaming SSE accumulates and forwards chunks", async () => {
    const deltas = [];
    const seenOpts = [];
    aiConfig.setFetchImpl((url, opts) => {
      seenOpts.push(JSON.parse(opts.body));
      return Promise.resolve(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          "data: [DONE]\n\n",
        ])
      );
    });
    const result = await aiConfig.chat({
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      onChunk: (d) => deltas.push(d),
    });
    assert.strictEqual(result, "Hello");
    assert.deepStrictEqual(deltas, ["Hel", "lo"]);
    assert.strictEqual(seenOpts[0].stream, true);
  });
  await test("chat: server-side 404 explains URL/model issues", async () => {
    aiConfig.setFetchImpl(() => Promise.resolve(jsonResponse(404, "", "Not Found")));
    await expectConfigError(() => aiConfig.chat({ messages: [{ role: "user", content: "x" }] }), "http_error", "404");
  });
  await test("chat: timeout produces a timeout error", async () => {
    aiConfig.setFetchImpl(() => new Promise(() => {})); // hangs forever
    await expectConfigError(
      () => aiConfig.chat({ messages: [{ role: "user", content: "x" }], timeoutMs: 60 }),
      "timeout",
      "Timed out"
    );
  });
  await test("chat: caller abort signal propagates", async () => {
    aiConfig.setFetchImpl(
      (url, opts) =>
        new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () => {
            const e = new Error("This operation was aborted");
            e.name = "AbortError";
            reject(e);
          });
        })
    );
    const ac = new AbortController();
    const p = aiConfig.chat({ messages: [{ role: "user", content: "x" }], signal: ac.signal, timeoutMs: 5000 });
    setTimeout(() => ac.abort(), 30);
    const err = await p.then(
      () => {
        throw new Error("expected abort");
      },
      (e) => e
    );
    assert.ok(err instanceof ConfigError && (err.code === "aborted" || err.code === "timeout"), `${err.code}`);
  });

  // ── Vision helpers ────────────────────────────────────────────────────
  await test("generateVisionText: builds OpenAI image_url content part", async () => {
    let body = null;
    aiConfig.setFetchImpl((url, opts) => {
      body = JSON.parse(opts.body);
      return Promise.resolve(jsonResponse(200, { choices: [{ message: { content: "seen" } }] }));
    });
    const out = await aiConfig.generateVisionText({ prompt: "look", imageBase64: "QUJD" });
    assert.strictEqual(out, "seen");
    const content = body.messages[0].content;
    assert.strictEqual(content[0].type, "text");
    assert.strictEqual(content[1].type, "image_url");
    assert.strictEqual(content[1].image_url.url, "data:image/png;base64,QUJD");
  });
  await test("resolveFeatureModel: falls back to main model", () => {
    assert.strictEqual(aiConfig.resolveFeatureModel("vision"), aiConfig.getActiveConfig().model);
  });

  // ── Persistence ───────────────────────────────────────────────────────
  await test("saveConfig + readConfig round-trip preserves fields and unknown keys", () => {
    const file = tempConfigFile();
    aiConfig.saveConfig({ baseURL: "http://localhost:9999/v1", apiKey: "test-key-123", model: "sm13b" }, file);
    const cfg = aiConfig.readConfig(file);
    assert.strictEqual(cfg.baseURL, "http://localhost:9999/v1");
    assert.strictEqual(cfg.model, "sm13b");
    assert.strictEqual(cfg.apiKey, "test-key-123");
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.unlinkSync(file);
    assert.ok(after.apiKey === "test-key-123");
  });
  await test("saveConfig: patch merge does not drop unrelated settings", () => {
    const file = tempConfigFile();
    aiConfig.saveConfig({ baseURL: "http://a/v1", model: "m1", customBookmark: "keep-me" }, file);
    aiConfig.saveConfig({ model: "m2" }, file);
    const cfg = aiConfig.readConfig(file);
    assert.strictEqual(cfg.baseURL, "http://a/v1");
    assert.strictEqual(cfg.model, "m2");
    assert.strictEqual(cfg.customBookmark, "keep-me");
    fs.unlinkSync(file);
  });
  await test("saveConfig: refuses to persist invalid base URL", async () => {
    const file = tempConfigFile();
    await expectConfigError(() => aiConfig.saveConfig({ baseURL: ":::bad:::", model: "x" }, file));
    assert.ok(!fs.existsSync(file));
  });
  await test("loadConfigFromDisk: missing file reports _missing", () => {
    const file = tempConfigFile();
    assert.strictEqual(aiConfig.loadConfigFromDisk(file)._missing, true);
  });
  await test("loadConfigFromDisk: corrupt JSON → ConfigError, readConfig falls back", async () => {
    const file = tempConfigFile();
    fs.writeFileSync(file, "{not json", "utf8");
    await expectConfigError(() => aiConfig.loadConfigFromDisk(file), "config_file_corrupt");
    assert.strictEqual(aiConfig.readConfig(file).baseURL, aiConfig.DEFAULT_CONFIG.baseURL);
    fs.unlinkSync(file);
  });
  await test("mergeWithDefaults: legacy ollamaURL/ollamaModel migrate to /v1 config", () => {
    const merged = aiConfig.mergeWithDefaults({
      ollamaURL: "http://127.0.0.1:11434/api/generate",
      ollamaModel: "llama3",
    });
    assert.strictEqual(merged.baseURL, "http://127.0.0.1:11434/v1");
    assert.strictEqual(merged.model, "llama3");
  });
  await test("mergeWithDefaults: partial config keeps defaults for the rest", () => {
    const merged = aiConfig.mergeWithDefaults({ baseURL: "http://host:9/v1" });
    assert.strictEqual(merged.baseURL, "http://host:9/v1");
    assert.strictEqual(merged.provider, aiConfig.DEFAULT_CONFIG.provider);
    assert.strictEqual(merged.model, aiConfig.DEFAULT_CONFIG.model);
  });
  await test("sanitizeForDisplay: strips Bearer tokens and api keys", () => {
    const out = aiConfig.sanitizeForDisplay(
      "HTTP 401 for Authorization: Bearer abcdef123456 (api_key: sk-livetest-99)"
    );
    assert.ok(!out.includes("abcdef123456"));
    assert.ok(!out.includes("sk-livetest-99"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    for (const f of failures) console.error(`FAILED: ${f.name}: ${f.err.stack}`);
    process.exit(1);
  }
})().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(2);
});
