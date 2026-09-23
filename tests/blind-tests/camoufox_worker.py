"""Runs one target inside the camoufox container. Called via `docker exec`.

  python camoufox_worker.py '<json: {url, wait, triggers, read_js, headless}>'

headless: true | false | "virtual"   (virtual = Xvfb, camoufox's server mode)
Prints one JSON line: {ok, data, error, wall_s, meta}
"""
import json
import sys
import time


def main():
    spec = json.loads(sys.argv[1])
    headless = spec.get("headless", True)
    t0 = time.time()
    meta = {"headless": headless, "where": "docker"}
    try:
        from camoufox.sync_api import Camoufox
        with Camoufox(headless=headless) as browser:
            page = browser.new_page()
            page.goto(spec["url"], timeout=60000, wait_until="domcontentloaded")
            page.wait_for_timeout(spec["wait"])
            for js in spec.get("triggers", []):
                try:
                    page.evaluate(js)
                except Exception as e:
                    meta.setdefault("trigger_err", []).append(str(e)[:80])
                page.wait_for_timeout(800)
            raw = page.evaluate(spec["read_js"])
    except Exception as e:
        print(json.dumps({"ok": False, "data": None, "error": str(e)[:600], "wall_s": round(time.time() - t0, 1), "meta": meta}))
        return
    wall = round(time.time() - t0, 1)
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        print(json.dumps({"ok": False, "data": None, "error": "read returned non-JSON", "wall_s": wall, "meta": meta}))
        return
    print(json.dumps({"ok": True, "data": data, "error": None, "wall_s": wall, "meta": meta}))


if __name__ == "__main__":
    main()
