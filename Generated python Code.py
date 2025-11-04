import ctypes
from ctypes import wintypes

# Define POINT structure
class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

# Load user32.dll
user32 = ctypes.WinDLL('user32', use_last_error=True)

# Get caret position function
GetCaretPos = user32.GetCaretPos
GetCaretPos.argtypes = [ctypes.POINTER(POINT)]
GetCaretPos.restype = wintypes.BOOL

# Get foreground window and caret position
pt = POINT()
if GetCaretPos(ctypes.byref(pt)):
    print(f"Caret position: ({pt.x}, {pt.y})")
else:
    print("Failed to get caret position.")
