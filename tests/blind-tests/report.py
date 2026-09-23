"""Build results/report.html from results/results.jsonl.

The numbers come from the jsonl. The short narrative at the top is hand-written in
NARRATIVE below after reading the numbers; edit it there, re-run this.
"""
import json
import os
import statistics
from collections import defaultdict

from targets import TARGETS

HERE = os.path.dirname(os.path.abspath(__file__))
JSONL = os.path.join(HERE, "results", "results.jsonl")
OUT = os.path.join(HERE, "results", "report.html")

CONFIG_ORDER = ["iframer-auto", "iframer-headless", "iframer-headful", "camoufox-headless", "camoufox-headed", "camofox-hermes",
                "iframer-docker-auto", "iframer-docker-headless", "iframer-docker-headful", "camoufox-docker-headless", "camoufox-docker-virtual", "camofox-docker"]
CONFIG_LABEL = {
    "iframer-auto": "iframer auto", "iframer-headless": "iframer headless", "iframer-headful": "iframer headful",
    "camoufox-headless": "camoufox headless", "camoufox-headed": "camoufox headed", "camofox-hermes": "camofox (Hermes)",
    "iframer-docker-auto": "iframer auto", "iframer-docker-headless": "iframer headless", "iframer-docker-headful": "iframer headful (Xvfb)",
    "camoufox-docker-headless": "camoufox headless", "camoufox-docker-virtual": "camoufox virtual (Xvfb)", "camofox-docker": "camofox (Hermes)",
}
# which home-IP config a docker config compares to, for the delta column
DOCKER_TWIN = {"iframer-docker-auto": "iframer-auto", "iframer-docker-headless": "iframer-headless", "iframer-docker-headful": "iframer-headful",
               "camoufox-docker-headless": "camoufox-headless", "camoufox-docker-virtual": "camoufox-headed", "camofox-docker": "camofox-hermes"}
GROUP_LABEL = {"probe": "Self-report probe", "detector": "Public bot detectors", "waf": "Cloudflare challenge pages", "real": "Production sites behind a WAF"}
GROUP_ORDER = ["detector", "waf", "real", "probe"]

NARRATIVE = json.load(open(os.path.join(HERE, "narrative.json"))) if os.path.exists(os.path.join(HERE, "narrative.json")) else {}


def load(path=JSONL):
    rows = [json.loads(l) for l in open(path)]
    # last write wins per (config,target,run)
    from targets import TARGETS_BY_ID
    from probe import parse_probe
    d = {}
    for r in rows:
        # re-grade every stored row with the current parsers, so a parser fix applies to old sittings too
        if r.get("ok") and r["verdict"] != "unknown" or (r.get("ok") and r.get("text")):
            parser = parse_probe if r["target"] == "probe" else TARGETS_BY_ID.get(r["target"], {}).get("parser")
            if parser:
                try:
                    v = parser({"title": r.get("title") or "", "text": r.get("text") or "", "url": r.get("final_url"), "probe": r.get("probe")})
                    r["verdict"], r["score"], r["detail"] = v["verdict"], v.get("score"), v.get("detail")
                except Exception:
                    pass
        # iframer refuses to run the read step when it decides the page is a bot wall and
        # returns errorType 'bot-blocked'. That is a verdict, not a harness failure: blocked.
        if r["verdict"] == "unknown" and r.get("error") and "'bot-blocked'" in r["error"]:
            msg = r["error"].split("'message': '")[1].split("'")[0] if "'message': '" in r["error"] else "bot-blocked"
            r["verdict"], r["score"], r["detail"] = "fail", 1, f"iframer itself reports: {msg}, all modes exhausted"
        # g2.com: headed runs got the real homepage, headless runs on both engines got a blank
        # document titled "g2.com" for the full 12s wait. That blank page is the Cloudflare
        # interstitial that never resolved, so it is graded as a wall, not as "unknown".
        if r["target"] == "g2" and r["verdict"] == "unknown" and "near-empty page (0 chars)" in (r.get("detail") or ""):
            r["verdict"], r["score"], r["detail"] = "fail", 1, "blank interstitial for 12s, title 'g2.com', no content ever rendered"
        if r["target"] == "pixelscan":
            continue  # verdict is not in the DOM text, page not gradeable this way
        if r["target"] == "leboncoin":
            continue  # CloudFront 403 for every engine, every run: geo-block from Brazil, says nothing about DataDome
        d[(r["config"], r["target"], r["run"])] = r
    return list(d.values())


def cells_and_score(rows, configs, groups):
    cells = defaultdict(list)
    for r in rows:
        cells[(r["target"], r["config"])].append({
            "run": r["run"], "verdict": r["verdict"], "detail": r["detail"], "wall": r["wall_s"],
            "mode": (r.get("meta") or {}).get("modeUsed"), "title": r.get("title"), "probe": r.get("probe"),
        })
    for v in cells.values():
        v.sort(key=lambda x: x["run"])
    score = {}
    for c in configs:
        for g in groups + ["all"]:
            rs = [r for r in rows if r["config"] == c and (g == "all" or r["group"] == g) and r["group"] != "probe"] if g != "probe" else [r for r in rows if r["config"] == c and r["group"] == "probe"]
            known = [r for r in rs if r["verdict"] != "unknown"]
            score[f"{c}|{g}"] = {
                "pass": sum(r["verdict"] == "pass" for r in known), "partial": sum(r["verdict"] == "partial" for r in known),
                "fail": sum(r["verdict"] == "fail" for r in known), "unknown": len(rs) - len(known), "n": len(rs),
                "wall": round(statistics.median([r["wall_s"] for r in rs]), 1) if rs else None,
            }
    return {f"{t}|{c}": v for (t, c), v in cells.items()}, score


def build():
    rows = load()
    targets = [dict(id="probe", group="probe", label="self-report probe", what="UA / platform / GPU / screen consistency on example.com", url="https://example.com/")] + \
              [{k: t[k] for k in ("id", "group", "label", "what", "url")} for t in TARGETS if t["id"] not in ("pixelscan", "leboncoin")]
    configs = [c for c in CONFIG_ORDER if any(r["config"] == c for r in rows)]
    cells, score = cells_and_score(rows, configs, GROUP_ORDER)
    data = {"targets": targets, "configs": configs, "labels": CONFIG_LABEL, "groups": GROUP_LABEL, "groupOrder": GROUP_ORDER,
            "cells": cells, "score": score, "narrative": NARRATIVE, "dockerTwin": DOCKER_TWIN,
            "runs": max(r["run"] for r in rows), "generated": max(r["ts"] for r in rows)}
    # optional second sitting: same production sites, VPN on
    import glob
    vpn_files = sorted(glob.glob(os.path.join(HERE, "results", "vpn-*.jsonl")))
    if vpn_files:
        vrows = load(vpn_files[-1])
        vconfigs = [c for c in CONFIG_ORDER if any(r["config"] == c for r in vrows)]
        vcells, vscore = cells_and_score(vrows, vconfigs, ["real"])
        data["vpn"] = {"configs": vconfigs, "cells": vcells, "score": vscore, "runs": max(r["run"] for r in vrows),
                       "generated": max(r["ts"] for r in vrows), "narrative": NARRATIVE.get("vpn", {})}
    # optional third sitting: everything again, but every engine inside a Linux container
    dk_files = sorted(glob.glob(os.path.join(HERE, "results", "docker-*.jsonl")))
    if dk_files:
        drows = load(dk_files[-1])
        dconfigs = [c for c in CONFIG_ORDER if any(r["config"] == c for r in drows)]
        dcells, dscore = cells_and_score(drows, dconfigs, GROUP_ORDER)
        data["docker"] = {"configs": dconfigs, "cells": dcells, "score": dscore, "runs": max(r["run"] for r in drows),
                          "generated": max(r["ts"] for r in drows), "narrative": NARRATIVE.get("docker", {})}
    html = open(os.path.join(HERE, "report_template.html")).read().replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False))
    open(OUT, "w").write(html)
    print("wrote", OUT, len(html) // 1024, "KB")


if __name__ == "__main__":
    build()
