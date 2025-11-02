# mouse_coords_1080p.py
import pyautogui
import time

SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1080

print("Move your mouse within 1080p area. Press Ctrl+C to stop.")

try:
    while True:
        x, y = pyautogui.position()
        if 0 <= x < SCREEN_WIDTH and 0 <= y < SCREEN_HEIGHT:
            print(f"X: {x}, Y: {y}", end='\r')  # live update
        else:
            print("Outside 1080p screen", end='\r')
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\nStopped.")
