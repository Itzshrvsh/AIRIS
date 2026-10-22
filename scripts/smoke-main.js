// scripts/smoke-main.js — electron-side smoke test.
// Boots the Electron main-process runtime and requires every AI-related
// module WITHOUT creating windows, registering shortcuts or touching the
// desktop. Verifies native modules + central AI config load in the real
// Electron environment:
//    npx electron scripts/smoke-main.js
const { app } = require("electron");

app
  .whenReady()
  .then(async () => {
    const checks = [];
    const t = (name, fn) => {
      try {
        fn();
        checks.push(`✅ ${name}`);
      } catch (err) {
        checks.push(`❌ ${name}: ${err.message}`);
        process.exitCode = 1;
      }
    };

    console.log("electron:", process.versions.electron, "| node:", process.versions.node);

    t("aiConfig module + defaults", () => {
      const c = require("../js-files/aiConfig");
      const cfg = c.getActiveConfig();
      if (typeof cfg !== "object" || !cfg.baseURL) throw new Error("bad config shape");
      if (typeof c.chat !== "function") throw new Error("chat missing");
    });

    t("supabaseClient env-based", () => {
      const s = require("../supabaseClient");
      if (!("supabase" in s)) throw new Error("exports missing");
    });

    t("aiRequest wrapper", () => {
      const a = require("../js-files/aiRequest");
      if (typeof a.askAI !== "function") throw new Error("askAI missing");
    });

    t("screenObserver", () => {
      const s = require("../js-files/screenObserver");
      if (typeof s.analyzeScreen !== "function") throw new Error("analyzeScreen missing");
    });

    t("memoryManager", () => {
      const m = require("../memoryManager");
      if (typeof m.remember !== "function") throw new Error("remember missing");
    });

    t("input control: robotjs or pyautogui worker", () => {
      const { robot } = require("../js-files/input");
      if (typeof robot.keyTap !== "function" || typeof robot.getMousePos !== "function") {
        throw new Error("input API incomplete");
      }
      console.log("    → input backend:", robot.__backend);
      const pos = robot.getMousePos();
      if (typeof pos?.x !== "number") throw new Error("getMousePos broken");
      robot.setKeyboardDelay(20); // exercises the backend path
    });

    t("live central-config model discovery (config file or default)", () => {
      const c = require("../js-files/aiConfig");
      const cfg = c.getActiveConfig();
      if (!c.buildEndpointURL(cfg.baseURL, "/models").includes("/models")) {
        throw new Error("endpoint construction broken");
      }
    });

    for (const line of checks) console.log(line);
    console.log(process.exitCode ? "SMOKE TEST FAILED" : "SMOKE TEST PASSED");
  })
  .then(() => app.exit(process.exitCode || 0))
  .catch((err) => {
    console.error("smoke test crashed:", err);
    app.exit(1);
  });
