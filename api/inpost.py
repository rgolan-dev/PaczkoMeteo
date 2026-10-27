"""Anonymous, bounded InPost reader for Vercel's Python runtime."""

import asyncio
import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from curl_cffi.requests import AsyncSession


def validate_points(body):
    points = body.get("points") if isinstance(body, dict) else None
    if not isinstance(points, list) or not 1 <= len(points) <= 8:
        raise ValueError("Expected 1–8 points")
    codes = set()
    for point in points:
        if not isinstance(point, dict):
            raise ValueError("Invalid point")
        code, url = point.get("code", ""), point.get("url", "")
        if not isinstance(code, str) or not re.fullmatch(r"[A-Z0-9]{3,12}", code):
            raise ValueError("Invalid point code")
        if not isinstance(url, str) or len(url) > 500:
            raise ValueError("Invalid point URL")
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.netloc != "inpost.pl"
                or parsed.query or parsed.fragment
                or not re.fullmatch(r"/paczkomat-[a-z0-9-]+", parsed.path)
                or f"-{code.lower()}-" not in parsed.path):
            raise ValueError("Only official InPost point pages are accepted")
        if code in codes:
            raise ValueError("Duplicate point")
        codes.add(code)
    return points


async def read_point(point, session_factory=AsyncSession):
    code, url = point["code"], point["url"]
    result = {"code": code, "httpStatus": None, "stage": "network"}
    english = url.replace("https://inpost.pl/paczkomat-", "https://inpost.pl/en/parcel-locker-", 1)
    try:
        async with session_factory(impersonate="chrome", timeout=5) as session:
            for page_url in (url, english):
                page = await session.get(page_url, allow_redirects=False)
                result.update(httpStatus=page.status_code, stage="page")
                if page.status_code in (403, 429):
                    return result
                if page.status_code != 200:
                    continue
                match = re.search(
                    r'data-shipx-url="(/(?:en/)?shipx-point-data/\d+/'
                    + re.escape(code) + r'/air_index_level)"', page.text
                )
                if not match:
                    continue
                response = await session.post(
                    "https://inpost.pl" + match.group(1),
                    headers={"X-Requested-With": "XMLHttpRequest", "Origin": "https://inpost.pl", "Referer": page_url},
                    allow_redirects=False,
                )
                result.update(httpStatus=response.status_code, stage="readings")
                if response.status_code == 200:
                    payload = response.json()
                    if not isinstance(payload, dict) or not isinstance(payload.get("air_sensors"), list):
                        return {**result, "stage": "invalid-response"}
                    # Only return measurement fields, never response headers or session cookies.
                    result["payload"] = {
                        "air_index_level": payload.get("air_index_level"),
                        "air_sensors": [value for value in payload["air_sensors"][:100] if isinstance(value, str) and len(value) < 200],
                    }
                    result["retrievedAt"] = datetime.now(timezone.utc).isoformat()
                return result
            return {**result, "stage": "missing-page"}
    except Exception:
        return {"code": code, "httpStatus": None, "stage": "network"}


async def read_points(points, reader=read_point):
    semaphore = asyncio.Semaphore(3)

    async def bounded(point):
        async with semaphore:
            return await reader(point)

    tasks = [asyncio.create_task(bounded(point)) for point in points]
    _, pending = await asyncio.wait(tasks, timeout=16)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    return [
        {"code": point["code"], "httpStatus": None, "stage": "timeout"}
        if task.cancelled() or task.exception() else task.result()
        for point, task in zip(points, tasks)
    ]


class handler(BaseHTTPRequestHandler):
    def respond(self, status, body):
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"status": "ready"})
        else:
            self.respond(405, {"message": "Use POST"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192:
                raise ValueError("Invalid request size")
            points = validate_points(json.loads(self.rfile.read(length)))
        except (ValueError, TypeError, UnicodeError):
            self.respond(400, {"message": "Invalid InPost point list"})
            return
        self.respond(200, {"results": asyncio.run(read_points(points)), "transport": "curl_cffi"})


if __name__ == "__main__":
    import os
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PACZKOMETEO_API_PORT", "8787"))), handler).serve_forever()
