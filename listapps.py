import winreg

def list_registered_apps():
    reg_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
    apps = {}

    for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        try:
            with winreg.OpenKey(hive, reg_path) as key:
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, subkey_name) as subkey:
                            exe_path, _ = winreg.QueryValueEx(subkey, None)  # default value
                            apps[subkey_name] = exe_path
                    except FileNotFoundError:
                        continue
        except FileNotFoundError:
            continue
    return apps

# List all apps
apps = list_registered_apps()
for app_name, exe_path in apps.items():
    print(f"{app_name} -> {exe_path}")
