import winreg
from difflib import get_close_matches

def get_registered_apps():
    """Retrieve all apps registered in App Paths in the registry."""
    apps = {}
    reg_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
    
    for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        try:
            with winreg.OpenKey(hive, reg_path) as key:
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, subkey_name) as subkey:
                            exe_path, _ = winreg.QueryValueEx(subkey, None)  # default value
                            apps[subkey_name.lower()] = exe_path
                    except FileNotFoundError:
                        continue
        except FileNotFoundError:
            continue
    return apps

def find_app(input_name):
    input_name = input_name.lower()
    apps = get_registered_apps()
    matches = get_close_matches(input_name, apps.keys(), n=1, cutoff=0.5)
    if matches:
        app_name = matches[0]
        exe_path = apps[app_name]
        return app_name, exe_path
    return None, None

# Example usage
while True:
    user_input = input("Enter app name: ")
    app_name, exe_path = find_app(user_input)

    if app_name:
        print(f"Found app: {app_name} -> {exe_path}")
    else:
        print("No matching app found in registry")
