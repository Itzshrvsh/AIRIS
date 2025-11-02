import sys
import subprocess
import os

def launch_app(app_name):
    paths = [r"C:\Program Files", r"C:\Program Files (x86)"]
    for path in paths:
        for root, dirs, files in os.walk(path):
            for f in files:
                if f.lower().startswith(app_name.lower()) and f.endswith('.exe'):
                    exe_path = os.path.join(root, f)
                    subprocess.Popen(exe_path)
                    print(f"✅ Launched: {exe_path}")
                    return
    # fallback
    try:
        subprocess.Popen(app_name)
        print(f"✅ Launched via direct call: {app_name}")
    except Exception as e:
        print(f"❌ Failed to launch {app_name}: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ No app name provided")
    else:
        launch_app(sys.argv[1])
