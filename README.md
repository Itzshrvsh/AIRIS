# AIRIS - A Context-Aware Non-Verbal AI Assistant for Solo Developers

**AIRIS** (AI-Responsive Intelligent Shell) is a lightweight, context-aware AI assistant that integrates into a developer's workflow. It acts as a non-verbal sidekick, offering code patching, text explanation, YouTube summarization, screen analysis, file generation, natural-language terminal commands and more — all accessible via shortcuts without interrupting your work.

> Runs with **any OpenAI-compatible provider** — a local server (Ollama `…/v1`, LM Studio `…/v1`, llama.cpp `…/v1`) or a hosted compatible endpoint. See **AI Settings** below.

---

## ✨ Features

* **Highlight & Explain** – Highlight text to get context-aware explanations.
* **Content Patching** – Quickly fix or improve code with AI-powered suggestions.
* **Chatbot Interface** – Non-verbal AI assistant that reacts based on workflow context.
* **NEURALIS Panel** – App launching with voice capture, plus guided email automation.
* **Natural Language Terminal** – Convert instructions into Windows commands and run them.
* **File Generation** – Automatically generate documents or code files.
* **YouTube Summarization** – Convert long videos into concise, digestible summaries.
* **Screen Analysis & Roasting** – AIRIS can read visible text and give feedback while you study or waste time.
* **Floating Overlay Eyes** – Futuristic always-on-top UI with idle blinking and mouse tracking.
* **Memory & Context** – Chat history and summaries are remembered locally (`data/memory.json`; Supabase memory when configured).

---

## 🎛️ AI Settings (central configuration)

All AI-powered features read **one** configuration (`data/ai-config.json`):
provider/preset, base URL, API key, model, plus optional per-feature overrides
(vision, summarizer, transcription, fast tasks) and request options.

Open it from:

* The **🧠 Start drawer → ⚙️ AI Settings**, or the **system-tray menu → AI Settings**.

Key abilities:

* **Test Connection** button — reports reachable / unreachable / auth / discovery problems with actionable messages.
* **Refresh Models** — pulls the model list from `{baseURL}/models`.
* **Manual model entry** — works even when a server has no discovery endpoint.
* Base URLs are normalized; duplicated `/v1` segments cannot create paths like `/v1/v1/chat/completions`.
* No API key is logged, echoed or embedded in errors.

Environment variables: `SUPABASE_URL` / `SUPABASE_KEY` in a local `.env` (never committed) power the optional cloud memory; `.env.example` documents the expected keys.

---

## 🧭 Global shortcut keys

* `Ctrl+Shift+Z` — toggle the Start drawer
* `Ctrl+Shift+N` — wink (eyes)

Other hotkeys from earlier versions are described in `menu.html` / `notes.txt`; the drawer and tray are the supported entry points.

---

## 🖥️ UI Components

* **Splash** (`splash.html`) — intro animation.
* **Eyes overlay** (`index.html`) — transparent always-on-top layer.
* **Start drawer** (`menuui.html`) — actions + AI Settings entry.
* **Chat input** (`ai_input.html`) — ask AIRIS.
* **AI Settings** (`settings.html`) — provider/model configuration.
* **Terminal** (`termi.html`) — natural-language to Windows command.
* **NEURALIS** (`neuralis.html`) — launcher/assistant side panel with speech input.
* **Message popup** (`popup.html`) — quick Ask AI / AI Search on highlighted text.
* **Message window** (`messagewin.html`) — response toast with copy-to-clipboard.

---

## ⚙️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/itzshrvsh/AIRIS.git
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
4. Open **drawer → ⚙️ AI Settings**, pick a preset (e.g. Ollama local), **Test Connection**, pick a model, **Save Settings**.

> A local AI server (e.g. [Ollama](https://ollama.com/download) with a multimodal model such as `llava`) must be reachable at the configured endpoint. For the default Ollama preset, AIRIS runs `ollama pull llava` on startup.

---

## 🛠️ Technology Stack

* **Electron** — desktop UI and system integration
* **Node.js** — backend logic, hotkeys, AI client (`js-files/aiConfig.js`)
* **Python** — browser automation and coordinate services (reads the same `data/ai-config.json`)
* **OpenAI-compatible REST** — chat completions + model discovery
* **Tesseract.js / whisper** — OCR/transcription utilities
* **Sharp / ffmpeg-static** — media processing
* **Supabase (optional)** — remote memory when `.env` is configured

---

## 📚 Usage

* **Highlight & Explain:** select text → drawer → *Highlight & Explain*.
* **Content Patching:** highlight code → drawer → *Patch Content*.
* **Chatbot:** drawer → *Chatbot* (or `Ctrl+Shift+I` from earlier builds).
* **Terminal:** drawer → *Terminal* → type an instruction; the generated command runs via the main process.
* **YouTube Summary:** drawer → *YouTube Summary*.
* **AI Settings:** drawer → *⚙️ AI Settings* — configure provider + model once for every feature.

---

## 🔗 Key Files

* `index.js` — main Electron process, windows, hotkeys, IPC
* `js-files/aiConfig.js` — central AI provider configuration + client
* `js-files/aiRequest.js` — one-shot prompt helper (uses the central config)
* `js-files/screenObserver.js` — screen capture + vision analysis
* `settings.html` — AI Settings UI
* `airis_config.py` — Python-side reader for the same configuration
* `test/aiConfig.test.js` — unit tests (`npm test`)

---

## 🚀 Contributing

Pull requests and suggestions are welcome!

## 💡 Future Plans

* Linux/macOS support
* Plugin system for custom AI integrations
* Hand gesture detection
* More advanced screen analysis

---

## 📝 License

[MIT License](LICENSE)
