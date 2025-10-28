import os
import json
import time
import requests
import subprocess
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# =========================================
# CONFIG
# =========================================
OLLAMA_API = "http://localhost:11434/api/generate"
MODEL = "llama3"
WAIT_TIME = 10
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA_DIR = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")

# =========================================
# AUTO-DETECT PROFILE
# =========================================
def get_default_chrome_profile():
    """Find the default Chrome profile folder."""
    profiles = list(Path(USER_DATA_DIR).glob("Profile*"))
    default_profile = Path(USER_DATA_DIR) / "Default"
    if default_profile.exists():
        return "Default"
    elif profiles:
        # fallback to first found profile (e.g., Profile 1)
        return profiles[0].name
    else:
        return "Default"  # fallback default

# =========================================
# LAUNCH NORMAL CHROME WITH REAL PROFILE
# =========================================
def launch_normal_chrome():
    profile_dir = get_default_chrome_profile()
    chrome_options = Options()
    chrome_options.binary_location = CHROME_PATH
    chrome_options.add_argument(f"--user-data-dir={USER_DATA_DIR}")
    chrome_options.add_argument(f"--profile-directory={profile_dir}")
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument("--no-first-run")
    chrome_options.add_argument("--no-default-browser-check")

    print(f"🚀 Launching Chrome with profile: {profile_dir}")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    print("✅ Chrome launched using user's real profile.")
    return driver

# =========================================
# LLaMA PLAN GENERATION
# =========================================
def get_ai_plan(user_input):
    prompt = f"""
You are AIRIS, a silent browser automation planner.
The user describes what they want done in a browser.

Respond with **ONLY VALID JSON**, no commentary or extra text.

Each JSON object describes one browser action.

Example:
[
  {{"action": "goto", "url": "https://www.youtube.com"}},
  {{"action": "click", "by": "name", "value": "search_query"}},
  {{"action": "type", "by": "name", "value": "search_query", "text": "best games of 2021"}},
  {{"action": "key_down", "value": "enter"}}
]

User command: "{user_input}"
"""
    payload = {"model": MODEL, "prompt": prompt, "stream": False}
    res = requests.post(OLLAMA_API, json=payload)
    text = res.json().get("response", "").strip()

    start = text.find("[")
    end = text.rfind("]") + 1
    if start != -1 and end != -1:
        text = text[start:end]

    try:
        return json.loads(text)
    except Exception as e:
        print("JSON parsing failed:", e, "\nRaw text:\n", text)
        return []

# =========================================
# ACTION RUNNER
# =========================================
def run_actions(driver, plan):
    wait = WebDriverWait(driver, WAIT_TIME)
    for step in plan:
        action = step.get("action")

        try:
            if action == "goto":
                print(f"🌐 Navigating to {step['url']} ...")
                driver.get(step["url"])
                time.sleep(2)

            elif action == "click":
                print(f"🖱️ Clicking element: {step}")
                by = step.get("by", "xpath").upper()
                value = step.get("value")
                elem = wait.until(EC.presence_of_element_located((getattr(By, by), value)))
                elem.click()
                time.sleep(1)

            elif action == "type":
                print(f"⌨️ Typing '{step['text']}' into element: {step}")
                by = step.get("by", "name").upper()
                value = step.get("value")
                elem = wait.until(EC.presence_of_element_located((getattr(By, by), value)))
                elem.clear()
                elem.send_keys(step["text"])
                time.sleep(1)

            elif action == "key_down":
                print(f"🔑 Pressing key: {step['value']}")
                if step["value"].lower() == "enter":
                    webdriver.ActionChains(driver).send_keys(Keys.ENTER).perform()

            else:
                print("❓ Unknown action:", action)

        except Exception as e:
            print(f"⚠️ Step failed: {step}\nError: {e}")
            continue

# =========================================
# MAIN
# =========================================
def main():
    driver = launch_normal_chrome()

    while True:
        user_input = input("\nEnter browser command (or 'exit'): ").strip()
        if user_input.lower() == "exit":
            break

        plan = get_ai_plan(user_input)
        print("AI Plan:", json.dumps(plan, indent=2))
        if not plan:
            print("❌ No valid plan generated.")
            continue

        run_actions(driver, plan)

    driver.quit()

if __name__ == "__main__":
    main()
