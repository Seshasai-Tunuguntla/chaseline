from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
BUILD_DIR = ROOT / "data" / "build"
DB_PATH = BUILD_DIR / "ipl.duckdb"
WEB_DATA = ROOT / "web" / "public" / "data"
SAMPLE_DIR = ROOT / "tests" / "fixtures" / "sample"

CRICSHEET_URL = "https://cricsheet.org/downloads/ipl_json.zip"
SEED = 20260607
MAX_BALLS = 120
