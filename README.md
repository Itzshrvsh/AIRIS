<<<<<<< HEAD
Collecting workspace informationHere is a complete README for your AIRIS project, including all available features and descriptions based on your workspace:

```markdown
# 🧠 AIRIS

AIRIS (**AI-Responsive Intelligent Shell**) is a next-gen AI-powered desktop assistant and terminal shell.  
It converts **natural language instructions** into **Windows CMD/PowerShell commands**, answers questions, summarizes YouTube videos, and provides real-time screen analysis and roasting.
=======


# AIRIS - A Context-Aware Non-Verbal AI Assistant for Solo Developers


**AIRIS** is a lightweight, context-aware AI assistant designed to integrate seamlessly into a developer’s workflow. It acts as a non-verbal sidekick, offering code patching, text explanation, YouTube summarization, file generation, and more — all accessible via shortcut keys without interrupting your work.
>>>>>>> 6d7fe39533b7572aca18de81b0d25093fca919dc

---

## ✨ Features

<<<<<<< HEAD
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
=======
AIRIS is designed to empower developers with efficiency and intelligence at their fingertips:

* **Highlight & Explain** – Highlight text to get context-aware explanations.
* **Content Patching** – Quickly fix or improve code with AI-powered suggestions.
* **Chatbot Interface** – Non-verbal AI assistant that reacts based on workflow context.
* **File Generation** – Automatically generate documents or code files.
* **YouTube Summarization** – Convert long videos into concise, digestible summaries.
* **Natural Language Terminal** – Run commands and get outputs using plain language.
* **Voice Commands** – (Coming Soon) Control AIRIS with your voice.

---

## 🎯 Goals

* Provide **fast and seamless assistance** for solo developers.
* Keep users **in workflow** using shortcut-based access.
* Operate **offline wherever possible**, respecting user privacy.
* Integrate AI **directly with your desktop**, not just as a web app or chatbot.

---

## 🛠️ Technology Stack

AIRIS leverages a combination of familiar technologies:

* **Frontend:** HTML, CSS, JavaScript (Electron)
* **Backend:** Node.js + Python
* **AI Model:** [Ollama LLaVA](https://ollama.com) (7B parameters, optimized for local usage)
* **Utilities:** RobotJS for input automation, clipboard management, and OS interactions

---

## 💡 How It Works

1. **Shortcut-Based Access** – Trigger any AIRIS feature without leaving your current task.
2. **Context-Aware Analysis** – Highlight text, take screenshots, or select code for AI evaluation.
3. **Inline AI Assistance** – AI processes input and outputs results directly where needed.
4. **Seamless Workflow Integration** – Visual feedback from AIRIS is minimal but informative, with “eyes” reflecting activity states.

---

## 🎛️ Desktop Operations

* Runs in the background as a lightweight Electron app.
* Activatable via global shortcuts.
* Features modular access with minimal disruption to workflow.
* Generated files and session data are stored locally for privacy.

---

## ⚡ Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/AIRIS.git
cd AIRIS
```

2. Install dependencies:

```bash
npm install
```

3. Start AIRIS:

```bash
npm start
```

4. (Optional) Customize shortcut keys in `settings.json` to fit your workflow.

---

## 🖥️ Usage

* **Highlight & Explain:** Select text → press assigned shortcut → get explanation.
* **Content Patching:** Highlight code → shortcut → AI suggests fix → auto-paste.
* **YouTube Summary:** Copy video URL → shortcut → get summary.
* **Chatbot / Terminal Toggle:** Open/close via shortcuts.

> Shortcut keys are fully customizable to avoid conflicts with OS or other software.

---

## 📚 References

1. Chavan, S., Giri, S., Gornar, S., et al., *EduMate: AI-Based Student Support Platform with OCR and Voice Assistance*, IEEE ESCI, 2025
2. Design, Validation, and Risk Assessment Team, *Design, Validation, and Risk Assessment of LLM-Based Systems*, IEEE ISSE, 2024
3. Ge, Y., Ren, Y., et al., *LLM as OS, Agents as Apps: Envisioning AIOS*, arXiv, 2023
4. Yin, W., Xu, M., et al., *LLM as a System Service on Mobile Devices*, 2024
5. Lim, M., Ku, J., et al., *Real-Time Avatar-Based Speech-to-Speech Conversational AI Tutor*, IEEE ISCAIE, 2025

*(Full references available in the paper.)*

---

## ✨ Notes

* AIRIS is designed to **respect user privacy**: most data processing occurs locally.
* Features like YouTube summarization require internet access.
* The project is **open for contribution** — fork it, experiment, and improve.

---

## 📝 License

[MIT License](LICENSE)
>>>>>>> 6d7fe39533b7572aca18de81b0d25093fca919dc


<<<<<<< HEAD
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
=======
>>>>>>> 6d7fe39533b7572aca18de81b0d25093fca919dc
