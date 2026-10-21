// scripts/active-win-check.js — is active-win's binary N-API-compatible with
// Electron's ABI (run inside the real Electron runtime):
//    npx electron scripts/active-win-check.js
(async () => {
  try {
    const activeWindow = require("active-win");
    const win = await activeWindow();
    console.log("active-win OK under Electron:", win && win.owner ? win.owner.name : "(no focused window)");
    process.exit(0);
  } catch (err) {
    console.error("active-win FAILED under Electron:", err.message || err);
    process.exit(1);
  }
})();
