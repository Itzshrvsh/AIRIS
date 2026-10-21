// index.js — main Electron process
// At the top of main.js


const { app, ipcMain, globalShortcut, clipboard, screen, shell, BrowserWindow, Tray, Menu, dialog} = require("electron");
const path = require("path");
const ytdl = require("@distube/ytdl-core");
// const { summarizeYouTubeVideo } = require("./modules/ytSummarizer");
const fs = require("fs");
const { spawn, exec , execSync } = require("child_process");
const util = require("util");
const robot = require("robotjs");
const {summarizeYouTubeVideo} = require("./modules/transcriber");
const { execFile } = require("child_process");

const activeWindow = require("active-win");
let storedText = '';
let  splashWindow;
let popupWindow;
const YouTube = require('youtube-sr').default; // npm install youtube-sr
const play = require('play-dl');
const userName = "sharvesh";
const stringSimilarity = require("string-similarity"); // npm i string-similarity
const ws = require("windows-shortcuts");
const axios = require('axios');
const clipboardy = require('clipboardy');
let pyProcess = null;

/**
 * Generate code from a natural-language request via the central AI config.
 * Used by the "paste_code" intent of the ask-ai flow. The generator config:
 * ─ provider/base URL/key/model are shared with every other AI feature.
 */
async function generateCodeFromRequest(request) {
  const prompt = `
You are AIRIS — an expert code generator.
Write complete, runnable code for the following request.
Return ONLY the code inside one fenced block (e.g. \`\`\`python ... \`\`\`).
No explanations before or after.

Request: ${request}
`.trim();

  const raw = (await aiConfig.generateText(prompt, { maxTokens: 900 })) || "";
  const match = raw.match(/```[a-z]*\n([\s\S]*?)```/i);
  if (match && match[1] && match[1].trim()) return match[1].trim();
  // Model sometimes returns bare code without fences
  return raw.trim();
}
// ─── Local imports ──────────────────────────────────────────────
const { askAI } = require("./js-files/aiRequest");
const { analyzeScreen , setMainWindow } = require('./js-files/screenObserver');
const { analyzeSentiment } = require("./js-files/sentimentAnalyzer");
const { generateCodePatch } = require("./js-files/patchinganalyser");
const { startAppWatcher } = require("./js-files/appWatcher");
const { runYouTubeSummaryWithProgress } = require("./js-files/youtubeSummarizer");
const { saveCodeToDesktop } = require("./js-files/fileGenerator");
const { remember, recall, logChat } = require("./memoryManager");
const systemInstructions = require("./js-files/systemInstructions");
// ─── Central AI configuration ─────────────────────────────────
const aiConfig = require("./js-files/aiConfig");

// ─── AI Settings window (single source of truth for provider/model) ──────
let aiSettingsWindow = null;

function createAISettingsWindow(focusOnly = true) {
  if (aiSettingsWindow && !aiSettingsWindow.isDestroyed()) {
    if (focusOnly) {
      aiSettingsWindow.show();
      aiSettingsWindow.focus();
    }
    return aiSettingsWindow;
  }
  aiSettingsWindow = new BrowserWindow({
    width: 620,
    height: 740,
    minWidth: 520,
    minHeight: 560,
    title: "AIRIS — AI Settings",
    backgroundColor: "#0b1220",
    frame: false,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: [],
    },
  });
  aiSettingsWindow.setMenuBarVisibility(false);
  aiSettingsWindow.loadFile("settings.html");
  aiSettingsWindow.on("closed", () => { aiSettingsWindow = null; });
  return aiSettingsWindow;
}

// Central AI config IPC. The settings window is the only caller that
// needs the raw API key; nobody should log it.
ipcMain.handle("ai-config:get", () => aiConfig.describeForUI());

ipcMain.handle("ai-config:set", (event, patch) => {
  const clean = patch && typeof patch === "object" ? patch : {};
  delete clean.presets; // not persistable
  let saved;
  try {
    saved = aiConfig.updateActiveConfig(clean);
  } catch (err) {
    console.error("[ai-config:set] rejected:", err.message);
    return { ok: false, error: err.message };
  }
  // Every window re-reads config on demand, but notify listeners.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("ai-config-changed", saved);
    }
  }
  return { ok: true, config: saved };
});

// Test connection against either the saved config or the values currently
// typed in the settings form (passed as overrides.config).
ipcMain.handle("ai-config:test", async (_event, overrides = {}) => {
  const result = await aiConfig.testConnection({ config: overrides });
  const statusPatch = {
    state: result.ok ? "ok" : "error",
    message: result.ok ? result.message : result.error,
    checkedAt: new Date().toISOString(),
  };
  try { aiConfig.setStatus(result.ok ? "ok" : "error", statusPatch.message); } catch { /* best-effort */ }
  return result;
});

ipcMain.handle("ai-config:models", async (_event, overrides = {}) => {
  try {
    const models = await aiConfig.listModels({ ...(overrides || {}) });
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
});

ipcMain.on("open-ai-settings", () => {
  createAISettingsWindow(true);
});

ipcMain.on("close-ai-settings", () => {
  if (aiSettingsWindow && !aiSettingsWindow.isDestroyed()) aiSettingsWindow.close();
});

ipcMain.handle("ai:chat", async (_event, payload = {}) => {
  // Renderer windows (terminal, etc.) route AI calls through the main
  // process so they always share the central configuration.
  try {
    const text = await aiConfig.chat({
      messages: Array.isArray(payload.messages) ? payload.messages : [{ role: "user", content: String(payload.content ?? "") }],
      stream: false,
      feature: payload.feature,
      maxTokens: payload.maxTokens,
      temperature: payload.temperature,
    });
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
let latestCopiedText = '';
// ─── Globals ───────────────────────────────────────────────────
let mainWindow, menuWindow, inputWindow, messageWindow, glowWindow, terminalWin, tray, inputfield;
let lastCursorPos = null;
let isOllamaProcessing = false;
const execPromise = util.promisify(exec);
let neuraliswindow;
// ─── User / Global Settings ────────────────────────────────────
let userSettings = {
  aiMode: "manual",
  enableRoasting: true,
  enableYouTubeSummary: true,
  enableEyeTracking: true,
  enableHandGestures: true,
  replyLang: "en-IN",
  voiceLang: "en-IN",
  voiceSpeed: 1.0,
};

let systemPrompt = "";
(async () => {
  try {
    systemPrompt = await fs.promises.readFile(
      path.join(__dirname, "./system_prompt.txt"),
      "utf8"
    );
  } catch (err) {
    console.error("❌ Failed to load system prompt:", err.message);
  }
})();
let autoCloseTimer;
const dotenvPath = path.join(__dirname, '.env'); // adjust if your .env is elsewhere
// ─── Load environment first ─────────────────────────────

require('dotenv').config({ path: dotenvPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase URL or Key missing — memory features disabled (set SUPABASE_URL/SUPABASE_KEY in .env)');
}

const { createClient } = require('@supabase/supabase-js');
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
let menuOptions = {
  chatbot: false,
  terminal: false,
  // you can add more toggles if needed
};
// ─── Then Electron and other modules ───────────────────


let menuuiwindow = null; // track window instance
function forceAlwaysOnTop(win) {
  if (!win || win.isDestroyed()) return;

  // Ensures window stays above everything, even full-screen apps
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setFullScreenable(false);
}

// ─── Window Creators ───────────────────────────────────────────
// Create the popup safely
function showPopup(mouseX, mouseY) {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const popupWidth = 250;
  const popupHeight = 140;

  let popupX = mouseX + 10;
  let popupY = mouseY + 10;

  if (popupX + popupWidth > screenWidth) popupX = screenWidth - popupWidth - 10;
  if (popupY + popupHeight > screenHeight) popupY = screenHeight - popupHeight - 10;

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    x: popupX,
    y: popupY,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  popupWindow.loadFile('popup.html');
  
  forceAlwaysOnTop(popupWindow);
  // ❌ Remove auto-close timer — just close on user selection
  popupWindow.on('closed', () => { popupWindow = null; });
}

// ─── Utility ───────────────────────────────────────────────────
// (closeAllWindowsExcept is defined below in the Utility section)

// ─── Window Creators ───────────────────────────────────────────
// function createMenuWindow() {
//   menuWindow = new BrowserWindow({
//     width: 390,
//     height: 300,
//     resizable: false,
//     fullscreenable: false,
//     frame: true,
//     webPreferences: {
//       preload: path.join(__dirname, "./js-files/proload.js"),
//       nodeIntegration: true,
//       contextIsolation: false,
//     },
//   });

//   menuWindow.loadFile("menu.html");
//   menuWindow.on("closed", () => (menuWindow = null));
// }

function ensureMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  closeAllWindowsExcept(null);
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  forceAlwaysOnTop(mainWindow);
  mainWindow.loadFile("index.html");
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);

  globalShortcut.register("Control+Shift+N", () => {
    mainWindow.webContents.send("shortcut-wink");
  });

  setMainWindow(mainWindow);
  ensureTray();

  mainWindow.on("closed", () => (mainWindow = null));
  return mainWindow;
}

function createMainWindow() {
  ensureMainWindow();
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return;
  try {
    const trayIcon = path.join(__dirname, app.isPackaged ? "icon.png" : "icon.ico");
    const iconPath = fs.existsSync(trayIcon) ? trayIcon : path.join(__dirname, "icon.png");
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: "Show App", click: () => ensureMainWindow() },
      { label: "AI Settings", click: () => createAISettingsWindow(true) },
      { label: "Quit", click: () => app.quit() },
    ]);
    tray.setToolTip("AIRIS");
    tray.setContextMenu(contextMenu);
  } catch (err) {
    console.warn("⚠️ Tray could not be created:", err.message);
  }
}

function destroySplashOnce() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
  }
  splashWindow = null;
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }, 
  });

  splashWindow.loadFile("splash.html");
  forceAlwaysOnTop(splashWindow);

  // Any of these paths finishes the splash exactly once:
  //  - renderer sends "splash-finished" when the intro video ends
  //  - this safety timeout fires (video codec issues / disabled autoplay)
  let splashDone = false;
  splashWindow.on("close", (e) => {
    if (!splashDone) e.preventDefault();
    else destroySplashOnce();
  });
  ipcMain.once("splash-finished", () => {
    if (splashDone) return;
    splashDone = true;
    ensureMainWindow();
    destroySplashOnce();
  });
  setTimeout(() => {
    if (splashDone) return;
    splashDone = true;
    ensureMainWindow();
    destroySplashOnce();
  }, 6000);
}
function createTerminalWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  terminalWin = new BrowserWindow({
    width: 700,
    height: height,
    x: width - 700,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  forceAlwaysOnTop(terminalWin);
  terminalWin.loadFile("termi.html");
  terminalWin.on("closed", () => (terminalWin = null));
  terminalWin.once("ready-to-show", () => {
    terminalWin.show();
    terminalWin.focus();
  });
}

function openAIInputWindow() {
  if (inputWindow) return inputWindow.focus();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  inputWindow = new BrowserWindow({
    width: 700,
    height: height,
    x: width - 700,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  forceAlwaysOnTop(inputWindow);
  inputWindow.loadFile("ai_input.html");
  inputWindow.on("closed", () => (inputWindow = null));
}


function createMenuUI() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 400, winHeight = 600;

  if (menuuiwindow) {
    menuuiwindow.show();
    return menuuiwindow;
  }

  menuuiwindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    // 👇 Position near bottom-left corner
    x: 2,
    y: height - winHeight - 20,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true, // allow keyboard input for search
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  forceAlwaysOnTop(menuuiwindow);
  menuuiwindow.setIgnoreMouseEvents(false);
  menuuiwindow.removeMenu();
  menuuiwindow.loadFile('menuui.html');

  // Fade-in style appearance
  menuuiwindow.once('ready-to-show', () => {
    menuuiwindow.showInactive(); // show without stealing focus
  });

  // Instead of closing, just hide
  // Instead of closing, just hide
  menuuiwindow.on('close', (e) => {
    e.preventDefault();
    if (menuuiwindow && !menuuiwindow.isDestroyed()) {
      menuuiwindow.hide();
    }
  });
  

  return menuuiwindow;
}


function showMessageWindow(msg, options = {}) {
  const { updateExisting = false, autoClose = false } = options;

  if (messageWindow && !messageWindow.isDestroyed() && updateExisting) {
    messageWindow.webContents.send('display-message', msg);
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 600, windowHeight = height;

  messageWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: width - windowWidth,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,          // click-through
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  forceAlwaysOnTop(messageWindow);
  messageWindow.setIgnoreMouseEvents(true); // click-through
  messageWindow.setAlwaysOnTop(true, 'screen-saver');
  messageWindow.loadFile("messagewin.html");

  messageWindow.once('ready-to-show', () => {
    messageWindow.showInactive();
    messageWindow.webContents.send('display-message', msg);

    if (autoClose) {
      setTimeout(() => messageWindow.close(), 8000);
    }
  });

  messageWindow.on("closed", () => messageWindow = null);
}


// ─── functions ───────────────────────────────────────────────────────


async function openNEURALIS(msg = null, updateExisting = true) {
  try {
    // 1️⃣ If an existing window is open and valid, reuse it
    if (neuraliswindow && !neuraliswindow.isDestroyed()) {
      if (updateExisting) {
        neuraliswindow.show(); // ensure visible
        if (msg) neuraliswindow.webContents.send('display-message', msg);
      }
      return;
    }

    // 2️⃣ Get display size (can later be adapted for multi-monitor)
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    // 3️⃣ Create new BrowserWindow
    neuraliswindow = new BrowserWindow({
      width: 420,
      height: height,
      x: width - 420, // start from right edge
      y: 0,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, "./js-files/proload.js"),
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    // 4️⃣ Load interface file
    neuraliswindow.loadFile("neuralis.html");
    forceAlwaysOnTop(neuraliswindow);
    // 5️⃣ When loaded, send message if provided
    neuraliswindow.webContents.once('did-finish-load', () => {
      if (msg) neuraliswindow.webContents.send('display-message', msg);
      // smooth fade-in (optional)
      fadeInWindow(neuraliswindow);
    });

    // 6️⃣ Handle unexpected closure
    neuraliswindow.on("closed", () => {
      neuraliswindow = null;
    });

    // Optional: Safety net if the page crashes
    neuraliswindow.webContents.on('crashed', () => {
      console.error("⚠️ Neuralis window crashed — restarting...");
      neuraliswindow = null;
      setTimeout(() => openNEURALIS(msg, false), 500);
    });

  } catch (err) {
    console.error("Error in openNEURALIS:", err);
  }
}
// getPythonScript is defined once below (res/python with root fallback).
function getPythonScript(scriptName) {
  // Scripts live in res/python (packaged via extraResources); some dev
  // scripts live in the project root (e.g. bridge_runner.py).
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, "res", "python")
    : path.join(process.cwd(), "res", "python");
  const scriptPath = path.join(basePath, scriptName);
  if (app.isPackaged || fs.existsSync(scriptPath)) return scriptPath;
  const rootFallback = path.join(process.cwd(), scriptName);
  if (fs.existsSync(rootFallback)) return rootFallback;
  console.warn(`[PYTHON PATH] ⚠️ Script not found: ${scriptName}`);
  return scriptPath;
}
ipcMain.handle('browser-command', async (event, command) => {
  return new Promise((resolve, reject) => {
    const scriptPath = getPythonScript('bridge_runner.py');
    const py = spawn('Python', [scriptPath, command]);
    let jsonLine = '';

    py.stdout.on('data', data => {
      const lines = data.toString().split('\n');

      for (const line of lines) {
        const clean = line.trim();

        // Print all logs to console for debugging
        if (clean && !clean.startsWith('{')) {
          console.log('[PYTHON LOG]', clean);
        }

        // Capture only the JSON result
        if (clean.startsWith('{') && clean.endsWith('}')) {
          jsonLine = clean;
        }
      }
    });

    py.stderr.on('data', err => console.error('[PYTHON ERROR]', err.toString()));

    // py.on('close', () => {
    //   try {
    //     if (jsonLine) {
    //       const parsed = JSON.parse(jsonLine);
    //       if (parsed.error) reject(parsed.error);
    //       else resolve(parsed);
    //     } else {
    //       resolve('⚠️ No valid JSON output from Python.');
    //     }
    //   } catch (err) {
    //     reject('❌ Failed to parse automation output: ' + err.message);
    //   }
    // });
  });
});



// ✨ Optional helper for smooth appearance
function fadeInWindow(win, duration = 200) {
  let opacity = 0.0;
  win.setOpacity(opacity);
  win.show();
  const interval = setInterval(() => {
    opacity += 0.05;
    if (opacity >= 1) {
      opacity = 1;
      clearInterval(interval);
    }
    win.setOpacity(opacity);
  }, duration / 20);
}

// Existing function that shows your message overlay window
// function showMessageWindow(msg) {
//   // your existing logic that triggers message-box display
//   const win = new BrowserWindow({ /* ... */ });
//   win.loadFile('message.html');
//   win.webContents.once('did-finish-load', () => {
//     win.webContents.send('display-message', msg);
//   });
// }
function closeAllWindowsExcept(except = null) {
  if (inputWindow && inputWindow !== except && !inputWindow.isDestroyed()) {
    inputWindow.close();
  }
  if (messageWindow && messageWindow !== except && !messageWindow.isDestroyed()) {
    messageWindow.close();
  }
  if (menuWindow && menuWindow !== except && !menuWindow.isDestroyed()) {
    menuWindow.close();
  }
}
function closePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close();
    popupWindow = null;
  }
}
ipcMain.handle('ask-ollama', async (event, prompt) => {
  const win = BrowserWindow.getFocusedWindow();

  // Show loading message in renderer
  if (win) win.webContents.send('display-message', '🧠 Thinking...', { voiceLang: 'en-IN' });

  try {
    const output = await aiConfig.chat({
      messages: [{ role: "user", content: String(prompt ?? "") }],
      stream: false,
    });

    if (win) win.webContents.send('display-message', output, { voiceLang: 'en-IN' });

  } catch (err) {
    console.error(err);
    if (win) win.webContents.send('display-message', `⚠️ AI error: ${err.message}`, { voiceLang: 'en-IN' });
  }
});
robot.setKeyboardDelay(50);

function typeSafe(text) {
  text = String(text || "");
  for (const char of text) {
    if (char === '@') robot.keyTap('2', 'shift'); // shift+2
    else if (char === '.') robot.keyTap('period');
    else if (char === ' ') robot.keyTap('space');
    else if (/^[a-z0-9]$/i.test(char)) {
      const lower = char.toLowerCase();
      const isUpper = char !== lower;
      if (isUpper) robot.keyTap(lower, 'shift');
      else robot.keyTap(lower);
    } else {
      console.warn(`Skipping unsupported character: "${char}"`);
    }
  }
}


// =====================================================
// PATH RESOLVER — see unified getPythonScript above
// =====================================================

// =====================================================
// PYTHON EXEC HELPERS
// =====================================================
async function getCoords(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = getPythonScript(scriptName);
    execFile("python", [scriptPath], (err, stdout) => {
      if (err) return reject(err);
      const [x, y] = stdout.trim().split(",").map(Number);
      resolve({ x, y });
    });
  });
}

async function getCaretCoords() {
  return new Promise((resolve, reject) => {
    const scriptPath = getPythonScript("get_caret_coords.py");
    execFile("python", [scriptPath], (err, stdout) => {
      if (err) return reject(err);
      const [x, y] = stdout.trim().split(",").map(Number);
      resolve({ x, y });
    });
  });
}

// =====================================================
// MAIN NEURALIS AI HANDLER
// =====================================================
ipcMain.handle("Neuralis-ai", async (event, userInput, emailDetails) => {
  try {
    // 1️⃣ Ask the configured model for the app name
    const prompt = `
    You are AIRIS, a precise assistant for opening applications on Windows.
    The user provides a command like "open Chrome" or "launch VS Code".
    
    INSTRUCTIONS:
    - Respond with ONLY the exact official app name as it appears in the system (e.g.,"opera", "Google Chrome", "Visual Studio Code", "Spotify").
    - DO NOT include numbers, bullet points, extra words, explanations, or punctuation.
    - Return one app only.
    - If unsure, respond with UNKNOWN_APP.

    User command: "${userInput}"
    `.trim();

    const aiResponse = (await aiConfig.generateText(prompt, { maxTokens: 24 }))?.trim() || "UNKNOWN_APP";
    if (!aiResponse || aiResponse === "UNKNOWN_APP") {
      return { type: "error", output: "Could not determine the app to launch." };
    }

    exec(`start "" "${aiResponse}"`);
    console.log(`🚀 Launched: ${aiResponse}`);
    await new Promise((r) => setTimeout(r, 2000)); // Wait for app to open

    // 2️⃣ If email-related
    if (
      userInput.toLowerCase().includes("gmail") ||
      userInput.toLowerCase().includes("email") ||
      userInput.toLowerCase().includes("mail")
    ) {
      robot.keyTap("t", "control");
      await new Promise((r) => setTimeout(r, 2000));
      robot.typeString("gmail.com");
      robot.keyTap("enter");
      await new Promise((r) => setTimeout(r, 5000));

      // 🧭 Get Compose Button
      const composeCoords = await getCoords("get_compose_coords.py");
      robot.moveMouse(composeCoords.x, composeCoords.y);
      robot.mouseClick();
      await new Promise((r) => setTimeout(r, 500));

      // 3️⃣ Extract recipient email
      const emailPrompt = `
      Extract only the recipient's email address from this text:
      "${userInput}"
      Respond with the email only — no extra text.
      `.trim();

      const recipientEmail = (await aiConfig.generateText(emailPrompt, { maxTokens: 40 }))?.trim() || "UNKNOWN_EMAIL";
      if (recipientEmail !== "UNKNOWN_EMAIL") {
        clipboard.writeText(recipientEmail);
        robot.keyTap('v', 'control');
        robot.keyTap("enter");
        await new Promise((r) => setTimeout(r, 300));
      }

      // 4️⃣ Generate subject
      const subjectPrompt = `
You are AIRIS, a precise AI assistant for email automation.
Generate a concise subject line for the email.
Input: "${userInput}"
`.trim();

      const emailSubject = (await aiConfig.generateText(subjectPrompt, { maxTokens: 40 }))?.trim() || "UNKNOWN_SUBJECT";

      let subjectCoords;
      if (emailSubject !== "UNKNOWN_SUBJECT") {
        subjectCoords = await getCoords("get_subject_coords.py");
        robot.moveMouse(subjectCoords.x, subjectCoords.y);
        robot.mouseClick(); // focus subject field
        clipboard.writeText(emailSubject);
        robot.keyTap('v', 'control');
        await new Promise(r => setTimeout(r, 200));

        // ✅ Move slightly below to switch to body field
        robot.moveMouseSmooth(subjectCoords.x, subjectCoords.y + 60); // ~60px below subject box
        robot.mouseClick(); // focus body area
        await new Promise(r => setTimeout(r, 200));
      }

      // 5️⃣ Generate body
      const bodyPrompt = `
You are AIRIS, a precise AI assistant for email automation.
From this user input, write the email body clearly and professionally.
Input: "${userInput}"
`.trim();

      const emailBody = (await aiConfig.generateText(bodyPrompt, { maxTokens: 500 }))?.trim() || "UNKNOWN_BODY";
      if (emailBody !== "UNKNOWN_BODY") {
        clipboard.writeText(emailBody);
        robot.keyTap("v", "control");
        await new Promise(r => setTimeout(r, 300));
      }

      // 6️⃣ Send email
      const sendCoords = await getCoords("get_send_coords.py");
      robot.moveMouse(sendCoords.x, sendCoords.y);
      robot.mouseClick();
    }

    return { type: "app", output: `AIRIS launched: ${aiResponse}` };
  } catch (err) {
    console.error("AIRIS AI error:", err);
    return { type: "error", output: `AIRIS encountered an error: ${err.message}` };
  }
});
let finalOutput = '';
let pendingResolve = null;

ipcMain.handle('toggle-speech', async (event, action) => {
  if (action === 'start') {
    if (pyProcess) throw new Error('Already recording');

    finalOutput = '';
    pyProcess = spawn('python', ['speech.py'], { encoding: 'utf8' });

    // 🔥 Stream incoming lines
    pyProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();

      if (msg === 'STARTED') {
        event.sender.send('speech-status', '🎙️ Speak now...');
      } 
      else if (msg === 'STOPPED') {
        event.sender.send('speech-status', '🧠 Processing speech...');
      } 
      else if (msg) {
        finalOutput += msg + ' ';
        event.sender.send('speech-status', '🗣️ ' + msg);
      }
    });

    pyProcess.stderr.on('data', err => console.error('Python error:', err.toString()));

    pyProcess.on('close', () => {
      event.sender.send('speech-status', '✅ Transcribed: ' + finalOutput.trim());
      if (pendingResolve) {
        pendingResolve(finalOutput.trim());
        pendingResolve = null;
      }
      pyProcess = null;
    });

    return 'Listening started...';
  }

  if (action === 'stop') {
    if (!pyProcess) return 'Not recording';
    fs.writeFileSync('stop.txt', '1');
    return new Promise(resolve => {
      pendingResolve = resolve; // wait for on('close')
    });
  }
});

// 🧠 1️⃣ Intent classifier
ipcMain.handle('llava-evaluate', async (event, text) => {
  try {
    const prompt = `
You are AIRIS, an intent classifier.
Analyze the user's input and output ONLY a valid JSON object describing intent.
Possible intents: ["send_email", "open_app", "general_chat", "file_action", "unknown"].
Do not include any explanation or text besides JSON.

Examples:
User: "Send an email to Raj about the project update"
Output: {"intent":"send_email"}

User: "Open Chrome"
Output: {"intent":"open_app"}

User: "Explain quantum computing"
Output: {"intent":"general_chat"}

Now classify:
User: "${text}"
`.trim();

    const rawResponse = ((await aiConfig.generateText(prompt, { maxTokens: 60, temperature: 0.1 })) || '{"intent":"unknown"}').trim();

    // sanitize
    const safe = rawResponse.startsWith("{") ? rawResponse : '{"intent":"unknown"}';
    return safe;

  } catch (err) {
    console.error("AIRIS intent classification error:", err.message);
    return '{"intent":"unknown"}';
  }
});


// 💬 2️⃣ General chat responder
ipcMain.handle('llava-chat', async (event, text) => {
  try {
    const responseText = await aiConfig.chat({
      messages: [{ role: "user", content: String(text ?? "") }],
      stream: false,
    });
    return responseText;

  } catch (err) {
    console.error("AIRIS chat error:", err.message);
    return `AI chat error: ${err.message}`;
  }
});
// MAIN PROCESS (in Electron)
ipcMain.on("settings-updated", (event, newSettings) => {
  const payload = newSettings && typeof newSettings === "object" ? newSettings : {};
  if (messageWindow && !messageWindow.isDestroyed()) {
    messageWindow.webContents.send("update-settings", payload);
  }
});

ipcMain.handle('analyze-screen', async () => {
  try {
    const userInput = await analyzeScreen();
    const finalPrompt = `${systemInstructions}\n\nUser: ${userInput}\nAssistant:`;
    const response = await askAI(finalPrompt);
    showMessageWindow(response);
    return response;
  } catch (err) {
    console.error("[❌ analyze-screen] Error:", err.message);
    showMessageWindow("⚠️ Couldn't analyze screen.");
    return "Error";
  }
});
// to take screenshot

ipcMain.on('insert-text', (_, t) => {
  clipboard.writeText(t);
  robot.keyTap('v', 'control');
}); // to use robot to press keys 

ipcMain.on('request-eye-position', (e) => {
  e.sender.send('position-under-eyes', mainWindow.getBounds());
}); // to get the correct position below the eyes for messages

ipcMain.on('allow-mouse-events', () => {
  mainWindow.setIgnoreMouseEvents(false); // temporarily allow all events
}); //to allow mouse to be used in overlay messages

ipcMain.on('ignore-mouse-events', () => {
  mainWindow.setIgnoreMouseEvents(true, { forward: true }); // back to transparent mode
}); // to ignor mouse outside any component

ipcMain.on('show-sentiment-message', (event, message) => {
  showMessageWindow(message); // This stays globally active, always listening
});
ipcMain.on('menuwin' , () => {
  // Legacy launcher menu is retired; AI Settings is the supported entry
  // point. Keep this channel safe no-op so old messages don't crash.
});
ipcMain.on('run-automation', async () => {
  console.log("🤖 Starting automation sequence...");
  const { spawn } = require("child_process");
  const robot = require("robotjs");

  const pylogo = spawn("python", ["logoch.py"]);

  pylogo.stdout.setEncoding("utf8");
  let buffer = "";

  pylogo.stdout.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // keep partial line

    for (const line of lines) {
      const output = line.trim();
      if (!output) continue;

      const [x, y] = output.split(" ").map(Number);
      if (isNaN(x) || isNaN(y)) {
        console.warn(`⚠️ Invalid coordinate output: ${output}`);
        continue;
      }

      console.log(`🎯 Moving mouse to: ${x}, ${y}`);
      robot.moveMouseSmooth(x, y);
      robot.mouseClick();

      try {
        const running = await isAppRunning("opera");
        if (running) {
          console.log("🧠 Opera is running...");
          await delay(4000);

          robot.keyTap("t", "control");
          await delay(600);

          robot.typeString("https://www.google.com");
          robot.keyTap("enter");
        } else {
          console.log("🚫 Opera is not running.");
        }
      } catch (err) {
        console.error("💥 Error checking Opera status:", err);
      }
    }
  });

  pylogo.stderr.on("data", (err) => console.error("🐍 Python error:", err.toString()));
  pylogo.on("close", (code) => console.log(`🧹 Python process exited with code ${code}`));
});

ipcMain.handle("ask-da", async (event, message) => {
  // Call your AI logic here
  message = "Hello from main process!";
  return "AI response to: " + message;
});

ipcMain.on('allow-mouse-events', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.setIgnoreMouseEvents(false);
});

ipcMain.on('ignore-mouse-events', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.setIgnoreMouseEvents(true, { forward: true });
});
ipcMain.handle("brain-command", async (event, userInput) => {
  const lower = userInput.toLowerCase();

  const browserKeywords = [
    "open", "search", "go to", "visit", "find", "watch",
    "youtube", "compare", "google", "show me", "look up"
  ];

  const isBrowserTask = browserKeywords.some(k => lower.includes(k));

  if (isBrowserTask) {
    // Route to browser automation
    console.log("🌐 Detected browser-related command:", userInput);
    return runPythonBridge("python","pyautomation.py", [userInput]);
  } else {
    // Route to AI reasoning
    console.log("🧠 Detected text-based AI query:", userInput);
    return runAskAI(userInput);
  }
});

function runPythonBridge(script, args) {
  return new Promise((resolve, reject) => {
    const python = spawn("python", [script, ...args]);
    let output = "";
    let errorOutput = "";

    python.stdout.on("data", data => (output += data.toString()));
    python.stderr.on("data", data => (errorOutput += data.toString()));

    python.on("close", code => {
      if (code === 0) {
        resolve({ type: "browser", output });
      } else {
        reject({ error: errorOutput || output, code });
      }
    });
  });
}

async function runAskAI(userInput) {
  const output = await askAI(userInput);
  return { type: "ai", output };
}
ipcMain.handle("ask-ai", async (_, userInput) => {
  try {
    // === Detect user name if mentioned ===
    let userName = "sharvesh";
    const namePatterns = [
      /my name is (\w+(?: \w+)?)/i,
      /i'm (\w+(?: \w+)?)/i,
      /call me (\w+(?: \w+)?)/i
    ];
    for (const pattern of namePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        userName = match[1];
        break;
      }
    }

    // === Fetch recent memory from Supabase ===
    let previousMemory = null;
    let fetchError = null;
    if (supabase) {
      const res = await supabase
        .from("memories")
        .select("input_text, response_text")
        .order("id", { ascending: false })
        .limit(5);
      previousMemory = res.data;
      fetchError = res.error;
    }

    if (fetchError) console.error("❌ Supabase fetch error:", fetchError);

    let memoryContext = previousMemory?.length
      ? previousMemory.map(m => `User: ${m.input_text}\nAI: ${m.response_text || "(no response saved)"}`).join("\n---\n")
      : "No prior memory found. You’re starting fresh.";

    // === System + Context ===
    const systemPrompt = `
You are AIRIS — a sharp, context-aware AI assistant using LLaVA.
Use the memory context to maintain continuity but never repeat answers.
Focus on clarity, brevity, and technical precision.
Do not recall information outside this memory context.
`.trim();

    const finalPrompt = `
Memory Context:
${memoryContext}

${systemPrompt}

User: ${userInput}
Assistant:
`.trim();

    // === Send to LLaVA ===
    const response = await askAI(finalPrompt);
    console.log("💬 LLaVA Response:", response);

    // === Store interaction ===
    if (supabase) {
      const { error: insertError } = await supabase.from("memories").insert({
        user_id: userName,
        input_text: userInput,
        response_text: response
      });

      if (insertError) console.error("❌ Supabase insert error:", insertError);
      else console.log("☁️ Memory updated in Supabase");
    }

    // === Optional sentiment analysis ===
    const sentimentData = await analyzeSentiment(userInput);
    console.log("🧩 Sentiment:", sentimentData);

    // === Code block detection ===
    const codeMatch = response.match(/```(.*?)\n([\s\S]*?)```/);
    const codeLang = codeMatch?.[1]?.trim() || null;
    const codeContent = codeMatch?.[2]?.trim() || "";

    // === Contextual intent detection (no keywords) ===
    const lowered = userInput.toLowerCase();
    const intent = (() => {
      // Detect "create file" intent
      if (
        /\b(make|create|generate|produce|save)\b.+\b(file|code|script|program)\b/i.test(userInput)
      ) return "create_file";

      // Detect "paste code" intent
      if (
        /\b(paste|insert|apply|write)\b.+\b(code|snippet|program)\b/i.test(userInput)
      ) return "paste_code";

      return null;
    })();

    // === Handle intents ===
    if (intent === "create_file" && codeContent) {
      const language = codeLang || "txt";
      const filePath = saveCodeToDesktop(codeContent, language, `Generated ${language} Code`);
      shell.openPath(filePath);
      showMessageWindow(`📄 ${language.toUpperCase()} code saved as ${path.basename(filePath)}.`);
    }

    else if (intent === "paste_code") {
  if (!lastCursorPos) {
    showMessageWindow("⚠️ Cursor position not stored! Press Ctrl+Shift+C before using paste.");
    return response;
  }

  // Step 1: Generate code based on user request
  const userRequest = userInput?.trim();
  if (!userRequest) {
    showMessageWindow("⚠️ No request provided for code generation!");
    return response;
  }

  showMessageWindow("⚙️ Generating code snippet...");

  try {
    // You can plug your AI model or custom logic here
    const generatedCode = await generateCodeFromRequest(userRequest);

    // Step 2: Focus the window and move cursor
    robot.moveMouse(lastCursorPos.x, lastCursorPos.y);
    robot.mouseClick();

    // Step 3: Paste the generated code
    clipboard.writeText(generatedCode);
    await new Promise(res => setTimeout(res, 100)); // Give clipboard a moment
    robot.keyTap("v", "control");

    showMessageWindow("✅ Code inserted successfully!");
  } catch (err) {
    showMessageWindow("❌ Error generating or pasting code: " + err.message);
  }

  return response;
}


    else if (!intent && codeContent) {
      // Just show code if context isn't file-related
      showMessageWindow("📦 Code detected — but no 'create' or 'paste' intent found. Displaying only.");
    }

    return response;

  } catch (err) {
    console.error("[❌ askAI failed]:", err.message);
    showMessageWindow("🧨 AI exploded. Check your memory or Supabase config.");
    return "AI error.";
  }
});


 ipcMain.handle('what-app-to-open', async (event, userInput) => {

  const prompt = `What app does the user want to open based on this input: "${userInput}"? Respond with just the app name.`;
  const response = await askAI(prompt);
  return response;
});


ipcMain.handle('show-memory', async () => {
  const memory = await recall();
  return memory;
});

// Handle user choice from popup
// Handle popup selections
ipcMain.on('popup-choice', async (event, choice, userInput) => {
  if (!storedText) return;

  let finalText;
  if (choice === 'ask-ai') finalText = storedText;
  else if (choice === 'ai-search') finalText = `${storedText}\n\nQuestion: ${userInput}`;
  else return;

  const resp = await askAI(finalText);
  showMessageWindow(resp);
  closePopup();
});
ipcMain.on('memory-log', async (event, userInput) => {
  if (!supabase) return;
  const Sentiment = require('sentiment');
  const sentiment = new Sentiment();

  const sentimentResult = sentiment.analyze(userInput);
  const mood = sentimentResult.score > 0 ? 'positive' :
               sentimentResult.score < 0 ? 'negative' : 'neutral';
  
  await supabase.from('memory_logs').insert({
    user_input: userInput,
    sentiment: mood,
    timestamp: new Date().toISOString(),
  });
});

async function liveTypeCode(code) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < code.length) {
        const char = code[i];
        if (char === '\n') robot.keyTap('enter');
        else if (char === '\t') robot.keyTap('tab');
        else robot.typeString(char);
        i++;
      } else {
        clearInterval(interval);
        resolve();
      }
    }, 8);
  });
}



ipcMain.on('yt-summary-choice', (event, choice) => {
  if (choice === 'full') {
    showMessageWindow("📝 Full summary selected!");
    // Do something with the full summary
  } else if (choice === 'short') {
    showMessageWindow("📌 Short summary selected!");
    // Do something with the short summary
  }
});


// Receive settings from renderer
ipcMain.on('save-settings', (event, settings) => {
  console.log("🛠️ Settings received in main:", settings);
  // You can store or send to another window from here
});



ipcMain.on("close-menu-window", () => {
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.close(); // This triggers the `.on("closed")` cleanup
  }
});

ipcMain.on("sendSettings", (event, settings) => {
  if (messageWindow && !messageWindow.isDestroyed()) {
    messageWindow.webContents.send("update-settings", settings);
  }
});

// IPC handlers
ipcMain.handle('get-menu-options', () => menuOptions);

ipcMain.on('set-menu-option', (event, key, value) => {
  menuOptions[key] = value;
});

function checkDependencies() {
  exec('where code', (err) => {
    if (err) {
      // Missing VS Build Tools
      dialog.showErrorBox(
        "Missing Dependency",
        "Visual Studio Build Tools not found. Please install:\nhttps://visualstudio.microsoft.com/visual-cpp-build-tools/"
      );
    }
  });

  exec('ollama list', (err) => {
    if (err) {
      // Missing VS Build Tools
      dialog.showErrorBox(
        "Missing Dependency",
        "Please install Ollama from:\nhttps://ollama.com/download"
      );
    }
  });
}

ipcMain.handle("ask-ai2", async (event, userInput) => {
  const highlightedText = clipboard.readText();
  const finalPrompt = `
User Input: ${userInput}
Highlighted Text: ${highlightedText}
`;

  console.log("[📋 Clipboard Text]:", highlightedText.slice(0, 60));

  let aiResponse = "";

  const fullResponse = await askAI(finalPrompt, (chunk) => {
    aiResponse += chunk;
    // Optional live update
    // showMessageWindow(aiResponse);
  });

  console.log("[🤖 Full Response]:", fullResponse.slice(0, 100));
  showMessageWindow(fullResponse);
});
// 🔹 Extract video ID from any valid YouTube link
function extractVideoId(url) {
  try {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Example usage (uncomment for testing)
/*
(async () => {
  const summary = await summarizeYouTubeVideo("https://www.youtube.com/watch?v=KC4lhHd5DFs");
  console.log("\n📝 Summary:\n", summary);

  console.log("\n🔁 Cached summary check:");
  console.log(getLastVideoSummary());
})();
*/
function scanFolderForApps(folder) {
  let apps = [];
  if (!fs.existsSync(folder)) return apps;

  const files = fs.readdirSync(folder);
  for (const file of files) {
    const fullPath = path.join(folder, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      apps = apps.concat(scanFolderForApps(fullPath));
    } else if (file.toLowerCase().endsWith(".lnk") || file.toLowerCase().endsWith(".exe")) {
      apps.push(fullPath);
    }
  }
  return apps;
}

function isAppRunning(appName) {
  return new Promise((resolve, reject) => {
    if (!appName) return reject("No app name provided");

    exec("tasklist", (err, stdout, stderr) => {
      if (err) return reject(err);
      const processList = stdout.toLowerCase();
      resolve(processList.includes(appName.toLowerCase()));
    });
  });
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function handleYouTubeSummary() {
  try {
    const url = clipboard.readText().trim();
    if (!url || !url.includes("youtu")) {
      console.log("⚠️ Clipboard does not contain a valid YouTube URL.");
      return;
    }
    console.log("🎬 Summarizing from URL:", url);
    const summary = await summarizeYouTubeVideo(url);
    console.log("\n--- SUMMARY OUTPUT ---\n");
    console.log(summary);
    console.log("\n----------------------\n");
  } catch (err) {
    console.error("❌ Error during YouTube summary:", err.message);
  }
}

// ─── Initialization ───────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createSplash();

  ensureTray();
  // Only auto-pull a model for the default local Ollama setup: with any
  // other provider/host, pulling from the `ollama` CLI would be wrong/noisy.
  try {
    const cfg = aiConfig.getActiveConfig();
    const isLocalOllama = /\/\/(localhost|127\.0\.0\.1):11434/i.test(cfg.baseURL || "");
    if (isLocalOllama && cfg.model) {
      console.log(`✅ ollama pull ${cfg.model}`);
      exec(`ollama pull ${cfg.model}`);
    }
  } catch (err) {
    console.warn("Skipping ollama pull:", err.message);
  }
  checkDependencies();
  // ipcMain.on("move-mouse", (event, coords) => {
  //   const { x, y } = coords;
  //   robot.moveMouseSmooth(x, y, 3); // 1 = speed (0 fastest, 1 slowest)
  //   console.log(`Mouse smoothly moving to (${x}, ${y})`);
  // });
  
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const pos = robot.getMousePos();
      mainWindow.webContents.send('global-mouse', pos);
      mainWindow.webContents.send('cursor-position', screen.getCursorScreenPoint());
    }
  }, 60);
  // Roast loop every 2 minutes with 20% chance
    setInterval(async () => {
      if (Math.random() < 0.2) {
        console.log("[🧠] Attempting roast screen analysis...");
  
        try {
          const screenSummary = await analyzeScreen();
          const roast = await analyzeSentiment(screenSummary);

          if (roast?.trim()) {
            mainWindow.webContents.send("show-message", roast.trim());
            showMessageWindow(roast.trim());
          }
        } catch (err) {
          console.error("[💥 Roast failed]:", err.message);
        }
      }
    }, 2 * 60 * 1000);

    
    let autoCloseTimer = null;

    globalShortcut.register('Ctrl+Shift+Z', () => {
      if (menuuiwindow && !menuuiwindow.isDestroyed()) {
        // If it's already open, close immediately
        menuuiwindow.close();
        menuuiwindow = null;
        clearTimeout(autoCloseTimer);
      } else {
        // Create and show the window
        menuuiwindow = createMenuUI();

        // Automatically close after 10 seconds
        clearTimeout(autoCloseTimer);
        autoCloseTimer = setTimeout(() => {
          if (menuuiwindow && !menuuiwindow.isDestroyed()) {
            menuuiwindow.close();
            menuuiwindow = null;
          }
        }, 4000); // 10 seconds = 10000 ms
      }
    });
    const keywordMap = {
      opera: "Opera",
      chrome: "chrome",
      edge: "msedge",
      notepad: "notepad",
      vscode: "Code" // Visual Studio Code
  };
    console.log('Shortcut registered: Ctrl+Shift+Z to toggle menu');
    // Launch app by fuzzy matching user input
    ipcMain.on("launch-app", (event, appName) => {
      if (!appName) return console.error("No app name provided");
  
      // Map some common apps to their commands (Windows example)
      const apps = {
          operagx: "start opera",
          chrome: "start chrome",
          notepad: "start notepad",
          code: "start code"
      };
  
      const cmd = apps[appName.toLowerCase()];
      if (!cmd) return console.error(`App not mapped: ${appName}`);
  
      exec(cmd, (err) => {
          if (err) console.error("Error launching app:", err);
          else console.log(`${appName} launched successfully`);
      });
  });
    
  
    ipcMain.on('menu-action', async (event, action) => {
      console.log(`🧭 Menu action received: ${action}`);
    
      switch (action) {
        case 'highlightExplain':
          robot.keyTap('c', 'control');
          setTimeout(() => {
            try {
              // Capture clipboard or highlighted text
              storedText = clipboard.readText().trim();
              if (!storedText) return;
        
              const { x, y } = screen.getCursorScreenPoint();
              showPopup(x, y);
        
            } catch (err) {
              console.error("Error capturing clipboard or creating popup:", err);
            }
          }, 2000);
          break;
    
          case 'contentPatch':
            try {
              // 1️⃣ Cut the highlighted code (Ctrl+X)
              robot.keyTap("x", "control");
          
              // 2️⃣ Wait a moment for clipboard to update
              await new Promise(res => setTimeout(res, 200));
          
              const highlightedCode = clipboard.readText().trim();
              if (!highlightedCode) {
                showMessageWindow("⚠️ No code detected! Highlight some code first.");
                return;
              }
          
              showMessageWindow("🔍 Analyzing code for possible errors...");
          
              // 3️⃣ Ask the configured AI for a short diagnostic
              const diagnosticPrompt = `
              You are AIRIS — an expert code reviewer.
              In under 5 concise lines, describe the main issue(s) in this code snippet.
              Keep it brief and technical, no explanations or solutions.
              Code:
              ${highlightedCode}
              `.trim();
          
              const shortDiagnosis = ((await aiConfig.generateText(diagnosticPrompt, { maxTokens: 160 })) || "").trim() || "No obvious issues found.";
          
              showMessageWindow("⚠️ Code Issue Summary:\n" + shortDiagnosis);
          
              // 4️⃣ Generate fixed version
              const patchPrompt = `
              You are AIRIS — a senior developer AI.
              Fix and clean the following code:
              - Correct all syntax and logic errors
              - Keep it readable and efficient
              - Return only the corrected code, no explanation
              Code:
              ${highlightedCode}
              `.trim();
          
              const patchedCode = ((await aiConfig.generateText(patchPrompt, { maxTokens: 900 })) || "").trim();
              if (!patchedCode) {
                showMessageWindow("⚠️ Could not generate a valid patch. The snippet may be incomplete.");
                return;
              }
          
              // 5️⃣ Paste patched code
              clipboard.writeText(patchedCode);
              robot.keyTap("v", "control");
          
              showMessageWindow("✅ Code patched successfully.\n\n🧩 Summary:\n" + shortDiagnosis);
          
            } catch (err) {
              console.error("Error patching code:", err);
              showMessageWindow(`❌ Patch failed: ${err.message}`);
            }
            break;
          

          

          case "Automate": {
            const { spawn } = require("child_process");
            const robot = require("robotjs");
            
          
            // Spawn both Python scripts
            const pylogo = spawn("py", ["logoch.py"]); // or "python3"
            const ytlogo = spawn("py", ["ytcheck.py"]); // optional
          
            pylogo.stdout.setEncoding("utf8");
            let buffer = "";
          
            pylogo.stdout.on("data", async (chunk) => {
              buffer += chunk;
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop(); // keep partial line
          
              for (const line of lines) {
                const output = line.trim();
                if (!output) continue;
          
                const [x, y] = output.split(" ").map(Number);
                if (isNaN(x) || isNaN(y)) {
                  console.warn(`⚠️ Invalid coordinate output: ${output}`);
                  continue;
                }
          
                console.log(`🎯 Moving mouse to: ${x}, ${y}`);
                robot.moveMouseSmooth(x, y,0);
                robot.mouseClick();
          
                try {
                  const running = await isAppRunning("opera");
                  if (running) {
                    console.log("🧠 Opera is running...");
                    await delay(2000); // wait before opening new tab
                    console.log("✅ Waited 4 seconds");
          
                    robot.keyTap("t", "control"); // open new tab
                    await delay(600); // wait for tab to open
                    const text = "https://www.google.com";
                    for (const ch of text) robot.keyTap(ch);
                    // robot.typeStringDelayed("https://www.google.com" , 0);
                    // keyboard.config.autoDelayMs = 0;
                    // await keyboard.type("Type this insanely fast!");
                    robot.keyTap("enter");
                  } else {
                    console.log("🚫 Opera is not running.");
                  }
                } catch (err) {
                  console.error("💥 Error checking Opera status:", err);
                }
              }
            });
          
            pylogo.stderr.on("data", (err) => {
              console.error("🐍 Python error:", err.toString());
            });
          
            pylogo.on("close", (code) => {
              console.log(`🧹 Python process exited with code ${code}`);
            });
          
            // ytlogo (commented out for now)
            // ytlogo.stdout.on("data", (data) => {
            //   const output = data.toString().trim();
            //   const [x, y] = output.split(" ").map(Number);
            //   console.log(`YT Logo position: ${x}, ${y}`);
            // });
            // ytlogo.stderr.on("data", (err) => console.error("YT Python error:", err.toString()));
            // ytlogo.on("close", (code) => console.log(`YT Python exited with ${code}`));
          
            break;
          }
          

          

        case 'neuralis':
          openNEURALIS();
        break;
    
        case 'chatbot':
          if (!global.chatbotActive) {
            openAIInputWindow();
            global.chatbotActive = true;
            showMessageWindow('💬 Chatbot enabled');
          } else {
            inputWindow?.close();
            global.chatbotActive = false;
            showMessageWindow('🔕 Chatbot closed');
          }
          break;
    
        case 'terminal':
          if (!global.terminalActive) {
            createTerminalWindow();
            global.terminalActive = true;
            showMessageWindow('🖥️ Terminal opened');
          } else {
            terminalWin?.close();
            global.terminalActive = false;
            showMessageWindow('🛑 Terminal closed');
          }
          break;
    
        case 'screenCapture':
          try {
            const screenDescription = await analyzeScreen(); // now from screenObserver.js
        
            if (screenDescription?.trim()) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("show-message", screenDescription.trim());
              }
              showMessageWindow(screenDescription.trim());
            }
          } catch (err) {
            console.error("[Manual Roast Failed]:", err.message);
            showMessageWindow("❌ Screen roast failed. Check logs.");
          }
          break;
    
          case "ytSummary":
            (async () => {
              console.log("🧩 Menu action received: ytSummary");
              const videoUrl = "https://youtu.be/vV41TkYvQoE?si=N2l99pfYTEaNcUKH"; // or pass dynamically
              await summarizeYouTubeVideo(videoUrl);
            })();
            break;


        default:
          console.warn('⚠️ Unknown menu action:', action);
      }
    });



  try {
    // Performance tweaks
    app.commandLine.appendSwitch('enable-transparent-visuals');
    app.commandLine.appendSwitch('disable-gpu-compositing');

    // Background features. The main (eyes) window is created when the
    // splash finishes — see createSplash()/ensureMainWindow().
    startAppWatcher();
  } catch (err) {
    console.error("❌ app.whenReady() failed:", err.message);
  }
  
});




// // Mac-only reactivation
// app.on("activate", () => {
//   if (BrowserWindow.getAllWindows().length === 0) {
//     createMenuWindow();
//   }
// });

// Shutdown on close (except macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle start-ai trigger to open mainWindow and sync user settings
ipcMain.on("start-ai", (event, settings) => {
  createMainWindow(); 
  userSettings = { ...userSettings, ...settings };
  console.log("✅ User Settings Applied:", userSettings);
 
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update-settings", userSettings);
  } 
});
   
ipcMain.handle('run-command', async (event, cmd) => {
  return new Promise((resolve, reject) => {
    // Use 'cmd.exe /c' to run the command
    const child = spawn('cmd.exe', ['/c', cmd], {
      windowsHide: true,
      shell: false
    });
 
    let output = '';
    let errorOutput = '';
  
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
 
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        resolve(`${output.trim()}\n${errorOutput.trim()}`);
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
});