const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // your earlier stuff
  onForceClose: (callback) => ipcRenderer.on('force-close-box', callback),
  onMessage: (callback) => ipcRenderer.on('display-message', (_, data) => callback(data)),
  sendSummaryChoice: (choice) => ipcRenderer.send('yt-summary-choice', choice),
  onInit: (callback) => ipcRenderer.on("initialize-settings", (event, data) => callback(data)),
  sendSettings: (settings) => ipcRenderer.send("save-settings", settings),
  showMessage: () => ipcRenderer.send("createMenuWindow"),
  allowMouse: () => ipcRenderer.send('allow-mouse-events'),
  ignoreMouse: () => ipcRenderer.send('ignore-mouse-events'),

  // command execution
  runCommand: (cmd) => ipcRenderer.invoke("run-command", cmd)
});

// keep api separate if you want

contextBridge.exposeInMainWorld("electronAPI", {
  resizeWindow: (width, height) => ipcRenderer.send("resize-window", { width, height }),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", ignore)
});

contextBridge.exposeInMainWorld("electronAPI", {
  askAI: (input) => ipcRenderer.invoke("ask-ai2", input),
  focusInput: (callback) => ipcRenderer.on("focus-input", callback),
});