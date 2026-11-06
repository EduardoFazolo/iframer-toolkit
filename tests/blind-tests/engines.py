"""Engine adapters. Each returns the same shape:

{ ok, data: {title,url,text[,probe]}, error, wall_s, meta }

iframer is driven only through its public CLI (`iframer execute --json`),
camoufox only through its public Python API. No repo internals on either side.
"""
import json
import os
import subprocess
import time
import urllib.request

from targets import READ_JS

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "results", "shots")
os.makedirs(SHOTS, exist_ok=True)


def _shot_name(engine, target_id, run):
    return os.path.join(SHOTS, f"{engine}__{target_id}__{run}.jpg")


# --------------------------------------------------------------------------- iframer
def _sess(cmd, to):
    try:
        subprocess.run(["iframer", "session", cmd], capture_output=True, timeout=to)
        return True
    except subprocess.TimeoutExpired:
        return False


def run_iframer(target, mode, run, read_js=READ_JS, timeout_s=150):
    """mode: None (auto-escalate), 'headless', 'binary-headful'."""
    steps = [{"type": "navigate", "url": target["url"]}, {"type": "wait", "ms": target["wait"]}]
    for js in target.get("triggers", []):
        steps.append({"type": "evaluate", "expression": js})
        steps.append({"type": "wait", "ms": 800})
    steps.append({"type": "evaluate", "expression": read_js})
    cmd = ["iframer", "execute", json.dumps(steps), "--json", "--timeout", "60000"]
    if mode:
        cmd += ["--mode", mode]
    # fresh browser + fresh cookies every run: no warm instance from the previous config,
    # no cf_clearance carried from run 1 to run 2. (Same cold start camoufox pays.)
    meta0 = {}
    if not _sess("stop", 45):
        meta0["reset"] = "session stop hung"
    _sess("clear", 30)
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    except subprocess.TimeoutExpired:
        return {"ok": False, "data": None, "error": f"CLI timeout {timeout_s}s", "wall_s": round(time.time() - t0, 1), "meta": meta0}
    wall = round(time.time() - t0, 1)
    out = p.stdout.strip()
    try:
        j = json.loads(out[out.index("{"):])
    except Exception:
        return {"ok": False, "data": None, "error": (p.stderr or out)[-600:], "wall_s": wall, "meta": {}}
    meta = dict(meta0, modeUsed=j.get("modeUsed"), obstacles=j.get("obstacles"), completed=f"{j.get('completedSteps')}/{j.get('totalSteps')}")
    shot = (j.get("finalState") or {}).get("screenshotUrl")
    if shot:
        try:
            dst = _shot_name(f"iframer-{mode or 'auto'}", target["id"], run)
            if shot.startswith("http"):
                urllib.request.urlretrieve(shot, dst)
            elif shot.startswith("file://"):
                import shutil
                shutil.copy(shot[7:], dst)
            meta["shot"] = os.path.relpath(dst, HERE)
        except Exception as e:
            meta["shot_err"] = str(e)[:100]
    last = (j.get("results") or [])[-1] if j.get("results") else {}
    if not j.get("ok") or last.get("step", {}).get("type") != "evaluate" or "result" not in last:
        err = last.get("error") or j.get("error") or "pipeline did not reach the read step"
        return {"ok": False, "data": None, "error": str(err)[:600], "wall_s": wall, "meta": meta}
    try:
        data = json.loads(last["result"]) if isinstance(last["result"], str) else last["result"]
    except Exception:
        return {"ok": False, "data": None, "error": "read step returned non-JSON", "wall_s": wall, "meta": meta}
    return {"ok": True, "data": data, "error": None, "wall_s": wall, "meta": meta}


# --------------------------------------------------------------------------- camoufox
def run_camoufox(target, headless, run, read_js=READ_JS, **launch_kw):
    from camoufox.sync_api import Camoufox

    t0 = time.time()
    meta = {"headless": headless}
    try:
        with Camoufox(headless=headless, **launch_kw) as browser:
            page = browser.new_page()
            page.goto(target["url"], timeout=60000, wait_until="domcontentloaded")
            page.wait_for_timeout(target["wait"])
            for js in target.get("triggers", []):
                try:
                    page.evaluate(js)
                except Exception as e:
                    meta.setdefault("trigger_err", []).append(str(e)[:80])
                page.wait_for_timeout(800)
            raw = page.evaluate(read_js)
            try:
                dst = _shot_name(f"camoufox-{'headless' if headless else 'headed'}", target["id"], run)
                page.screenshot(path=dst, type="jpeg", quality=60)
                meta["shot"] = os.path.relpath(dst, HERE)
            except Exception as e:
                meta["shot_err"] = str(e)[:100]
    except Exception as e:
        return {"ok": False, "data": None, "error": str(e)[:600], "wall_s": round(time.time() - t0, 1), "meta": meta}
    wall = round(time.time() - t0, 1)
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return {"ok": False, "data": None, "error": "read returned non-JSON", "wall_s": wall, "meta": meta}
    return {"ok": True, "data": data, "error": None, "wall_s": wall, "meta": meta}


# --------------------------------------------------------------------------- camofox-browser (what Hermes ships)
# jo-inc/camofox-browser: REST wrapper around camoufox, headless by default. This is the exact
# backend Hermes Agent routes its browser tools through when CAMOFOX_URL is set.
CAMOFOX_URL = os.environ.get("CAMOFOX_URL", "http://localhost:9377")


def _http(method, path, body=None, timeout=90, base=None):
    import urllib.error
    req = urllib.request.Request((base or CAMOFOX_URL) + path, method=method, headers={"Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def run_camofox(target, run, read_js=READ_JS, base=None):
    user = f"bench-{target['id']}-{run}-{int(time.time())}"  # fresh profile every run
    t0 = time.time()
    meta = {"backend": "camofox-browser", "base": base or CAMOFOX_URL}
    H = lambda m, p, b=None, timeout=90: _http(m, p, b, timeout, base)
    tab = None
    try:
        created = H("POST", "/tabs", {"userId": user, "sessionKey": "bench", "url": target["url"]}, timeout=120)
        tab = created.get("tabId") or created.get("id") or (created.get("tab") or {}).get("id")
        if not tab:
            raise RuntimeError(f"no tabId in {json.dumps(created)[:200]}")
        time.sleep(target["wait"] / 1000)
        for js in target.get("triggers", []):
            try:
                H("POST", f"/tabs/{tab}/evaluate", {"userId": user, "expression": js})
            except Exception as e:
                meta.setdefault("trigger_err", []).append(str(e)[:80])
            time.sleep(0.8)
        raw = H("POST", f"/tabs/{tab}/evaluate", {"userId": user, "expression": read_js}).get("result")
    except Exception as e:
        try:
            H("DELETE", f"/sessions/{user}")
        except Exception:
            pass
        return {"ok": False, "data": None, "error": str(e)[:600], "wall_s": round(time.time() - t0, 1), "meta": meta}
    try:
        H("DELETE", f"/sessions/{user}")
    except Exception:
        pass
    wall = round(time.time() - t0, 1)
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return {"ok": False, "data": None, "error": "read returned non-JSON", "wall_s": wall, "meta": meta}
    return {"ok": True, "data": data, "error": None, "wall_s": wall, "meta": meta}


# --------------------------------------------------------------------------- camoufox in a Linux container
CAMOUFOX_CONTAINER = os.environ.get("BENCH_CAMOUFOX_CONTAINER", "benchmark-iframer-camoufox")


def run_camoufox_docker(target, headless, run, read_js=READ_JS):
    spec = {"url": target["url"], "wait": target["wait"], "triggers": target.get("triggers", []), "read_js": read_js, "headless": headless}
    t0 = time.time()
    try:
        p = subprocess.run(["docker", "exec", CAMOUFOX_CONTAINER, "python", "camoufox_worker.py", json.dumps(spec)],
                           capture_output=True, text=True, timeout=200)
    except subprocess.TimeoutExpired:
        return {"ok": False, "data": None, "error": "docker exec timeout", "wall_s": round(time.time() - t0, 1), "meta": {"headless": headless, "where": "docker"}}
    out = p.stdout.strip().splitlines()
    try:
        return json.loads(out[-1])
    except Exception:
        return {"ok": False, "data": None, "error": (p.stderr or p.stdout)[-600:], "wall_s": round(time.time() - t0, 1), "meta": {"headless": headless, "where": "docker"}}


CONFIGS = {
    "camoufox-docker-headless": lambda t, r, js: run_camoufox_docker(t, True, r, js),
    "camoufox-docker-virtual":  lambda t, r, js: run_camoufox_docker(t, "virtual", r, js),
    "camofox-docker":  lambda t, r, js: run_camofox(t, r, js, base=os.environ.get("BENCH_CAMOFOX_DOCKER_URL", "http://localhost:9378")),
    "camofox-hermes":   lambda t, r, js: run_camofox(t, r, js),
    "iframer-auto":     lambda t, r, js: run_iframer(t, None, r, js),
    "iframer-headless": lambda t, r, js: run_iframer(t, "headless", r, js),
    "iframer-headful":  lambda t, r, js: run_iframer(t, "binary-headful", r, js),
    "camoufox-headless": lambda t, r, js: run_camoufox(t, True, r, js),
    "camoufox-headed":   lambda t, r, js: run_camoufox(t, False, r, js),
}
