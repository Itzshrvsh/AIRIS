import json
import sys
import time
from playwright.sync_api import sync_playwright
import threading
try:
    import pygetwindow as gw
except:
    gw = None

def bring_browser_front(title_substr="YouTube"):
    # Wait 5 mins, then bring browser to front
    time.sleep(5*60)
    if gw:
        for w in gw.getWindowsWithTitle(title_substr):
            w.activate()
    else:
        print("[INFO] pygetwindow not installed, cannot bring window to front.")

def search_youtube(query):
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://www.youtube.com")
        page.fill('input#search', query)
        page.keyboard.press("Enter")
        page.wait_for_selector('ytd-video-renderer', timeout=10000)
        videos = page.query_selector_all('ytd-video-renderer')
        top5 = videos[:5]
        for i, video in enumerate(top5):
            link = video.query_selector('a#video-title')
            if link:
                url = link.get_attribute('href')
                full_url = "https://www.youtube.com" + url
                results.append(full_url)
                # open in new tab
                page.evaluate(f"window.open('{full_url}','_blank')")
        threading.Thread(target=bring_browser_front, args=("YouTube",), daemon=True).start()
    return results

def handle_line(line):
    try:
        req = json.loads(line)
        instr = req.get("instruction", "").lower()
        if "youtube" in instr:
            query = instr.replace("search", "").replace("youtube", "").replace("top 5", "").strip()
            top_videos = search_youtube(query)
            print(json.dumps({"status":"done","top_videos":top_videos}))
            sys.stdout.flush()
        else:
            print(json.dumps({"error":"Instruction not recognized"}))
            sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    for line in sys.stdin:
        handle_line(line)
