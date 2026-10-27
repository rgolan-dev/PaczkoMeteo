"""One-shot connectivity check; no accounts, proxies or scheduled polling."""
import asyncio
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.inpost import read_points

points = [
    {"code": "TOR75M", "url": "https://inpost.pl/paczkomat-torun-tor75m-okolna-paczkomaty-kujawsko-pomorskie"},
    {"code": "TOR02BAPP", "url": "https://inpost.pl/paczkomat-torun-tor02bapp-podgorska-paczkomaty-kujawsko-pomorskie"},
]
results = asyncio.run(read_points(points))
print(json.dumps(results, ensure_ascii=False))
summary = [{key: result.get(key) for key in ("code", "httpStatus", "stage")} for result in results]
print("::notice title=InPost connectivity::" + json.dumps(summary))

for result in results:
    for reading in result.get("payload", {}).get("air_sensors", []):
        parts = reading.split(":")
        try:
            if len(parts) >= 2 and parts[1].strip() and math.isfinite(float(parts[1])):
                sys.exit(0)
        except ValueError:
            pass
print("::error::No actual sensor readings were available from this runner")
sys.exit(1)
