# get_compose_coords.py
import cv2
import numpy as np
import pyautogui

# Load the template image of the Compose button
template = cv2.imread('subject.png', cv2.IMREAD_GRAYSCALE)
if template is None:
    raise FileNotFoundError("compose_template.png not found")

w, h = template.shape[::-1]

# Take a screenshot
screenshot = pyautogui.screenshot()
screen = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2GRAY)

# Template matching
res = cv2.matchTemplate(screen, template, cv2.TM_CCOEFF_NORMED)
min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)

# Set a threshold for detection
threshold = 0.8
if max_val >= threshold:
    # Coordinates of the top-left corner of the matched region
    x, y = max_loc
    # Optional: adjust to click at the center of the button
    center_x = x + w // 2
    center_y = y + h // 2
    print(f"{center_x},{center_y}")
else:
    print("0,0")  # or UNKNOWN if not found
