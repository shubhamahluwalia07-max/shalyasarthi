import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Shalya Saarthi Backend")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up implants folder path
IMPLANTS_DIR = os.path.join(os.path.dirname(__file__), "implants")
os.makedirs(IMPLANTS_DIR, exist_ok=True)

# Mount implants directory to serve STL files statically
app.mount("/implants", StaticFiles(directory=IMPLANTS_DIR), name="implants")

@app.get("/")
def read_root():
    return {
        "status": "healthy", 
        "message": "Shalya Saarthi Backend API is running successfully."
    }

@app.get("/api/implants")
def list_implants():
    """Returns a list of STL files in the implants directory."""
    if not os.path.exists(IMPLANTS_DIR):
        return []
    # List all .stl files in the implants folder
    return [f for f in os.listdir(IMPLANTS_DIR) if f.lower().endswith(".stl")]
