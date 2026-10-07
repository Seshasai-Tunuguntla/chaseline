"""Download the Cricsheet IPL JSON archive (not committed; fetched on every pipeline run)."""
import io
import zipfile
from pathlib import Path

import requests

from .config import CRICSHEET_URL, RAW_DIR


def download(dest: Path = RAW_DIR, url: str = CRICSHEET_URL) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        zf.extractall(dest)
    return dest
