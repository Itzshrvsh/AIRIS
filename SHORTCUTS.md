# AIRIS — Shortcuts & How It Works

> Softcopy of the in-app **Shortcuts & Help** sheet (`help.html`). Open it any time with
> **drawer → ⌨ Shortcuts & Help**, the tray menu, or `Ctrl+Shift+H`.
>
> Print / save as PDF from the in-app sheet (🖨 button). A ready-made PDF copy lives at
> [`AIRIS-Shortcuts.pdf`](AIRIS-Shortcuts.pdf).

---

## ⌨️ Global shortcuts

| Keys | What it does |
|---|---|
| `Ctrl` + `Shift` + `Z` | Open or close the AIRIS drawer (auto-closes after a few seconds) |
| `Ctrl` + `Shift` + `N` | Wink — the on-screen eyes blink once as a visual acknowledgment |
| `Ctrl` + `Shift` + `H` | Open the Shortcuts & Help sheet from anywhere |
| `Esc` | Close the focused AIRIS window (Settings, Help, Chatbot, Terminal, popup) |

The eyes at the top of the screen follow the mouse and blink on their own — that's the assistant idling.

---

## 🧠 Drawer actions

Hover the **🧠 Start** trigger in the bottom-left corner, or press `Ctrl+Shift+Z`.

| Action | What it does |
|---|---|
| **Highlight & Explain** | Select text in any app, then choose this — AIRIS copies the selection, opens a popup at your cursor and explains it. |
| **Patch Content** | Select code, then choose this — AIRIS cuts it, reviews the bug, generates a fix and pastes the corrected code back in place. |
| **Chatbot** | Toggles the floating chat window. `Enter` sends, `Shift+Enter` adds a new line. |
| **Terminal** | Toggles the AIRIS terminal. Type a natural-language instruction, press `Enter`, and the generated command runs. |
| **Screen Capture** | Captures the screen and shows the AI's analysis (same engine as the periodic screen roast). |
| **YouTube Summary** | Downloads audio for the configured video, transcribes it and shows a summary. |
| **NEURALIS** | Opens the email/assistant window. `Enter` sends, `Shift+Enter` adds a line, the mic button toggles speech. |
| **⌨ Shortcuts & Help** | Opens this sheet. |
| **⚙️ AI Settings** | Provider, endpoint URL, model and request options — one configuration shared by every feature. |

### Window-specific keys

| Window | Keys |
|---|---|
| Chatbot | `Enter` send · `Shift+Enter` newline |
| Terminal | `Enter` run · `Shift+Enter` newline |
| NEURALIS | `Enter` send · `Shift+Enter` newline · mic button for speech |
| Explain popup | `Enter` submit |
| AI Settings / Help / Chatbot / Terminal / popups | `Esc` close |

---

## 🖱️ Tray menu

Right-click the AIRIS icon in the system tray: **Show App**, **AI Settings**, **Shortcuts & Help**, **Quit**.

---

## 🔌 Connecting LM Studio (URL only)

1. In **LM Studio**, load a model, open the **Developer** tab and click **Start Server**
   (default `http://localhost:1234`).
2. In AIRIS, open **drawer → ⚙️ AI Settings**.
3. Set **Provider** to *LM Studio (local)* and keep the base URL `http://localhost:1234/v1`.
4. Leave the model on **✨ Auto** — AIRIS uses whichever model LM Studio has loaded.
5. Click **🔌 Test Connection**, then **💾 Save Settings**. Done.

Any OpenAI-compatible server works the same way: paste its base URL (usually ending in `/v1`) and
leave the model on Auto. AIRIS calls `GET {url}/models` to discover a model and
`POST {url}/chat/completions` for chat. An API key is optional for local servers.

> **Screen analysis needs vision:** load a multimodal model in LM Studio and set it under
> *AI Settings → Advanced → Vision model*. Text models can still do chat, patching and summaries.

---

## 🩺 Quick troubleshooting

| Symptom | Fix |
|---|---|
| Connection refused | The AI server is not running, or the port is wrong. Start the LM Studio server and check the URL. |
| HTTP 404 | The base URL is missing the version path — it should normally end in `/v1`. |
| First reply is slow | LM Studio loads the model on the first request. Subsequent messages are faster. |
| No model loaded | Load a model in LM Studio, or use AI Settings → Refresh Models and pick one explicitly. |
| Empty / cut-off response | Raise *Advanced → Max tokens per request*, especially for reasoning models. |
| Vision call fails | The selected model has no image support. Load a vision model and set it as the Vision model. |

---

*AIRIS — AI-Responsive Intelligent Shell*
