import sys
import json
from pyautomation import ask_llava_for_actions, execute_actions, take_screenshot_b64, driver
import io
from selenium.common.exceptions import WebDriverException

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='ignore')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='ignore')

def handle_bridge_command(command: str):
    try:
        # If browser was closed manually, this will throw
        driver.title  # force a driver check

        screenshot_b64 = take_screenshot_b64(driver)
        actions = ask_llava_for_actions(command, screenshot_b64)
        execute_actions(driver, actions)
        return {"status": "success", "executed_actions": len(actions)}

    except WebDriverException:
        # Browser window closed manually → exit gracefully
        print(json.dumps({"status": "closed", "message": "Browser was closed by user"}))
        sys.exit(0)

    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        sys.exit(1)

    command = " ".join(sys.argv[1:])
    result = handle_bridge_command(command)
    print(json.dumps(result))
