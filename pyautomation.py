import json, time, base64, requests, sys, signal ,  io
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ======================================
# CONFIG
# ======================================
LLAVA_API = "http://localhost:11434/api/generate"
MODEL = "llava"
PROFILE_PATH = r"C:\Users\itzsh\AppData\Local\Google\Chrome\User Data"


# ======================================
# SAFE CHROME INITIALIZATION
# ======================================
def create_driver():
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--remote-debugging-port=9222")
    opts.add_experimental_option("detach", True)
    opts.add_argument(fr"user-data-dir={PROFILE_PATH}")

    try:
        drv = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=opts
        )
        drv.set_page_load_timeout(30)
        print("✅ Chrome driver initialized.")
        return drv
    except Exception as e:
        print(f"❌ Chrome launch failed: {e}")
        sys.exit(1)


driver = create_driver()


# ======================================
# UTILITIES
# ======================================
def take_screenshot_b64():
    """Return screenshot of current tab as base64."""
    png = driver.get_screenshot_as_png()
    return base64.b64encode(png).decode("utf-8")


def extract_json(text):
    """Extract the first valid JSON object from model output."""
    start, end = text.find("{"), text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except Exception:
            pass
    print("⚠️ LLaVA returned non-JSON text.")
    return {"actions": []}


def ask_llava_for_actions(command, screenshot_b64):
    """Query LLaVA for JSON-encoded browser actions."""
    prompt = f"""
You are a web automation planner.
Output only valid JSON describing actions to achieve:
"{command}"

Allowed actions: goto, click, type
Example:
{{
  "actions": [
    {{"type": "goto", "target": "https://www.youtube.com"}},
    {{"type": "type", "target": "search", "text": "best laptops"}},
    {{"type": "click", "target": "search"}}
  ]
}}
"""

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "images": [screenshot_b64],
        "stream": False
    }

    try:
        res = requests.post(LLAVA_API, json=payload, timeout=120)
        res.raise_for_status()
        raw = res.json().get("response", "")
        print("\n🧠 LLaVA Output:\n", raw)
        return extract_json(raw).get("actions", [])
    except Exception as e:
        print(f"❌ LLaVA query failed: {e}")
        return []


# ======================================
# ELEMENT HELPERS
# ======================================
def find_clickable(target):
    """Try multiple XPaths to find a clickable element."""
    xpats = [
        f"//*[text()[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '{target.lower()}')]]",
        f"//*[@value='{target}']",
        f"//*[@aria-label='{target}']",
        f"//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '{target.lower()}')]",
        f"//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '{target.lower()}')]"
    ]
    for xp in xpats:
        elems = driver.find_elements(By.XPATH, xp)
        if elems:
            return elems[0]
    return None


def find_input(target):
    xpats = [
        f"//input[contains(@placeholder, '{target}')]",
        f"//input[contains(@aria-label, '{target}')]",
        "//input[@name='q']",
        "//input[@id='search']",
        "//input",
        "//textarea"
    ]
    for xp in xpats:
        elems = driver.find_elements(By.XPATH, xp)
        if elems:
            return elems[0]
    return None


# ======================================
# EXECUTOR
# ======================================
def execute_actions(actions):
    for act in actions:
        act_type = act.get("type", "").lower()
        target = act.get("target", "")
        text = act.get("text", "")
        print(f"🔹 Executing: {act_type} → {target}")

        try:
            if act_type == "goto":
                driver.get(target)
                WebDriverWait(driver, 15).until(
                    lambda d: d.execute_script("return document.readyState") == "complete"
                )
                print("✅ Page loaded.")

            elif act_type == "type":
                field = find_input(target)
                if field:
                    driver.execute_script("arguments[0].scrollIntoView(true);", field)
                    WebDriverWait(driver, 5).until(EC.element_to_be_clickable(field))
                    field.clear()
                    field.send_keys(text, Keys.RETURN)
                    print(f"✅ Typed '{text}'.")
                else:
                    print("⚠️ No input field found.")

            elif act_type == "click":
                elem = find_clickable(target)
                if elem:
                    driver.execute_script("arguments[0].scrollIntoView(true);", elem)
                    WebDriverWait(driver, 5).until(EC.element_to_be_clickable(elem))
                    elem.click()
                    print(f"✅ Clicked '{target}'.")
                else:
                    print(f"⚠️ Element '{target}' not found.")

            else:
                print(f"⚠️ Unknown action type '{act_type}'.")

        except Exception as e:
            print(f"❌ Failed action {act}: {e}")

        time.sleep(1.5)


# ======================================
# MAIN ENTRY
# ======================================
def main():
    """Run once for a given command argument."""
    driver.get("https://www.google.com")
    print("🌐 Chrome ready — persistent session active.")

    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        screenshot = take_screenshot_b64()
        actions = ask_llava_for_actions(cmd, screenshot)
        execute_actions(actions)
        print("✅ Automation finished (browser stays open).")
    else:
        print("No command provided — browser idle.")

    # Keep alive but interruptible
    def handle_sigint(sig, frame):
        print("\n🛑 Closing session gracefully.")
        driver.quit()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigint)
    while True:
        time.sleep(3)


if __name__ == "__main__":
    main()
