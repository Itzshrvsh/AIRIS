import cv2  # type: ignore
import numpy as np  # type: ignore
from ultralytics import YOLO  # type: ignore
import mss  # type: ignore
import time

# -----------------------------
# 1️⃣ Load your trained YOLO model
# -----------------------------
model = YOLO("best.pt")  # replace with your model path
flag = 0

# -----------------------------
# 2️⃣ Setup screen capture
# -----------------------------
sct = mss.mss()

# -----------------------------
# 3️⃣ Continuous detection loop
# -----------------------------
while True:
    start_time = time.time()

    # Loop through all monitors
    for monitor in sct.monitors[1:]:  # skip index 0
        width = monitor["width"]
        height = monitor["height"]

        # Skip monitors that are not 1080p
        if width != 1920 or height != 1080:
            continue

        screen = np.array(sct.grab(monitor))
        screen_bgr = cv2.cvtColor(screen, cv2.COLOR_BGRA2BGR)

        # Run YOLO model on screenshot
        results = model.predict(screen_bgr, verbose=False)

        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])  # bounding box coordinates
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                label = model.names[cls_id]

                # Adjust coordinates to absolute screen coordinates
                abs_x1 = x1 + monitor["left"]
                abs_y1 = y1 + monitor["top"]
                abs_x2 = x2 + monitor["left"]
                abs_y2 = y2 + monitor["top"]
                cx = (abs_x1 + abs_x2) / 2
                cy = (abs_y1 + abs_y2) / 2

                # Draw rectangle
                cv2.rectangle(screen_bgr, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(
                    screen_bgr,
                    f"{label} {conf:.2f}",
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2,
                )

                # Print center coordinates
                print(f"{int(cx)} {int(cy)}")

                flag = 1
                break  # stop after first detection

        if flag == 1:
            break  # stop after first detection on this monitor

    # Optional: Show primary monitor annotated
    cv2.imshow("Logo Detection", screen_bgr)
    if cv2.waitKey(1) & 0xFF == 27 or flag == 1:  # ESC to exit
        break

cv2.destroyAllWindows()
