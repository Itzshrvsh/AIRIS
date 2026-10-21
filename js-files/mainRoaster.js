const { BrowserWindow } = require("electron");

function sendRoastToRenderer(text) {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents);
  if (win) win.webContents.send("ai-roast", text);
  else console.log("[roast]", String(text).slice(0, 200));
}

module.exports = { sendRoastToRenderer };
