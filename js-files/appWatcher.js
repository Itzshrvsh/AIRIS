// appWatcher.js — background app-watching roaster.
const activeWin = require('active-win');
const { askAI } = require('./aiRequest');
const { sendRoastToRenderer } = require('./mainRoaster');

let lastApp = "";

async function checkAppLoop() {
  try {
    const win = await activeWin();
    if (!win || !win.owner || !win.owner.name) return;

    const appName = win.owner.name.toLowerCase();

    if (appName !== lastApp) {
      lastApp = appName;

      const roast = await askAI(`user have opened ${appName} roast accoding to the app in just 1 line , it must be simply sweet : dont let the user know what are you going to say , say about the app the user opened .`);
      sendRoastToRenderer(`Hmm... ${appName}? ` + roast);
    }
  } catch (err) {
    console.error("[appWatcher] Loop error:", err.message || err);
  }
}

function startAppWatcher(interval = 1200000) {
  setInterval(checkAppLoop, interval);
  // fire-and-forget first check so startup watcher errors are logged, not unhandled
  checkAppLoop().catch(() => {});
}

module.exports = { startAppWatcher };
