"""
python/input_worker.py — persistent desktop-input worker for AIRIS.

A drop-in backend for the app's keyboard/mouse control when the native
`robotjs` module cannot be used (it requires the ClangCL toolchain to build
on modern Electron). AIRIS's main process (js-files/input.js) keeps ONE
instance alive and speaks a simple JSON-lines protocol over stdin:

    → {"op": "keyTap", "key": "enter", "mods": ["control"], "id": 3}
    → {"op": "typeString", "text": "hello", "id": 4}
    → {"op": "moveMouse", "x": 100, "y": 200, "id": 5}
    ← {"ok": true, "id": 3}              (one line per request)

Every action sends exactly one reply line, so JS can track crashes. Depends
only on pyautogui (already used by the app's Python tooling).
"""

import json
import sys

import pyautogui

pyautogui.FAILSAFE = True  # slam mouse to a corner to abort runaway automation
pyautogui.PAUSE = 0.05     # default pacing, updated via setKeyboardDelay

# robotjs key names → pyautogui names (pyautogui is pygetwindow/pywin32 based)
KEY_ALIASES = {
    "control": "ctrl",
    "ctrl": "ctrl",
    "command": "winleft",
    "cmd": "winleft",
    "win": "winleft",
    "option": "alt",
    "escape": "esc",
    "return": "enter",
    "printscreen": "printscreen",
    "insert": "insert",
    "super": "winleft",
    "meta": "winleft",
}

def map_key(name: str) -> str:
    key = str(name).strip().lower()
    if not key:
        return "space"
    return KEY_ALIASES.get(key, key)


def op_keyTap(req):
    key = map_key(req.get("key", ""))
    mods = [map_key(m) for m in req.get("mods", []) if m]
    if mods:
        pyautogui.hotkey(*mods, key)
    else:
        pyautogui.press(key)


def op_keyDown(req):
    pyautogui.keyDown(map_key(req.get("key", "")))


def op_keyUp(req):
    pyautogui.keyUp(map_key(req.get("key", "")))


def op_typeString(req):
    text = req.get("text", "")
    pyautogui.write(str(text)[:20000], interval=float(req.get("interval", 0.015)))


def op_typeStringDelayed(req):
    text = req.get("text", "")
    pyautogui.write(str(text)[:20000], interval=float(req.get("delay", 120)) / 1000.0)


def op_moveMouse(req):
    pyautogui.moveTo(int(req.get("x", 0)), int(req.get("y", 0)), duration=0)


def op_moveMouseSmooth(req):
    # robotjs semantics: default speed ~4 (moderate); 0 ≈ as fast as possible.
    speed = req.get("speed")
    try:
        speed = float(speed) if speed is not None else 4.0
    except (TypeError, ValueError):
        speed = 4.0
    if speed <= 0:
        duration = 0.12
    else:
        duration = min(max(1.2 - 0.25 * speed, 0.15), 1.0)
    pyautogui.moveTo(int(req.get("x", 0)), int(req.get("y", 0)), duration=duration)


def op_mouseClick(req):
    button = ("right" if str(req.get("button", "left")).lower() == "right"
              else "middle" if str(req.get("button", "left")).lower() == "middle"
              else "left")
    double = bool(req.get("double", False))
    pyautogui.click(button=button, clicks=2 if double else 1,
                    interval=0.08 if double else 0)


def op_dragMouse(req):
    pyautogui.dragTo(int(req.get("x", 0)), int(req.get("y", 0)),
                     duration=float(req.get("duration", 0.25)), button="left")


def op_setKeyboardDelay(req):
    delay_ms = req.get("delay", 50)
    try:
        pyautogui.PAUSE = max(0.0, float(delay_ms)) / 1000.0
    except (TypeError, ValueError):
        pass


def op_getPosition(req):
    pos = pyautogui.position()
    return {"x": pos.x, "y": pos.y}


OPS = {
    "keyTap": op_keyTap,
    "keyDown": op_keyDown,
    "keyUp": op_keyUp,
    "typeString": op_typeString,
    "typeStringDelayed": op_typeStringDelayed,
    "moveMouse": op_moveMouse,
    "moveMouseSmooth": op_moveMouseSmooth,
    "mouseClick": op_mouseClick,
    "dragMouse": op_dragMouse,
    "setKeyboardDelay": op_setKeyboardDelay,
    "getPosition": op_getPosition,
}


def main():
    print(json.dumps({"op": "ready", "ok": True}), flush=True)  # handshake
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as err:
            print(json.dumps({"ok": False, "error": f"bad json: {err}"}), flush=True)
            continue

        op = req.get("op", "")
        req_id = req.get("id")
        handler = OPS.get(op)
        if not handler:
            print(json.dumps({"ok": False, "error": f"unknown op {op!r}", "id": req_id}), flush=True)
            continue

        try:
            extra = handler(req) or {}
            print(json.dumps({"ok": True, "id": req_id, **extra}), flush=True)
        except Exception as err:  # fail-safe trips etc.
            print(json.dumps({"ok": False, "error": f"{err.__class__.__name__}: {err}", "id": req_id}), flush=True)


if __name__ == "__main__":
    main()
