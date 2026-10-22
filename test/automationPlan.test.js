// test/automationPlan.test.js — plan parse/validate/execute + app launcher.

const assert = require("assert");
const { readFileSync, mkdtempSync, writeFileSync, mkdirSync } = require("fs");
const os = require("os");
const path = require("path");
const {
  PlanError,
  parsePlan,
  validatePlan,
  executePlan,
  ACTION_TYPES,
  MAX_STEPS,
} = require("../js-files/automationPlan");
const {
  normalizeRequest,
  scoreName,
  scanStartMenu,
  pickBestCandidate,
  isHttpTarget,
  buildLaunchCommand,
} = require("../js-files/appLauncher");

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
    fail++;
  }
}

console.log("automationPlan.js tests");

test("parsePlan: accepts JSON inside markdown fences", () => {
  const raw = "Sure!\n```json\n{\"steps\":[{\"action\":\"say\",\"text\":\"hi\"}]}\n```";
  const plan = parsePlan(raw);
  assert.strictEqual(plan.steps.length, 1);
});

test("parsePlan: accepts a bare array", () => {
  const plan = parsePlan('[{"action":"say","text":"hello"}]');
  assert.strictEqual(plan.steps[0].action, "say");
});

test("parsePlan: throws a friendly error on non-JSON", () => {
  assert.throws(() => parsePlan("no json here"), PlanError);
});
test("parsePlan: throws on missing steps", () => {
  assert.throws(() => parsePlan('{"steps":"x"}'), /steps/);
});

test("validatePlan: normalizes + cleans valid actions", () => {
  const v = validatePlan({
    steps: [
      { action: "open", target: "https://mail.google.com" },
      { action: "wait", seconds: 2 },
      { action: "hotkey", keys: "ctrl t" },
      { action: "press", key: "ENTER" },
      { action: "say", text: "" }, // dropped, not an error
      { action: "type", text: "hello" },
    ],
  });
  assert.strictEqual(v.n, 5);
  assert.strictEqual(v.steps[1].action, "wait");
  assert.strictEqual(v.steps[1].ms, 2000);
  assert.deepStrictEqual(v.steps[2].keys, ["ctrl", "t"]);
  assert.strictEqual(v.steps[3].key, "enter");
  assert.ok(!v.steps.some((s) => s.action === "say"));
});

test("validatePlan: rejects unknown actions", () => {
  assert.throws(
    () => validatePlan({ steps: [{ action: "format", target: "c:" }] }),
    /unknown action/
  );
});

test("validatePlan: enforces step cap", () => {
  const many = { steps: Array.from({ length: MAX_STEPS + 3 }, () => ({ action: "wait", ms: 100 })) };
  assert.throws(() => validatePlan(many), /too long/);
});

test("validatePlan: deny-listed commands are rejected", () => {
  assert.throws(
    () => validatePlan({ steps: [{ action: "command", command: "del /s C:\\Windows" }] }),
    /safety policy/
  );
  assert.throws(
    () => validatePlan({ steps: [{ action: "command", command: "shutdown /r /t 0" }] }),
    /safety policy/
  );
});

test("validatePlan: wait clamped to max", () => {
  const v = validatePlan({ steps: [{ action: "wait", ms: 999999 }] });
  assert.strictEqual(v.steps[0].ms, 20000);
});

test("validatePlan: type length cap", () => {
  assert.throws(
    () => validatePlan({ steps: [{ action: "type", text: "x".repeat(3001) }] }),
    /too long/
  );
  // paste is allowed to be long
  validatePlan({ steps: [{ action: "paste", text: "x".repeat(3001) }] });
});

test("executePlan: runs steps and streams results", async () => {
  const seen = [];
  const result = await executePlan(
    { steps: [{ action: "say", text: "a" }, { action: "say", text: "b" }] },
    {
      runners: { say: async (s) => s.text },
      isAborted: () => false,
      onResult: (r) => seen.push(r),
    }
  );
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(seen.map((r) => r.detail), ["a", "b"]);
});

test("executePlan: stops on first failure", async () => {
  const seen = [];
  const result = await executePlan(
    { steps: [{ action: "say", text: "a" }, { action: "command", command: "boom" }] },
    {
      runners: {
        say: async () => "a",
        command: async () => { throw new Error("nope"); },
      },
      isAborted: () => false,
      onResult: (r) => seen.push(r),
    }
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.aborted, false);
  assert.strictEqual(seen.length, 2);
  assert.strictEqual(seen[1].detail, "nope");
});

test("executePlan: aborts before the next step", async () => {
  let aborting = false;
  const result = await executePlan(
    { steps: [{ action: "say", text: "a" }, { action: "say", text: "b" }] },
    {
      runners: { say: async (s) => { if (s.text === "a") aborting = true; return s.text; } },
      isAborted: () => aborting,
      onResult: () => {},
    }
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.aborted, true);
});

console.log("\nappLauncher.js tests");

test("normalizeRequest strips filler verbs and politeness", () => {
  assert.strictEqual(normalizeRequest("Can you please open the Spotify?"), "spotify");
  assert.strictEqual(normalizeRequest("open https://mail.google.com"), "https://mail.google.com");
  assert.strictEqual(normalizeRequest("launch Visual Studio Code"), "visual studio code");
});

test("normalizeRequest drops trailing 'app'", () => {
  assert.strictEqual(normalizeRequest("start calculator app"), "calculator");
});

test("scoreName prefers exact/word matches", () => {
  assert.ok(scoreName("spotify", "spotify") > 0.99);
  assert.ok(scoreName("Google Chrome", "chrome") > 0.8);
  assert.ok(scoreName("Task Scheduler", "spotify") < 0.55);
});

test("scanStartMenu walks folders and collects links", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "startmenu-"));
  mkdirSync(path.join(tmp, "Programs", "Spotify"), { recursive: true });
  mkdirSync(path.join(tmp, "Programs", "Docs"), { recursive: true });
  writeFileSync(path.join(tmp, "Programs", "Spotify", "Spotify.lnk"), "");
  writeFileSync(path.join(tmp, "Programs", "Spotify", "notes.txt"), "");
  writeFileSync(path.join(tmp, "Programs", "Spotify", "spotify.exe"), "");
  const links = scanStartMenu([tmp]);
  assert.strictEqual(links.length, 2);
  assert.ok(links.some((l) => l.name === "Spotify" && l.path.endsWith(".lnk")));
  // missing dirs are ignored
  assert.strictEqual(scanStartMenu([path.join(tmp, "nope")]).length, 0);
});

test("pickBestCandidate returns null under low confidence", () => {
  const candidates = [
    { name: "Task Scheduler", path: "C:\\x\\taskschd.lnk" },
    { name: "Notepad", path: "C:\\x\\notepad.lnk" },
  ];
  assert.strictEqual(pickBestCandidate("spotify", candidates), null);
  assert.strictEqual(pickBestCandidate("notepad", candidates)?.name, "Notepad");
});

test("isHttpTarget detects URLs", () => {
  assert.strictEqual(isHttpTarget("https://mail.google.com"), true);
  assert.strictEqual(isHttpTarget("www.youtube.com"), true);
  assert.strictEqual(isHttpTarget("spotify"), false);
});

test("buildLaunchCommand quotes safely", () => {
  assert.strictEqual(
    buildLaunchCommand("https://mail.google.com", null),
    'start "" "https://mail.google.com"'
  );
  assert.strictEqual(
    buildLaunchCommand("spotify", { name: "Spotify", path: "C:\\Progs\\Spotify.lnk" }),
    'start "" "C:\\Progs\\Spotify.lnk"'
  );
  // Double quotes are stripped so the target can't break out of the quoting.
  assert.strictEqual(
    buildLaunchCommand('x" & del /q y', null),
    'start "" "x & del /q y"'
  );
});

// ─── Static wiring checks on index.js ───────────────────────────────
const indexSrc = readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
test("index.js executes to plan engine (no old Neuralis-ai)", () => {
  assert.ok(!indexSrc.includes('"Neuralis-ai"'), "old Neuralis-ai handler still wired");
  assert.ok(indexSrc.includes('"Neuralis-plan"'));
  assert.ok(indexSrc.includes("neuralis-abort"));
  assert.ok(indexSrc.includes('require("./js-files/automationPlan")'));
  assert.ok(indexSrc.includes('require("./js-files/appLauncher")'));
});

test("index.js no longer uses the app watcher", () => {
  assert.ok(!indexSrc.includes("startAppWatcher"));
  assert.ok(!indexSrc.includes('require("active-win")'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
