import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import webbrowser
from threading import Timer

app = FastAPI(title="Shalya Saarthi Backend")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Detect if running in PyInstaller bundled executable
if getattr(sys, 'frozen', False):
    external_dir = os.path.dirname(sys.executable)
    internal_dir = sys._MEIPASS
else:
    external_dir = os.path.dirname(os.path.abspath(__file__))
    internal_dir = os.path.dirname(os.path.abspath(__file__))

# Set up implants folder path (external to the EXE, so users can modify it)
IMPLANTS_DIR = os.path.join(external_dir, "implants")
os.makedirs(IMPLANTS_DIR, exist_ok=True)

# Mount implants directory to serve STL files statically
app.mount("/implants", StaticFiles(directory=IMPLANTS_DIR), name="implants")

@app.get("/api/implants")
def list_implants():
    """Returns a list of STL files in the implants directory."""
    if not os.path.exists(IMPLANTS_DIR):
        return []
    # List all .stl files in the implants folder
    return [f for f in os.listdir(IMPLANTS_DIR) if f.lower().endswith(".stl")]

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "message": "Shalya Saarthi Backend API is running successfully."
    }

# Serve frontend static assets (must be mounted after API routes to avoid overriding them)
FRONTEND_DIR = os.path.join(internal_dir, "dist")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    # Also fallback to searching for frontend/dist folder in dev environment
    dev_frontend_dir = os.path.join(os.path.dirname(external_dir), "frontend", "dist")
    if os.path.exists(dev_frontend_dir):
        app.mount("/", StaticFiles(directory=dev_frontend_dir, html=True), name="frontend")

def open_browser():
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    # Open browser 1.5 seconds after starting the server
    Timer(1.5, open_browser).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

