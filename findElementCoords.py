import requests
import json
import pyautogui
import time
import base64

API_URL = "http://localhost:11434/api/generate"
MODEL = "llava"

def capture_screen(path="screen.png"):
    screenshot = pyautogui.screenshot()
    screenshot.save(path)
    return path

def encode_image_to_base64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def get_element_coordinates(description, image_path, model=MODEL):
    image_b64 = encode_image_to_base64(image_path)

    prompt = f"""
You are a vision model analyzing a 1920x1080 desktop screenshot.
Find the GUI element described as: "{description}"

Return JSON with one or more bounding boxes like:
[{{"x1":100,"y1":200,"x2":160,"y2":230}}]
All coordinates must be integer pixel values for a 1920x1080 screen.
If only one match is found, return a single object instead of a list.
No markdown, no commentary, only JSON.
Think of the user request and return the most relevant element(s).
dont return UNKNOWN, return an empty list if nothing is found.
if any service name provided in the description, try to find its logo on screen, get to know its color scheme and check for the user req and find it.
"""

    payload = {
        "model": model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False
    }

    try:
        res = requests.post(API_URL, json=payload)
        res.raise_for_status()
        text = res.json().get("response", "").strip()
        text = text.replace("```json", "").replace("```", "").strip()
        coords = json.loads(text)
        return coords
    except Exception as e:
        print("Error contacting LLaVA or parsing response:", e)
        return None

def select_best_box(coords):
    """Pick the largest bounding box if multiple are returned."""
    if isinstance(coords, dict):
        return coords
    if isinstance(coords, list) and len(coords) > 0:
        def area(c): return abs((c["x2"] - c["x1"]) * (c["y2"] - c["y1"]))
        return max(coords, key=area)
    return None

def move_and_click(coords):
    screen_w, screen_h = pyautogui.size()
    base_w, base_h = 1920, 1080
    scale_x, scale_y = screen_w / base_w, screen_h / base_h

    if not coords:
        print("No valid coords to click.")
        return

    try:
        x = int(((coords["x1"] + coords["x2"]) / 2) * scale_x)
        y = int(((coords["y1"] + coords["y2"]) / 2) * scale_y)
    except Exception as e:
        print("Coordinate parsing error:", e)
        return

    print(f"Moving mouse to ({x}, {y}) and clicking.")
    pyautogui.moveTo(x, y, duration=0.4)
    pyautogui.click()

def main():
    desc = input("Enter element description: ")
    screenshot_path = capture_screen()

    coords = get_element_coordinates(desc, screenshot_path)
    print("Detected coordinates:", coords)

    best = select_best_box(coords)
    if best:
        move_and_click(best)
    else:
        print("No usable box found.")

if __name__ == "__main__":
    main()
