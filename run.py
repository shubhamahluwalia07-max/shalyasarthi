import os
import sys
import subprocess
import time
import socket
import webbrowser
from pathlib import Path

# Color codes for clean terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
CYAN = "\033[96m"
RESET = "\033[0m"

# Auto-enable ANSI colors on Windows cmd if possible
if os.name == 'nt':
    os.system('color')

def print_banner():
    banner = f"""
{BLUE}======================================================================
                 Shalya Saarthi Surgical Suite Launcher
======================================================================{RESET}
"""
    print(banner)

def get_paths():
    root_dir = Path(__file__).parent.resolve()
    backend_dir = root_dir / "backend"
    frontend_dir = root_dir / "frontend"
    venv_dir = backend_dir / ".venv"
    
    if os.name == "nt":
        python_exe = venv_dir / "Scripts" / "python.exe"
        pip_exe = venv_dir / "Scripts" / "pip.exe"
    else:
        python_exe = venv_dir / "bin" / "python"
        pip_exe = venv_dir / "bin" / "pip"
        
    return root_dir, backend_dir, frontend_dir, venv_dir, python_exe, pip_exe

def check_port_in_use(host="127.0.0.1", port=8000):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return False
        except socket.error:
            return True

def setup_backend():
    _, backend_dir, _, venv_dir, python_exe, _ = get_paths()
    
    # Create virtual environment if it doesn't exist
    if not venv_dir.exists():
        print(f"{YELLOW}[*] Creating Python virtual environment in {venv_dir}...{RESET}")
        try:
            subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
            print(f"{GREEN}[+] Virtual environment created.{RESET}")
        except subprocess.CalledProcessError as e:
            print(f"{RED}[-] Failed to create virtual environment: {e}{RESET}")
            sys.exit(1)
            
    # Upgrade pip and install requirements
    requirements_file = backend_dir / "requirements.txt"
    if requirements_file.exists():
        print(f"{YELLOW}[*] Checking/Installing backend Python dependencies...{RESET}")
        try:
            subprocess.run([str(python_exe), "-m", "pip", "install", "--upgrade", "pip"], check=True, stdout=subprocess.DEVNULL)
            subprocess.run([str(python_exe), "-m", "pip", "install", "-r", str(requirements_file)], check=True)
            print(f"{GREEN}[+] Backend dependencies are up to date.{RESET}")
        except subprocess.CalledProcessError as e:
            print(f"{RED}[-] Failed to install backend dependencies: {e}{RESET}")
            sys.exit(1)

def setup_frontend():
    _, _, frontend_dir, _, _, _ = get_paths()
    node_modules_dir = frontend_dir / "node_modules"
    
    if not node_modules_dir.exists():
        print(f"{YELLOW}[*] frontend/node_modules not found. Installing frontend npm packages...{RESET}")
        # Check if npm is installed
        try:
            subprocess.run(["npm", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"{RED}[-] npm was not found. Please install Node.js and npm.{RESET}")
            sys.exit(1)
            
        try:
            subprocess.run(["npm", "install"], cwd=str(frontend_dir), check=True, shell=True)
            print(f"{GREEN}[+] Frontend dependencies installed.{RESET}")
        except subprocess.CalledProcessError as e:
            print(f"{RED}[-] Failed to install frontend dependencies: {e}{RESET}")
            sys.exit(1)

def start_services():
    _, backend_dir, frontend_dir, _, python_exe, _ = get_paths()
    
    # Check ports
    if check_port_in_use("127.0.0.1", 8000):
        print(f"{RED}[-] Error: Port 8000 (Backend) is already in use.{RESET}")
        sys.exit(1)
        
    print(f"\n{CYAN}[*] Starting Backend (FastAPI)...{RESET}")
    # Spawn backend
    backend_proc = subprocess.Popen(
        [str(python_exe), "-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
        cwd=str(backend_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    print(f"{CYAN}[*] Starting Frontend (Vite)...{RESET}")
    # Spawn frontend
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(frontend_dir),
        shell=True
    )
    
    # Wait for backend to be ready
    print(f"{YELLOW}[*] Waiting for backend services to initialize...{RESET}")
    retries = 30
    backend_ready = False
    while retries > 0:
        if check_port_in_use("127.0.0.1", 8000):
            backend_ready = True
            break
        time.sleep(0.5)
        retries -= 1
        
    if backend_ready:
        print(f"{GREEN}[+] Services started successfully.{RESET}")
        print(f"{GREEN}[+] Opening user interface in your web browser...{RESET}")
        # Default Vite dev server URL
        webbrowser.open("http://localhost:5173/")
    else:
        print(f"{YELLOW}[!] Warning: Backend service took too long to start. Please check terminal outputs.{RESET}")
        
    print(f"\n{BLUE}======================================================================{RESET}")
    print(f"{GREEN}Shalya Saarthi is active!{RESET}")
    print(f" - Frontend (UI): http://localhost:5173/")
    print(f" - Backend (API): http://localhost:8000/")
    print(f"{CYAN}Press Ctrl+C in this terminal to shut down all services.{RESET}")
    print(f"{BLUE}======================================================================{RESET}\n")
    
    try:
        # Keep monitoring processes and printing backend output
        while True:
            # Check if any process has exited
            if backend_proc.poll() is not None:
                print(f"{RED}[-] Backend process terminated unexpectedly.{RESET}")
                break
            if frontend_proc.poll() is not None:
                print(f"{RED}[-] Frontend process terminated unexpectedly.{RESET}")
                break
            # Non-blocking read of backend output to show logs
            line = backend_proc.stdout.readline()
            if line:
                print(f"{BLUE}[Backend]{RESET} {line.strip()}")
            else:
                time.sleep(0.1)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}[*] Shutting down services...{RESET}")
    finally:
        # Terminate processes
        try:
            backend_proc.terminate()
            backend_proc.wait(timeout=3)
        except Exception:
            try:
                backend_proc.kill()
            except Exception:
                pass
                
        try:
            frontend_proc.terminate()
            if os.name == 'nt':
                # Force kill process tree on Windows for the shell script child
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(frontend_proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                frontend_proc.wait(timeout=3)
        except Exception:
            try:
                frontend_proc.kill()
            except Exception:
                pass
                
        print(f"{GREEN}[+] All services stopped.{RESET}")

if __name__ == "__main__":
    print_banner()
    setup_backend()
    setup_frontend()
    start_services()
