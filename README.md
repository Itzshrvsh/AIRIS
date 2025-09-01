Collecting workspace informationHere is a complete README for your AIRIS project, including all available features and descriptions based on your workspace:

```markdown
# 🧠 AIRIS

AIRIS (**AI-Responsive Intelligent Shell**) is a next-gen AI-powered desktop assistant and terminal shell.  
It converts **natural language instructions** into **Windows CMD/PowerShell commands**, answers questions, summarizes YouTube videos, and provides real-time screen analysis and roasting.

---

## ✨ Features

- **Natural Language to CMD/PowerShell**  
  Instantly convert plain English instructions into ready-to-run Windows terminal commands.  
  No explanations, just the command you need.

- **AI-Powered Q&A**  
  Ask technical or general questions and get concise, context-aware answers powered by Llama3.

- **Screen Analysis & Roasting**  
  AIRIS can analyze your screen, read visible text, and roast you if you're wasting time or provide insights if you're studying.

- **YouTube Video Summarizer**  
  Paste a YouTube link and AIRIS will download subtitles, extract key points, and summarize the video in full or in one punchy line.

- **Clipboard Sentiment Analysis**  
  Select text anywhere, hit a hotkey, and AIRIS will analyze and summarize or answer questions about it.

- **Overlay & Eye Tracking**  
  Futuristic floating UI with animated eyes, idle detection, and mouse tracking.

- **Personalization & Memory**  
  Remembers your chat history, system instructions, and settings for a tailored experience.

- **Roast Mode**  
  Enable/disable sarcastic roasting for fun productivity nudges.

- **Hand Gesture Detection**  
  (Planned) Detects hand gestures for quick actions.

- **Global Hotkeys**  
  - `Ctrl+Space`: Open AI input window  
  - `Ctrl+Shift+Y`: Summarize YouTube video from clipboard  
  - `Ctrl+Alt+C`: Analyze selected clipboard text  
  - `Ctrl+Shift+R`: Roast your current screen  
  - `Ctrl+Alt+R`: Sarcastic roast based on screen text  
  - `Ctrl+Shift+Z`: Quick success message  
  - `Ctrl+Shift+I`: Open DevTools for message window

---

## 🖥️ UI Components

- **Menu Launcher** ([menu.html](menu.html))  
  Start/stop AIRIS, toggle features, change reply/voice language, and adjust settings.

- **Main Overlay** ([index.html](index.html))  
  Animated eyes, idle blinking, mouse tracking, and shortcut handling.

- **Terminal Window** ([termi.html](termi.html))  
  Converts instructions to Windows commands, with strict safety and formatting rules.

- **Message Popup** ([bin/messagewin.html](bin/messagewin.html))  
  Shows AI responses, summaries, and supports speech synthesis.

- **Glow Window** ([glow.html](glow.html))  
  Visual border glow effect for notifications.

---

## ⚙️ Installation

1. **Clone the repository**
   ```sh
   git clone https://github.com/itzshrvsh/AIRIS.git
   cd AIRIS
   ```

2. **Install dependencies**
   ```sh
   npm install
   ```

3. **Run the app**
   ```sh
   npm start
   ```

   > Requires Node.js, Electron, and Ollama (for Llama3 model).

---

## 🛠️ Tech Stack

- **Electron** — Desktop UI and system integration
- **Node.js** — Backend logic and hotkey handling
- **Llama3 (Ollama)** — Local AI model for Q&A and sentiment
- **Tesseract.js** — OCR for screen analysis
- **yt-dlp** — Subtitle extraction for YouTube summarization
- **Sharp** — Image processing for OCR

---

## 📚 Usage

- **Ask AIRIS**: Use the input window or hotkeys to ask questions, get commands, or summaries.
- **Summarize YouTube**: Copy a YouTube link, press `Ctrl+Shift+Y`, and choose full or short summary.
- **Roast/Analyze Screen**: Press `Ctrl+Shift+R` or `Ctrl+Alt+R` for instant feedback.
- **Terminal Commands**: Use the terminal window for natural language to Windows command conversion.

---

## 📝 Customization

- Edit system_prompt.txt and personalization.json for custom instructions and memory.
- Toggle features in the menu launcher.

---

## 📄 License

MIT License  
Copyright (c) 2025 Itzshrvsh

---

## 📧 Contact

Email: itzshrvsh212@gmail.com

---

## 🚀 Contributing

Pull requests and suggestions are welcome!

---

## 💡 Future Plans

- Linux/macOS support
- Plugin system for custom AI integrations
- Hand gesture detection
- More advanced screen analysis

---

## 🔗 Key Files

- index.js — Main Electron process and hotkey logic
- aiRequest.js — AI request handler
- screenObserver.js — Screen OCR and analysis
- youtubeSummarizer.js — YouTube subtitle summarizer
- sentimentAnalyzer.js — Sentiment and Q&A logic
- fileGenerator.js — Save generated code to desktop

---

AIRIS — Your AI-powered productivity shell for Windows.
```