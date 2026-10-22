const { contextBridge, ipcRenderer } = require('electron');

// Every method lives in ONE object: registering `electronAPI` twice throws
// "Failed to execute 'exposeInMainWorld'" and kills the whole preload.
const electronAPI = {
  // messaging / settings
  onForceClose: (callback) => ipcRenderer.on('force-close-box', callback),
  onMessage: (callback) => ipcRenderer.on('display-message', (_, data) => callback(data)),
  sendSummaryChoice: (choice) => ipcRenderer.send('yt-summary-choice', choice),
  onInit: (callback) => ipcRenderer.on("initialize-settings", (event, data) => callback(data)),
  sendSettings: (settings) => ipcRenderer.send("save-settings", settings),
  showMessage: () => ipcRenderer.send("createMenuWindow"),
  allowMouse: () => ipcRenderer.send('allow-mouse-events'),
  ignoreMouse: () => ipcRenderer.send('ignore-mouse-events'),

  // command execution
  runCommand: (cmd) => ipcRenderer.invoke("run-command", cmd),

  // window helpers
  resizeWindow: (width, height) => ipcRenderer.send("resize-window", { width, height }),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", ignore),

  // AI (legacy single-shot flow, uses the central configuration)
  askAI: (input) => ipcRenderer.invoke("ask-ai", input),
  focusInput: (callback) => ipcRenderer.on("focus-input", callback),

  // Central AI provider configuration (single source of truth)
  aiConfig: {
    get: () => ipcRenderer.invoke("ai-config:get"),
    set: (patch) => ipcRenderer.invoke("ai-config:set", patch),
    test: (overrides) => ipcRenderer.invoke("ai-config:test", overrides),
    models: (overrides) => ipcRenderer.invoke("ai-config:models", overrides),
    chat: (payload) => ipcRenderer.invoke("ai:chat", payload),
    onChanged: (cb) => ipcRenderer.on("ai-config-changed", (_e, cfg) => cb(cfg)),
  },

  openAISettings: () => ipcRenderer.send("open-ai-settings"),
  closeAISettings: () => ipcRenderer.send("close-ai-settings"),
  openHelp: () => ipcRenderer.send("open-help"),
  closeHelp: () => ipcRenderer.send("close-help"),
};

const airisAPI = {
  invokeInput: () => ipcRenderer.invoke('show-automate-input'),
  sendInstruction: (instr) => ipcRenderer.send('send-to-python', instr),
  onPythonResponse: (callback) => ipcRenderer.on('python-response', (e, msg) => callback(msg))
};

// contextBridge only works when contextIsolation is enabled. AIRIS windows
// currently run with contextIsolation disabled (nodeIntegration on), so fall
// back to assigning the same objects on the page's global object.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  contextBridge.exposeInMainWorld('AIRIS', airisAPI);
} else {
  window.electronAPI = electronAPI;
  window.AIRIS = airisAPI;
}
