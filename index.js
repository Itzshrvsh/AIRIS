const { app, ipcMain, globalShortcut, clipboard, screen, shell , BrowserWindow , dialog } = require('electron');
const { BrowserWindow: AcrylicBrowserWindow } = require('electron');
const path = require('path');
const robot = require('robotjs');
const os = require('os');
const fs = require('fs');
const { spawn, exec } = require('child_process');
let mainWindow = null , menuWindow = null , inputWindow = null , messageWindow = null;
const { askAI } = require('./js-files/aiRequest');
const { analyzeScreen: observeScreen, setMainWindow } = require('./js-files/screenObserver');
const { analyzeScreen: roastScreen } = require('./js-files/mainRoaster');
const { analyzeSentiment } = require('./js-files/sentimentAnalyzer');
const { startAppWatcher } = require('./js-files/appWatcher');
const { runYouTubeSummary } = require('./js-files/youtubeSummarizer');
const { saveCodeToDesktop } = require('./js-files/fileGenerator');
const { remember, recall, logChat } = require('./memoryManager');
const systemInstructions = require('./js-files/systemInstructions');
let glowWindow = null;
let lastCursorPos = null;
let systemPrompt = '';

(async () => {
  try {
    systemPrompt = await fs.promises.readFile(path.join(__dirname, './system_prompt.txt'), 'utf8');
  } catch (err) {
    console.error("❌ Failed to load system prompt:", err.message);
  }
})();
const util = require('util');
const execPromise = util.promisify(exec);
const memoryPath = path.join(__dirname, 'memory.json');
const activeWindow = require('active-win');
const { config } = require('process');

let isOllamaProcessing = false;

let userSettings = {
  aiMode: "manual",
  enableRoasting: true,
  enableYouTubeSummary: true,
  enableEyeTracking: true,
  enableHandGestures: true,
  replyLang: "en-IN",     // NOTE: use language codes for consistency
  voiceLang: "en-IN",
  voiceSpeed: 1.0
};


let globalSettings = {
  replyLang: 'en',
  voiceLang: 'en-IN',
  voiceSpeed: 1.0
};

let terminalWin;

// ─── terminal window ─────────────────────────────────────────────────────────
function createTerminalWindow() {
  terminalWin = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    title: "AI Terminal",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      contextIsolation: true,
      nodeIntegration: false

    },
  });

  terminalWin.loadFile("termi.html");

  terminalWin.on("closed", () => {
    terminalWin = null;
  });

  terminalWin.on("ready-to-show", () => {
    terminalWin.show();
    terminalWin.focus();
  });
}
// ─── Main Eyes ─────────────────────────────────────────────────────────

function createMenuWindow() {
  menuWindow = new BrowserWindow({
    width: 390,
    height: 300,
    resizable: false,
    fullscreenable: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  menuWindow.loadFile("menu.html");

  menuWindow.on("closed", () => {
    menuWindow = null; // <== Clean up
  });
}

// ─── Main Overlay ─────────────────────────────────────────────────────────
function createMainWindow() {
  closeAllWindowsExcept(null);
  const { width } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new BrowserWindow({
    width: 1500,
    height: 1300,
    x: (width - 1500) / 2,
    y: -158,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, './js-files/proload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile('index.html');

  globalShortcut.register('Control+Shift+N', () => {
    mainWindow.webContents.send('shortcut-wink');
  });
  setMainWindow(mainWindow);


    mainWindow.on('closed', () => {
      mainWindow = null;
    });
}

// ─── Input Popup ─────────────────────────────────────────────────────────

function openAIInputWindow() {
  closeAllWindowsExcept(null);
  if (inputWindow) return inputWindow.focus();

  const { width } = screen.getPrimaryDisplay().workAreaSize;

  inputWindow = new AcrylicBrowserWindow({
    width: 600,
    height: 400,
    x: (width - 600) / 2,
    y: 100,
    frame: false,
    transparent: true, // Needed for CSS blur to work
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
    inputWindow.loadFile('ai_input.html');

    inputWindow.on('closed', () => {
      inputWindow = null;
    });
  }


// ─── Message Popup ────────────────────────────────────────────────────────
function showMessageWindow(msg) {
  closeAllWindowsExcept(null);
  if (messageWindow) messageWindow.close();
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  messageWindow = new AcrylicBrowserWindow({
    height: 1000,
    width: 600,
    x:1500,
    y: -200,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, './js-files/proload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  messageWindow.setIgnoreMouseEvents(true, { forward: true });
  messageWindow.loadFile(path.join(__dirname, 'messagewin.html'));
  messageWindow.once('ready-to-show', () => {
    if (!messageWindow.isDestroyed()) {
      messageWindow.showInactive();
      messageWindow.webContents.send('display-message', msg);
    }
  });

  messageWindow.on('closed', () => {
    messageWindow = null;
  });

}
// ─── glow window ───────────────────────────────────────────────────────

ipcMain.on('show-glow-window', () => {
  if (glowWindow) {
    glowWindow.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().bounds;

  glowWindow = new BrowserWindow({
    width,
    height: 1000,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false, // So it doesn’t steal input
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  glowWindow.setIgnoreMouseEvents(true); // Makes it click-through
  glowWindow.loadFile('glow.html');

  glowWindow.on('closed', () => {
    glowWindow = null;
  });

  setTimeout(() => {
    if (glowWindow && !glowWindow.isDestroyed()) {
      glowWindow.close();
    }
  }, 9000);
});
// ─── functions ───────────────────────────────────────────────────────
function startErrorWatcher() {
  const py = spawn('python', ['path/to/error_watcher.py']);

  py.stdout.on('data', (data) => {
    const json = JSON.parse(data.toString());
    console.log("Error Detected:", json);

    // Trigger assistant or overlay to help
    mainWindow.webContents.send('error-detected', json);
  });

  py.stderr.on('data', (data) => {
    console.error("Error watcher failed:", data.toString());
  });
}
async function downloadSubs(url) {
  const cmd = `yt-dlp --write-auto-sub --sub-lang en --skip-download -o "ytvideo.%(ext)s" ${url}`;
  try {
    const { stdout } = await execPromise(cmd);
    console.log("✅ Subtitles downloaded");
    return 'ytvideo.en.vtt';
  } catch (error) {
    console.error(`❌ Subtitle extraction failed: ${error.stderr || error}`);
    throw error;
  }
}

function normalizeYouTubeURL(input) {
  // Handle youtu.be short links
  if (input.includes("youtu.be/")) {
    const id = input.split("youtu.be/")[1].split("?")[0];
    return `https://www.youtube.com/watch?v=${id}`;
  }
  return input;
}

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

ipcMain.handle('ask-ollama', async (event, prompt) => {
  const win = BrowserWindow.getFocusedWindow();

  // Show loading message in renderer
  win.webContents.send('display-message', '🧠 Thinking...', { voiceLang: 'en-IN' });

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        prompt: prompt,
        stream: false
      })
    });

    const json = await res.json();
    const output = json.response || 'No response.';

    // Show actual response now
    win.webContents.send('display-message', output, { voiceLang: 'en-IN' });

  } catch (err) {
    console.error(err);
    win.webContents.send('display-message', '⚠️ Error from Ollama.', { voiceLang: 'en-IN' });
  }
});
// MAIN PROCESS (in Electron)
ipcMain.on("settings-updated", (event, newSettings) => {
  messageWindow.webContents.send("update-settings", newSettings);
});

ipcMain.handle('analyze-screen', async () => {
  try {
    const userInput = await analyzeScreen(mainWindow);
    const finalPrompt = `${systemInstructions}\n\nUser: ${userInput}\nAssistant:`;
    const response = await askAI(finalPrompt);
    showMessageWindow(response);
    return roastText;
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
  createMenuWindow();
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

ipcMain.handle('ask-ai', async (_, userInput) => {
  try {
    const finalPrompt = `${systemPrompt}\n\nUser: ${userInput}\nAssistant:`;
    const response = await askAI(finalPrompt);
    console.log("[📢 askAI response]:", response);

    const codeMatch = response.match(/```(.*?)\n([\s\S]*?)```/);
    const loweredInput = userInput.toLowerCase();

    // === Create a File Only ===
    if (loweredInput.includes("create a file") && codeMatch) {
      const language = codeMatch[1].trim();
      const code = codeMatch[2].trim();
      const filePath = saveCodeToDesktop(code, language, `Generated ${language} Code`);
      shell.openPath(filePath);
      showMessageWindow(`📄 ${language} code saved as ${path.basename(filePath)}.`);
    }

    // === Paste a Code (Live Typing to Cursor) ===
    else if (loweredInput.includes("paste a code") && codeMatch) {
      const code = codeMatch[2].trim();
    
      if (!lastCursorPos) {
        showMessageWindow("⚠️ Cursor position not stored! Press Ctrl+Shift+C before using paste.");
        return response;
      }
    
      // Move mouse to the last stored position and click to focus
      robot.moveMouse(lastCursorPos.x, lastCursorPos.y);
      robot.mouseClick();
      showMessageWindow(`💬 Pasting code where your cursor was — starting in 2s...`);
    
      setTimeout(() => {
        // Copy the code to clipboard
        clipboard.writeText(code);
    
        // Paste it instantly
        robot.keyTap("v", "control");
      }, 2000);
    }

    // === If no valid code ===
    else if (!codeMatch && (loweredInput.includes("create a file") || loweredInput.includes("paste a code"))) {
      showMessageWindow(response);
    }

    return response;

  } catch (err) {
    console.error("[❌ askAI failed]:", err.message);
    showMessageWindow("🧨 AI exploded. Check your server.");
    return "AI error.";
  }
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
}

// ─── Initialization ─────────────────s──────────────────────────────────────

app.whenReady().then(async () => {
  console.log("✅ ollama pull llama3");
  exec('ollama pull llama3');
  checkDependencies()



  try {
    // Performance tweaks
    app.commandLine.appendSwitch('enable-transparent-visuals');
    app.commandLine.appendSwitch('disable-gpu-compositing');

    // Initial UI + app features
    await createMenuWindow();
    startAppWatcher();


    // Global mouse tracking for overlay
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
          const screenSummary = await observeScreen();
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

    // Hotkey registration helper
    const reg = (key, fn) => {
      if (!globalShortcut.register(key, fn)) {
        console.error(`❌ Failed to register: ${key}`);
      }
    };

    // === Hotkeys ===
    reg('Control+Space', () => {
      lastCursorPos = screen.getCursorScreenPoint();
      console.log("🖱️ Cursor position saved (via Ctrl+Space):", lastCursorPos);
      openAIInputWindow();
    });
    
    reg('Control+/', () => {
      if (!terminalWin) createTerminalWindow();
      else terminalWin.focus();
    });
    reg('Control+Shift+/', () => terminalWin?.close() );
    reg('Control+Shift+Space', () => inputWindow?.close());

    reg('Control+Shift+R', async () => {
      try {
        const screenSummary = await observeScreen();
        const roast = await analyzeSentiment(screenSummary);
        if (roast?.trim()) {
          mainWindow.webContents.send("show-message", roast.trim());
          showMessageWindow(roast.trim());
        }
      } catch (err) {
        console.error("[Manual Roast Failed]:", err.message);
      }
    });

    reg('Control+Alt+F', openAIInputWindow);

    reg('Control+Alt+C', async () => {
      try {
        const selectedText = clipboard.readText().trim();
        if (selectedText.length && mainWindow) {
          const result = await analyzeSentiment(selectedText);
          showMessageWindow(result);
          mainWindow.webContents.send("show-message", result);
        }
      } catch (err) {
        console.error("Clipboard analyze failed:", err.message);
      }
    });

    reg('Control+Shift+Y', async () => {
      try {
        let url = clipboard.readText().trim();
        url = normalizeYouTubeURL(url);
        const { full, short } = await runYouTubeSummary(url);
        mainWindow.webContents.send("yt-summary-options", { full, short });
        showMessageWindow("📺 Summary ready. Press 'F' for full or 'S' for short.");
      } catch (err) {
        console.error("❌ Summary failed:", err);
        showMessageWindow("❌ Failed to get summary. Try again.");
      }
    });

    reg('Control+Alt+R', async () => {
      const { detectedText } = await observeScreen(mainWindow);
      const roast = await askAI(`sarcastic roast: "${detectedText}"`);
      showMessageWindow(roast);
    });

    reg('Control+Shift+Z', () => {
      showMessageWindow("Seems the code works flawlessly");
    });

    reg('Control+Shift+I', () => {
      messageWindow?.webContents.openDevTools({ mode: 'detach' });
    });

    console.log("✅ App is fully ready");

  } catch (err) {
    console.error("❌ app.whenReady() failed:", err.message);
  }
  
});

// Mac-only reactivation
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMenuWindow();
  }
});

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
