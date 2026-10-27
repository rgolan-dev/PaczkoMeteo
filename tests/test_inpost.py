import asyncio
import unittest

from api.inpost import read_point, read_points, validate_points


POINT = {"code": "TOR75M", "url": "https://inpost.pl/paczkomat-torun-tor75m-okolna-paczkomaty-kujawsko-pomorskie"}
ENDPOINT = '<div data-shipx-url="/shipx-point-data/51533/TOR75M/air_index_level">'


class Response:
    def __init__(self, status, text="", payload=None):
        self.status_code, self.text, self.payload = status, text, payload

    def json(self):
        return self.payload


class Session:
    def __init__(self, pages, reading):
        self.pages, self.reading, self.calls = list(pages), reading, []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return self.pages.pop(0)

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.reading


class ReaderTests(unittest.IsolatedAsyncioTestCase):
    def test_rejects_arbitrary_hosts_and_invalid_batches(self):
        self.assertEqual(validate_points({"points": [POINT]}), [POINT])
        for url in ["http://inpost.pl/paczkomat-tor75m-test", "https://inpost.pl.evil.test/paczkomat-tor75m-test", "https://inpost.pl:443/paczkomat-tor75m-test", "https://inpost.pl/paczkomat-other-test", POINT["url"] + "?url=http://localhost"]:
            with self.assertRaises(ValueError):
                validate_points({"points": [{**POINT, "url": url}]})
        for points in [[], [POINT] * 2, [POINT] * 9]:
            with self.assertRaises(ValueError):
                validate_points({"points": points})

    async def test_same_session_returns_only_measurements_and_preserves_zero(self):
        payload = {"air_index_level": "GOOD", "air_sensors": ["PM25:0:0", "TEMPERATURE:10.2:"], "unrelated": "omit"}
        session = Session([Response(200, ENDPOINT)], Response(200, payload=payload))
        result = await read_point(POINT, lambda **_: session)
        self.assertEqual(result["httpStatus"], 200)
        self.assertEqual(result["payload"]["air_sensors"], payload["air_sensors"])
        self.assertNotIn("unrelated", result["payload"])
        self.assertEqual(session.calls[-1][2]["headers"]["Referer"], POINT["url"])
        self.assertFalse(session.calls[-1][2]["allow_redirects"])

    async def test_page_block_is_reported_without_retries_or_fake_readings(self):
        session = Session([Response(403)], None)
        result = await read_point(POINT, lambda **_: session)
        self.assertEqual(result["stage"], "page")
        self.assertEqual(result["httpStatus"], 403)
        self.assertEqual(len(session.calls), 1)
        self.assertNotIn("payload", result)

    async def test_missing_measurements_differ_from_access_block(self):
        session = Session([Response(200, ENDPOINT)], Response(404))
        result = await read_point(POINT, lambda **_: session)
        self.assertEqual(result["stage"], "readings")
        self.assertEqual(result["httpStatus"], 404)

    async def test_english_page_fallback_after_polish_redirect(self):
        session = Session([Response(302), Response(200, ENDPOINT)], Response(404))
        result = await read_point(POINT, lambda **_: session)
        self.assertEqual(result["httpStatus"], 404)
        self.assertIn("/en/parcel-locker-", session.calls[1][1])
        self.assertEqual(session.calls[-1][2]["headers"]["Referer"], session.calls[1][1])

    async def test_batch_keeps_point_order_and_limits_concurrency(self):
        active, peak = 0, 0

        async def reader(point):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.005)
            active -= 1
            return {"code": point["code"], "httpStatus": 404}

        points = [{**POINT, "code": f"TOR{i}M"} for i in range(8)]
        results = await read_points(points, reader)
        self.assertEqual([result["code"] for result in results], [point["code"] for point in points])
        self.assertEqual(peak, 3)


if __name__ == "__main__":
    unittest.main()
