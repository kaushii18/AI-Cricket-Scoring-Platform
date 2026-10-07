"""Load local settings and run the independent AI service."""

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8001")),
        reload=True,
    )