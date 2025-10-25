import os
import subprocess
import winreg

def get_registry_apps():
    apps = set()
    reg_paths = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    ]
    for root in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        for path in reg_paths:
            try:
                key = winreg.OpenKey(root, path)
                for i in range(winreg.QueryInfoKey(key)[0]):
                    subkey_name = winreg.EnumKey(key, i)
                    subkey = winreg.OpenKey(key, subkey_name)
                    try:
                        name = winreg.QueryValueEx(subkey, "DisplayName")[0]
                        apps.add(name)
                    except FileNotFoundError:
                        continue
            except FileNotFoundError:
                continue
    return apps

def get_exe_apps(paths=None):
    if paths is None:
        paths = [r"C:\Program Files", r"C:\Program Files (x86)"]
    apps = set()
    for path in paths:
        for root, dirs, files in os.walk(path):
            for f in files:
                if f.endswith(".exe"):
                    apps.add(f[:-4])  # strip .exe for cleaner name
    return apps

def get_store_apps():
    try:
        cmd = 'powershell "Get-AppxPackage | Select Name"'
        output = subprocess.check_output(cmd, shell=True, text=True)
        lines = output.splitlines()
        # Skip header lines and empty lines
        names = [line.strip() for line in lines if line.strip() and "Name" not in line]
        return set(names)
    except Exception:
        return set()

def get_all_apps():
    apps = set()
    apps.update(get_registry_apps())
    apps.update(get_exe_apps())
    apps.update(get_store_apps())
    return sorted(apps)

if __name__ == "__main__":
    all_apps = get_all_apps()
    for app in all_apps:
        print(app)
