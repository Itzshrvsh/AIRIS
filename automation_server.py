import json
import time
import base64
import requests
import threading
from flask import Flask, request, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ==============================
# CONFIG
# ==============================
LLAVA_API = "http://localhost:11434/api/generate"
MODEL = "llava"

# ==============================
# SETUP BROWSER (only once)
# ==============================
chrome_options = Options()
chrome_options.add_argument("--start-maximized")
chrome_options.add_argument(r"user-data-dir=C:\Users\itzsh\AppData\Local\Google\Chrome\User Data\Default")
driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
driver.get("https://www.google.com")
print("✅ Browser launched and ready.")


# ==============================
# HELPERS
# ==============================
def take_screenshot_b64():
    png = driver.get_screenshot_as_png()
    return base64.b64encode(png).decode("utf-8")


def extract_json_block(text):
    start, end = text.find("{"), text.rfind("}") + 1
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end])
        except Exception:
            pass
    print("⚠️ Could not parse valid JSON:\n", text)
    return {"actions": []}


def ask_llava_for_actions(command, screenshot_b64):
    prompt = f"""
You are a web automation planner. Plan JSON steps to achieve the user's command.
Allowed action types: goto, click, type.
Strictly output valid JSON — no extra text.

User command: "{command}"
"""
    payload = {"model": MODEL, "prompt": prompt, "images": [screenshot_b64], "stream": False}
    try:
        res = requests.post(LLAVA_API, json=payload, timeout=90)
        res.raise_for_status()
        resp = res.json().get("response", "")
        print("\n🧠 LLaVA Output:\n", resp)
        return extract_json_block(resp).get("actions", [])
    except Exception as e:
        print(f"Error querying LLaVA: {e}")
        return []


def normalize_action(act):
    t = act.get("type", "").lower()
    if t in ["open_browser", "open_new_tab"]:
        act["type"] = "goto"
    if "url" in act:
        act["target"] = act.get("url")
    return act


def find_clickable_element(target):
    xpaths = [
        f"//*[contains(text(), '{target}')]",
        f"//*[@value='{target}']",
        f"//*[@aria-label='{target}']",
        f"//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '{target.lower()}')]",
        f"//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '{target.lower()}')]",
    ]
    for xp in xpaths:
        elems = driver.find_elements(By.XPATH, xp)
        if elems:
            return elems[0]
    return None


def find_input_field(target):
    xpaths = [
        f"//input[contains(@placeholder, '{target}')]",
        f"//input[contains(@aria-label, '{target}')]",
        "//textarea",
        "//input",
    ]
    for xp in xpaths:
        elems = driver.find_elements(By.XPATH, xp)
        if elems:
            return elems[0]
    return None


def smart_find_input():
    candidates = [
        "//input[@name='q']",
        "//textarea[@name='q']",
        "//input[@id='search']",
        "//input[@name='search_query']",
        "//input[contains(@placeholder, 'Search')]",
        "//input[contains(@aria-label, 'Search')]",
        "//textarea[contains(@placeholder, 'Search')]",
    ]
    for xp in candidates:
        elems = driver.find_elements(By.XPATH, xp)
        if elems:
            return elems[0]
    return None


def execute_actions(actions):
    for act in actions:
        act = normalize_action(act)
        a_type = act.get("type")
        target = act.get("target", "")
        text = act.get("text", "")
        print(f"🔹 Executing: {a_type} → {target}")

        try:
            if a_type == "goto":
                driver.get(target)
                WebDriverWait(driver, 10).until(
                    lambda d: d.execute_script("return document.readyState") == "complete"
                )
                print("✅ Page loaded successfully.")

            elif a_type == "type":
                field = find_input_field(target) or smart_find_input()
                if field:
                    driver.execute_script("arguments[0].scrollIntoView(true);", field)
                    WebDriverWait(driver, 5).until(EC.element_to_be_clickable(field))
                    field.clear()
                    field.send_keys(text)
                    field.send_keys(Keys.RETURN)
                    print(f"✅ Typed '{text}' and pressed Enter.")
                else:
                    print("⚠️ No input box found, even with fallback.")

            elif a_type == "click":
                elem = find_clickable_element(target)
                if elem:
                    driver.execute_script("arguments[0].scrollIntoView(true);", elem)
                    elem.click()
                    print(f"✅ Clicked on '{target}'.")
                else:
                    print(f"⚠️ Could not find clickable element '{target}'.")

            else:
                print(f"⚠️ Unknown action type: {a_type}")

        except Exception as e:
            print(f"❌ Failed on {act}: {e}")

        time.sleep(2)


# ==============================
# FLASK SERVER
# ==============================
app = Flask(__name__)

@app.route("/run", methods=["POST"])
def run_command():
    data = request.get_json(force=True)
    cmd = data.get("cmd", "")
    if not cmd:
        return jsonify({"error": "Missing 'cmd'"}), 400

    screenshot_b64 = take_screenshot_b64()
    actions = ask_llava_for_actions(cmd, screenshot_b64)

    if not actions:
        return jsonify({"status": "no_actions", "message": "No valid automation actions found."})

    # Run automation in background thread to avoid blocking the API
    threading.Thread(target=execute_actions, args=(actions,), daemon=True).start()

    return jsonify({"status": "running", "actions": actions})


@app.route("/status", methods=["GET"])
def status():
    return jsonify({"status": "ready", "message": "Automation server active."})


if __name__ == "__main__":
    app.run(port=5005)
