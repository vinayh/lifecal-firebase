import os
from pathlib import Path


def get_secret(name: str) -> str:
    env_name = os.getenv("SCREENMINDER_ENV")
    try:
        if (env_name == "FLY" or env_name == "AZURE_FUNCTION") and name in os.environ:
            return os.getenv(name)
        else:
            path = Path(f".secrets/{name.lower()}")
            with path.open("r") as f:
                return f.read().splitlines()[0]
    except Exception as e:
        print(f"Error getting secret {name}: {e}")
        raise


SECRET_NAMES = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
SECRETS = {s: get_secret(s) for s in SECRET_NAMES}
