"""Environment-backed configuration for training and model serving."""

import os
from pathlib import Path

from dotenv import load_dotenv


SERVICE_DIRECTORY = Path(__file__).resolve().parents[2]
load_dotenv(SERVICE_DIRECTORY / ".env")

NODE_API_BASE_URL = os.getenv(
    "NODE_API_BASE_URL",
    "http://127.0.0.1:3000/api",
).rstrip("/")

configured_model_path = Path(
    os.getenv("WIN_MODEL_PATH", "models/win_predictor.joblib")
).expanduser()
MODEL_PATH = (
    configured_model_path
    if configured_model_path.is_absolute()
    else SERVICE_DIRECTORY / configured_model_path
)

MIN_TRAINING_MATCHES = int(os.getenv("WIN_MIN_TRAINING_MATCHES", "30"))