

# AIRIS - A Context-Aware Non-Verbal AI Assistant for Solo Developers


**AIRIS** is a lightweight, context-aware AI assistant designed to integrate seamlessly into a developer’s workflow. It acts as a non-verbal sidekick, offering code patching, text explanation, YouTube summarization, file generation, and more — all accessible via shortcut keys without interrupting your work.

---

## 🚀 Features

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


