"""Fetch completed CricPulse matches, evaluate, and save the win model."""

import json
import sys
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.core.config import NODE_API_BASE_URL
from app.services.win_training import InsufficientTrainingDataError, train_and_save_model


def fetch_matches() -> list[dict]:
    request = Request(
        f"{NODE_API_BASE_URL}/matches",
        headers={"Accept": "application/json"},
    )
    with urlopen(request, timeout=10) as response:
        matches = json.loads(response.read().decode("utf-8"))
    if not isinstance(matches, list):
        raise ValueError("Node match API did not return a match list.")
    return matches


def main() -> int:
    try:
        report = train_and_save_model(fetch_matches())
    except (InsufficientTrainingDataError, URLError, TimeoutError, OSError, ValueError) as error:
        print(f"Win model training not completed: {error}", file=sys.stderr)
        return 1

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
