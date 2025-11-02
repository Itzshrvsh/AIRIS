# returns caret location of the focused input
# output: x,y
import pyautogui

# simple approximation using current typing location
x, y = pyautogui.position()
print(f"{x},{y}")
