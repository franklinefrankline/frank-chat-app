import os
import sys
from pathlib import Path

# Add api directory to sys.path
api_dir = Path(__file__).resolve().parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from index import app
