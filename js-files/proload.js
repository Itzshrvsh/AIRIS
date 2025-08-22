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
contextBridge.exposeInMainWorld('api', {
  requestWink: (data) => ipcRenderer.invoke('do-wink', data),
  askAI: async (text) => ipcRenderer.invoke('ask-ai', text)
});
