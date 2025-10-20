// index.js — main Electron process
// At the top of main.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
let menuuiwindow = null; // track window instance
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);


const { app, ipcMain, globalShortcut, clipboard, screen, shell, BrowserWindow, Tray, Menu, dialog} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const util = require("util");
const robot = require("robotjs");
const activeWindow = require("active-win");
let storedText = '';
let popupWindow;

const userName = "sharvesh";

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
let latestCopiedText = '';
// ─── Globals ───────────────────────────────────────────────────
let mainWindow, menuWindow, inputWindow, messageWindow, glowWindow, terminalWin, tray, inputfield;
let lastCursorPos = null;
let isOllamaProcessing = false;
const execPromise = util.promisify(exec);

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
  

  // ❌ Remove auto-close timer — just close on user selection
  popupWindow.on('closed', () => { popupWindow = null; });
}

// ─── Utility ───────────────────────────────────────────────────
function closeAllWindowsExcept(except = null) {
  [inputWindow, messageWindow, menuWindow].forEach(win => {
    if (win && win !== except && !win.isDestroyed()) win.close();
  });
}

// ─── Window Creators ───────────────────────────────────────────
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
      contextIsolation: false,
    },
  });

  menuWindow.loadFile("menu.html");
  menuWindow.on("closed", () => (menuWindow = null));
}

function createMainWindow() {
  closeAllWindowsExcept(null);
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: Math.round((width - 400) / 2),
    y: 0,
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

  mainWindow.loadFile("index.html");
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setFullScreenable(false);

  globalShortcut.register("Control+Shift+N", () => {
    mainWindow.webContents.send("shortcut-wink");
  });

  setMainWindow(mainWindow);

  mainWindow.on("closed", () => (mainWindow = null));

  tray = new Tray(path.join(__dirname, "icon.ico"));
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show App", click: () => mainWindow.show() },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setToolTip("My Electron App");
  tray.setContextMenu(contextMenu);
}

function createTerminalWindow() {
  terminalWin = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    backgroundColor: "#000",
    webPreferences: {
      preload: path.join(__dirname, "./js-files/proload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  terminalWin.loadFile("termi.html");
  terminalWin.on("closed", () => (terminalWin = null));
  terminalWin.once("ready-to-show", () => {
    terminalWin.show();
    terminalWin.focus();
  });
}

function openAIInputWindow() {
  if (inputWindow) return inputWindow.focus();
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  inputWindow = new BrowserWindow({
    width: 600,
    height: 400,
    x: (width - 600) / 2,
    y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  inputWindow.loadFile("ai_input.html");
  inputWindow.on("closed", () => (inputWindow = null));
}


function createMenuUI() {
  const { BrowserWindow, screen } = require('electron');
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 400;
  const winHeight = 600;

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: 650,
    y: 0,
    frame: false,            // removes default window frame
    transparent: true,       // makes background transparent
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // make window click-through except for pointer-enabled elements
  win.setIgnoreMouseEvents(false, { forward: true });

  // remove default menu (no File/Edit/View etc.)
  win.removeMenu();

  // DO NOT open dev tools
  // win.webContents.openDevTools(); // make sure this line is not there

  win.loadFile('menuui.html');

  win.on('closed', () => (menuuiwindow = null));

  return win;
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

  messageWindow.setIgnoreMouseEvents(true); // click-through
  messageWindow.setAlwaysOnTop(true, 'screen-saver');
  messageWindow.loadFile("messagewin.html");

  messageWindow.once('ready-to-show', () => {
    messageWindow.showInactive();
    messageWindow.webContents.send('display-message', msg);

    if (autoClose) {
      setTimeout(() => messageWindow.close(), 5000);
    }
  });

  messageWindow.on("closed", () => messageWindow = null);
}


// ─── functions ───────────────────────────────────────────────────────





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
  win.webContents.send('display-message', '🧠 Thinking...', { voiceLang: 'en-IN' });

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llava',
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

    // === Fetch last few memories from Supabase ===
    const { data: previousMemory, error: fetchError } = await supabase
      .from("memories")
      .select("input_text, response_text")
      .order("id", { ascending: false })
      .limit(5);

    if (fetchError) console.error("❌ Supabase fetch error:", fetchError);

    // === Build memory context string ===
    let memoryContext = "";
    if (previousMemory && previousMemory.length > 0) {
      memoryContext = previousMemory
        .map(m => `User: ${m.input_text}\nAI: ${m.response_text || "(no response saved)"}`)
        .join("\n---\n");
    } else {
      memoryContext = "No prior memory found. You’re starting fresh.";
    }

    // === System + Memory Context ===
    const systemPrompt = `
You are AIRIS — a sharp, context-aware AI assistant using LLaVA.
You have access to your past 5 memories.
Use memory context to maintain continuity.
Never repeat the same answers.
Be concise and technically correct.
`.trim();

    const finalPrompt = `
Memory Context:
${memoryContext}

User: ${userInput}
Assistant:
`.trim();

    // === Send to LLaVA ===
    const response = await askAI(finalPrompt);
    console.log("💬 LLaVA Response:", response);

    // === Store new interaction in Supabase ===
    const { error: insertError } = await supabase.from("memories").insert({
      user_id: userName,
      input_text: userInput,
      response_text: response
    });

    if (insertError) console.error("❌ Supabase insert error:", insertError);
    else console.log("☁️ Memory updated in Supabase");

    // === Sentiment Analysis (optional) ===
    const sentimentData = await analyzeSentiment(userInput);
    console.log("🧩 Sentiment:", sentimentData);

    // === Handle code-related triggers ===
    const codeMatch = response.match(/```(.*?)\n([\s\S]*?)```/);
    const loweredInput = userInput.toLowerCase().trim();
    const fileTriggers = ["create a file", "create file", "new file", "make file", "cf"];

    if (fileTriggers.some(t => loweredInput.includes(t)) && codeMatch) {
      const language = codeMatch[1]?.trim() || "txt";
      const code = codeMatch[2]?.trim() || "";
      if (!code) {
        showMessageWindow("⚠️ AI didn’t provide valid code to save.");
        return response;
      }
      const filePath = saveCodeToDesktop(code, language, `Generated ${language} Code`);
      shell.openPath(filePath);
      showMessageWindow(`📄 ${language.toUpperCase()} code saved as ${path.basename(filePath)}.`);
    } else if ((loweredInput.includes("paste a code") || loweredInput.includes("paste code")) && codeMatch) {
      const code = codeMatch[2]?.trim() || "";
      if (!code) {
        showMessageWindow("⚠️ AI didn’t provide valid code to paste.");
        return response;
      }
      if (!lastCursorPos) {
        showMessageWindow("⚠️ Cursor position not stored! Press Ctrl+Shift+C before using paste.");
        return response;
      }
      robot.moveMouse(lastCursorPos.x, lastCursorPos.y);
      robot.mouseClick();
      showMessageWindow(`💬 Pasting code where your cursor was — starting in 2s...`);
      setTimeout(() => {
        clipboard.writeText(code);
        robot.keyTap("v", "control");
      }, 2000);
    }

    return response;

  } catch (err) {
    console.error("[❌ askAI failed]:", err.message);
    console.error("⚠️ Failed to update memory or Supabase:", err);
    showMessageWindow("🧨 AI exploded. Check your memory or Supabase config.");
    return "AI error.";
  }
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

  const resp = await analyzeSentiment(finalText);
  showMessageWindow(resp);
  closePopup();
});
ipcMain.on('memory-log', async (event, userInput) => {
  const Sentiment = require('sentiment');
  const { supabase } = require('./supabaseClient');
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
// ─── Initialization ─────────────────s──────────────────────────────────────

app.whenReady().then(async () => {
  console.log("✅ ollama pull llava");
  exec('ollama pull llava');
  checkDependencies() 
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

    globalShortcut.register('Ctrl+Shift+Z', () => {
      if (menuuiwindow && !menuuiwindow.isDestroyed()) {
        menuuiwindow.close();
        menuuiwindow = null;
      } else {
        menuuiwindow = createMenuUI();
      }
    });
  
    console.log('Shortcut registered: Ctrl+Shift+Space to toggle menu');
  
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
          
            showMessageWindow("💬 Sending code to AI to generate patch...");
          
            // 3️⃣ Send code to AI for patching
            const patchedCode = await generateCodePatch(highlightedCode);
          
            if (!patchedCode) {
              showMessageWindow("⚠️ AI did not return valid code.");
              return;
            }
          
            // 4️⃣ Paste the patched code at the same selection (no mouse click!)
            clipboard.writeText(patchedCode);
            robot.keyTap("v", "control");
          
            showMessageWindow("✅ Code patched successfully!");
          
          } catch (err) {
            console.error("Error patching code:", err);
            showMessageWindow("❌ Something went wrong while patching code.");
          }
          
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
              mainWindow.webContents.send("show-message", screenDescription.trim());
              showMessageWindow(screenDescription.trim());
            }
          } catch (err) {
            console.error("[Manual Roast Failed]:", err.message);
            showMessageWindow("❌ Screen roast failed. Check logs.");
          }
          break;
    
        case 'ytSummary':
          let url = clipboard.readText().trim();
  
      if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
        showMessageWindow("❌ Clipboard does not contain a valid YouTube URL.");
        return;
      }
  
      showMessageWindow("⏳ Starting YouTube summary…");
  
      try {
        const { full, short } = await runYouTubeSummaryWithProgress(url, (progressMsg) => {
          // Update sliding message for each chunk
          showMessageWindow(progressMsg, { updateExisting: true });
        });
  
        // Send summaries to renderer
        mainWindow.webContents.send("yt-summary-options", { full, short });
        showMessageWindow("✅ Summary ready! Press 'F' for full, 'S' for short.", { autoClose: true });
  
      } catch (err) {
        console.error("❌ Summary failed:", err);
        showMessageWindow("❌ Failed to get summary. Try again.", { autoClose: true });
      }
          break;
    
        default:
          console.warn('⚠️ Unknown menu action:', action);
      }
    });



  try {
    // Performance tweaks
    app.commandLine.appendSwitch('enable-transparent-visuals');
    app.commandLine.appendSwitch('disable-gpu-compositing');

    // Initial UI + app features
    await createMenuWindow();
    startAppWatcher();
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
