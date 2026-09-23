"""Orchestrator. Usage:

  python bench.py --runs 3                      # everything
  python bench.py --configs camoufox-headless --targets sannysoft,creepjs --runs 1
  python bench.py --resume                      # skip (config,target,run) already in results.jsonl

Writes results/results.jsonl (one line per run, full page text kept for re-grading)
and results/summary.json (verdict grid).
"""
import argparse
import json
import os
import sys
import time
import traceback

from engines import CONFIGS
from probe import PROBE_JS, PROBE_URL, parse_probe
from targets import READ_JS, TARGETS

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
os.makedirs(RES, exist_ok=True)
JSONL = os.path.join(RES, os.environ.get("BENCH_OUT", "results.jsonl"))

PROBE_TARGET = dict(id="probe", group="probe", url=PROBE_URL, wait=1500, parser=parse_probe,
                    label="self-report probe", what="UA/platform/GPU/screen consistency on example.com")


def load_done():
    done = set()
    if os.path.exists(JSONL):
        for ln in open(JSONL):
            try:
                r = json.loads(ln)
                done.add((r["config"], r["target"], r["run"]))
            except Exception:
                pass
    return done


def one(config, target, run):
    js = PROBE_JS if target["id"] == "probe" else READ_JS
    t0 = time.time()
    try:
        res = CONFIGS[config](target, run, js)
    except Exception as e:
        res = {"ok": False, "data": None, "error": f"harness: {e}\n{traceback.format_exc()[-400:]}", "wall_s": round(time.time() - t0, 1), "meta": {}}
    if res["ok"]:
        try:
            verdict = target["parser"](res["data"])
        except Exception as e:
            verdict = {"verdict": "unknown", "score": None, "detail": f"parser crashed: {e}"}
    else:
        verdict = {"verdict": "unknown", "score": None, "detail": f"engine error: {res['error'][:200]}"}
    row = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "config": config, "target": target["id"], "group": target["group"], "run": run,
        "verdict": verdict["verdict"], "score": verdict.get("score"), "detail": verdict.get("detail"),
        "wall_s": res["wall_s"], "ok": res["ok"], "error": res["error"], "meta": res["meta"],
        "title": (res["data"] or {}).get("title"), "final_url": (res["data"] or {}).get("url"),
        "text": (res["data"] or {}).get("text", "")[:30000], "probe": (res["data"] or {}).get("probe") or verdict.get("probe"),
    }
    with open(JSONL, "a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"[{row['ts']}] {config:18s} {target['id']:14s} r{run} -> {row['verdict']:8s} {row['wall_s']:6.1f}s  {str(row['detail'])[:110]}", flush=True)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--configs", default=",".join(CONFIGS))
    ap.add_argument("--targets", default="probe," + ",".join(t["id"] for t in TARGETS))
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--out", default=None, help="results file name inside results/ (default results.jsonl); set before import via BENCH_OUT")
    a = ap.parse_args()
    configs = [c for c in a.configs.split(",") if c]
    ids = [t for t in a.targets.split(",") if t]
    all_t = {t["id"]: t for t in TARGETS}
    all_t["probe"] = PROBE_TARGET
    targets = [all_t[i] for i in ids]
    done = load_done() if a.resume else set()
    # interleave configs per target so clock drift / site mood hits everyone equally
    for run in range(1, a.runs + 1):
        for t in targets:
            for c in configs:
                if (c, t["id"], run) in done:
                    continue
                one(c, t, run)
    summarize()


def summarize():
    rows = [json.loads(l) for l in open(JSONL)] if os.path.exists(JSONL) else []
    grid = {}
    for r in rows:
        g = grid.setdefault(r["target"], {}).setdefault(r["config"], {"pass": 0, "fail": 0, "partial": 0, "unknown": 0, "wall": [], "details": []})
        g[r["verdict"]] += 1
        g["wall"].append(r["wall_s"])
        g["details"].append(r["detail"])
    json.dump(grid, open(os.path.join(RES, "summary.json"), "w"), indent=1, ensure_ascii=False)
    print("\nsummary -> results/summary.json")


if __name__ == "__main__":
    main()
