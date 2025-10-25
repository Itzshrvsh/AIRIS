import sys
import json
import time

# Optional: Selenium imports if needed
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

# PyAutoGUI for desktop automation
import pyautogui
import webbrowser

def handle_youtube_search(data):
    query = data.get("query", "")
    results = data.get("results", 5)

    if not query:
        print("⚠️ No query provided for YouTube search.")
        return

    print(f"🔎 Searching YouTube for: {query}, top {results} results")

    # Using Selenium for precise control
    driver = webdriver.Chrome()  # Make sure chromedriver is installed
    driver.get("https://www.youtube.com")

    # Search input
    search_box = driver.find_element(By.NAME, "search_query")
    search_box.send_keys(query)
    search_box.send_keys(Keys.RETURN)
    time.sleep(3)

    # Grab top videos
    videos = driver.find_elements(By.ID, "video-title")[:results]
    for v in videos:
        href = v.get_attribute("href")
        if href:
            driver.execute_script(f"window.open('{href}', '_blank');")
            print(f"✅ Opened: {href}")
    print("🎯 Done opening top videos.")


def handle_open_app(data):
    # Example for opening apps or bringing them to front
    app_name = data.get("app_name")
    if not app_name:
        print("⚠️ No app_name provided.")
        return

    import pygetwindow as gw
    import subprocess

    windows = gw.getWindowsWithTitle(app_name)
    if windows:
        win = windows[0]
        win.activate()
        win.restore()
        print(f"✅ Brought {app_name} to front")
    else:
        # If not running, attempt to launch (customize path)
        path_map = {
            "Opera GX": r"C:\Path\To\Opera GX\launcher.exe",
            # add more apps here
        }
        exe_path = path_map.get(app_name)
        if exe_path:
            subprocess.Popen(exe_path)
            print(f"✅ Launched {app_name}")
        else:
            print(f"❌ App path for {app_name} not found")


# Main loop: read from stdin
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        data = json.loads(line.strip())
    except json.JSONDecodeError:
        print("❌ Failed to parse JSON:", line)
        continue

    action = data.get("action")

    if action == "youtube_search":
        handle_youtube_search(data)
    elif action == "open_app":
        handle_open_app(data)
    else:
        print(f"⚠️ Unknown action: {action}")
