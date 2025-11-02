# automation_server.py
from flask import Flask, request, jsonify
from pyautomation import driver, ask_llava_for_actions, execute_actions, take_screenshot_b64

app = Flask(__name__)

@app.route("/command", methods=["POST"])
def handle_command():
    cmd = request.json.get("command", "")
    try:
        screenshot_b64 = take_screenshot_b64(driver)
        actions = ask_llava_for_actions(cmd, screenshot_b64)
        execute_actions(driver, actions)
        return jsonify({"status": "success", "executed_actions": len(actions)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

if __name__ == "__main__":
    print("Automation server running on port 5555...")
    app.run(port=5555)
