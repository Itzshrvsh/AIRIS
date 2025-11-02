import numpy as np
from ultralytics import YOLO
import mss

# -----------------------------
# Load YOLO model
# -----------------------------
model = YOLO("best (yt).pt")
flag = 0

# -----------------------------
# Setup screen capture
# -----------------------------
sct = mss.mss()

# -----------------------------
# Detect once and exit
# -----------------------------
for monitor in sct.monitors[1:]:  # your desired monitor
    # Grab screen (drop alpha channel)
    screen = np.array(sct.grab(monitor))[..., :3]  # RGB/BGR depending on your model
    
    # Run YOLO detection (keep preprocessing inside YOLO)
    results = model.predict(screen, verbose=False)
    
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            label = model.names[cls_id]

            # Absolute screen coordinates
            abs_x1 = x1 + monitor["left"]
            abs_y1 = y1 + monitor["top"]
            abs_x2 = x2 + monitor["left"]
            abs_y2 = y2 + monitor["top"]
            cx = (abs_x1 + abs_x2) / 2
            cy = (abs_y1 + abs_y2) / 2

            # Print center coordinates and confidence
            print(f"{int(cx)} {int(cy)} {conf:.2f}", flush=True)
            flag = 1
            break
        if flag:
            break
    if flag:
        break
