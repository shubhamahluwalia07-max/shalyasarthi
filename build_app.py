import os
import sys
import shutil
import urllib.request
import zipfile
import subprocess

# Define directory paths
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTABLE_DIR = os.path.join(ROOT_DIR, ".node_portable")
NODE_ZIP_URL = "https://nodejs.org/dist/v22.13.0/node-v22.13.0-win-x64.zip"
NODE_ZIP_PATH = os.path.join(PORTABLE_DIR, "node.zip")
NODE_EXTRACTED_DIR = os.path.join(PORTABLE_DIR, "node-v22.13.0-win-x64")

# Set backend venv paths
VENV_PYTHON = os.path.join(ROOT_DIR, "backend", ".venv", "Scripts", "python.exe")
VENV_PIP = os.path.join(ROOT_DIR, "backend", ".venv", "Scripts", "pip.exe")

def download_progress(block_num, block_size, total_size):
    """Callback to print download progress."""
    read_so_far = block_num * block_size
    if total_size > 0:
        percent = min(100, (read_so_far * 100) // total_size)
        sys.stdout.write(f"\rDownloading Node.js: {percent}% ({read_so_far // (1024*1024)}MB / {total_size // (1024*1024)}MB)")
    else:
        sys.stdout.write(f"\rDownloading Node.js: {read_so_far // (1024*1024)}MB")
    sys.stdout.flush()

def setup_portable_node():
    """Downloads and extracts a portable version of Node.js."""
    if os.path.exists(NODE_EXTRACTED_DIR):
        print(f"[*] Portable Node.js already setup at: {NODE_EXTRACTED_DIR}")
        return

    os.makedirs(PORTABLE_DIR, exist_ok=True)
    print(f"[*] Downloading Node.js from {NODE_ZIP_URL}...")
    
    urllib.request.urlretrieve(NODE_ZIP_URL, NODE_ZIP_PATH, download_progress)
    print("\n[*] Download complete. Extracting zip archive...")
    
    with zipfile.ZipFile(NODE_ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(PORTABLE_DIR)
        
    print("[*] Extraction complete. Cleaning up zip file...")
    os.remove(NODE_ZIP_PATH)

def build_frontend():
    """Builds the Vite frontend using the portable Node.js instance."""
    npm_path = os.path.join(NODE_EXTRACTED_DIR, "npm.cmd")
    frontend_dir = os.path.join(ROOT_DIR, "frontend")
    
    # Add portable Node.js to PATH environment for child processes
    env = os.environ.copy()
    env["PATH"] = NODE_EXTRACTED_DIR + os.pathsep + env.get("PATH", "")
    
    print("[*] Running 'npm install' in frontend...")
    # Run npm install
    result = subprocess.run([npm_path, "install"], cwd=frontend_dir, env=env, shell=True)
    if result.returncode != 0:
        print("[!] Error running npm install")
        sys.exit(1)
        
    print("[*] Running 'npm run build' in frontend...")
    # Run npm run build
    result = subprocess.run([npm_path, "run", "build"], cwd=frontend_dir, env=env, shell=True)
    if result.returncode != 0:
        print("[!] Error running npm run build")
        sys.exit(1)
        
    print("[*] Frontend successfully compiled to 'frontend/dist'")

def compile_to_exe():
    """Compiles the backend + frontend static assets into a single EXE."""
    print("[*] Ensuring PyInstaller is installed in the virtual environment...")
    subprocess.run([VENV_PIP, "install", "pyinstaller"], check=True)
    
    frontend_dist = os.path.join(ROOT_DIR, "frontend", "dist")
    backend_main = os.path.join(ROOT_DIR, "backend", "main.py")
    
    print("[*] Compiling with PyInstaller...")
    # Build options
    pyinstaller_cmd = [
        VENV_PYTHON, "-m", "PyInstaller",
        "--clean",
        "--onefile",
        "--name", "ShalyaSaarthi",
        f"--add-data={frontend_dist};dist",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        backend_main
    ]
    
    subprocess.run(pyinstaller_cmd, check=True)
    print("[*] Executable compiled successfully inside 'dist/' directory.")

def copy_external_assets():
    """Copies the implants folder next to the generated EXE."""
    src_implants = os.path.join(ROOT_DIR, "backend", "implants")
    dest_implants = os.path.join(ROOT_DIR, "dist", "implants")
    
    if os.path.exists(dest_implants):
        print("[*] Existing dist/implants folder found. Updating contents...")
        shutil.rmtree(dest_implants)
        
    shutil.copytree(src_implants, dest_implants)
    print(f"[*] Copied implants folder to {dest_implants}")

if __name__ == "__main__":
    print("=== SHALYA SAARTHI EXE BUILDER ===")
    setup_portable_node()
    build_frontend()
    compile_to_exe()
    copy_external_assets()
    print("\n[+] SUCCESS: Build complete!")
    print(f"[+] Output executable path: {os.path.join(ROOT_DIR, 'dist', 'ShalyaSaarthi.exe')}")
    print("[+] Place new implant STL files into the 'dist/implants' folder.")
