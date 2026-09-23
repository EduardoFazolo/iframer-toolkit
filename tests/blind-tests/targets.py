"""Detection targets and verdict parsers.

Every target is: navigate -> wait -> (optional trigger JS) -> read title/url/body text.
The parser gets that text and returns a verdict dict. Same parser for every engine,
so the engine can't influence how it's graded.

verdict: "pass"    = site says human / not blocked
         "fail"    = site says bot / blocked
         "partial" = site flags something but doesn't call it a bot
         "unknown" = couldn't parse (page didn't load, timeout, etc.)
"""
import json
import re

READ_JS = "JSON.stringify({title: document.title, url: location.href, text: document.body.innerText.slice(0, 30000)})"

BLOCK_MARKERS = [
    "just a moment", "access denied", "press & hold", "press and hold", "robot or human",
    "pardon our interruption", "pardon the interruption", "verify you are human",
    "additional verification required", "type the characters you see", "captcha-delivery",
    "px-captcha", "datadome", "unusual traffic", "request unsuccessful", "are you a human",
    "checking your browser", "browsing activity has been paused", "enable javascript and cookies",
    "attention required", "please verify you are a human", "confirmer que vous n", "sorry, you have been blocked",
    "human verification",
]


def _lower(d):
    return (d.get("title", "") + "\n" + d.get("text", "")).lower()


def parse_sannysoft(d):
    t = d["text"]
    if "Test Name" not in t:
        return {"verdict": "unknown", "score": None, "detail": "page not rendered"}
    lines = t.splitlines()
    is_firefox = "Firefox/" in t[:3000]
    fails = []
    for i, ln in enumerate(lines):
        if not re.search(r"\bFAIL\b|\(failed\)|\bfailed\b", ln):
            continue
        # test name sits on this line, or 1-2 lines up past the "(New)/(Old)" tag
        name = ln.split("\t")[0].strip()
        j = i
        while (not name or name.startswith("(") or "failed" in name.lower()) and j > 0:
            j -= 1
            name = lines[j].strip()
        if is_firefox and name == "Chrome":
            continue  # sannysoft asks "is window.chrome there?", a Firefox UA is expected to say no
        fails.append(f"{name}: {ln.strip()}"[:60])
    return {"verdict": "pass" if not fails else "fail", "score": len(fails), "detail": "; ".join(fails)[:300] or "0 fails"}


def parse_rebrowser(d):
    t = d["text"]
    red = t.count("🔴")
    green = t.count("🟢")
    if green + red == 0:
        return {"verdict": "unknown", "score": None, "detail": "no results rendered"}
    failed = [ln.strip()[:60] for ln in t.splitlines() if ln.strip().startswith("🔴")]
    return {"verdict": "pass" if red == 0 else "fail", "score": red, "detail": "; ".join(failed) or f"{green} green, 0 red"}


def parse_creepjs(d):
    t = d["text"]
    m1 = re.search(r"(\d+)% like headless", t)
    m2 = re.search(r"(\d+)% headless", t)
    m3 = re.search(r"(\d+)% stealth", t)
    chrom = re.search(r"chromium: (true|false)", t)
    lies = re.search(r"\((\d+)\) lies|lies \((\d+)\)|(\d+) lies", t)
    if not (m1 and m2 and m3):
        return {"verdict": "unknown", "score": None, "detail": "creepjs did not finish"}
    like, headless, stealth = int(m1.group(1)), int(m2.group(1)), int(m3.group(1))
    lie_n = None
    if lies:
        lie_n = int(next(g for g in lies.groups() if g))
    if headless > 0 or stealth > 0:
        v = "fail"
    elif like >= 30 or (lie_n or 0) > 0:
        v = "partial"
    else:
        v = "pass"
    return {"verdict": v, "score": headless + stealth, "detail": f"like-headless {like}%, headless {headless}%, stealth {stealth}%, chromium={chrom.group(1) if chrom else '?'}, lies={lie_n}"}


def parse_browserscan(d):
    t = d["text"]
    m = re.search(r"Test Results:\s*\n\s*(\w+)", t)
    if not m:
        return {"verdict": "unknown", "score": None, "detail": "no Test Results block"}
    res = m.group(1)
    # count every non-Normal check line
    flagged = []
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    for i, ln in enumerate(lines[:-1]):
        if lines[i + 1] in ("Abnormal", "Suspicious", "Detected", "Robot", "Bot") and ln not in ("Test Results:",):
            flagged.append(ln)
    v = "pass" if res.lower() == "normal" else "fail"
    return {"verdict": v, "score": len(flagged), "detail": f"{res}; flagged: {', '.join(flagged) or 'none'}"}


def parse_dbi(d):
    t = d["text"]
    m = re.search(r'\{\s*"isBot":.*?\n\}', t, re.S)
    if not m:
        return {"verdict": "unknown", "score": None, "detail": "no JSON"}
    try:
        j = json.loads(m.group(0))
    except Exception:
        return {"verdict": "unknown", "score": None, "detail": "bad JSON"}
    trues = [k for k, v in j.get("details", {}).items() if v is True]
    return {"verdict": "fail" if j.get("isBot") else "pass", "score": len(trues), "detail": ", ".join(trues) or "no signals"}


def parse_fingerprintcom(d):
    t = d["text"]
    m = re.search(r'"bot":\s*"(\w+)"', t)
    if not m:
        return {"verdict": "unknown", "score": None, "detail": "no bot field"}
    b = m.group(1)
    return {"verdict": "pass" if b == "not_detected" else "fail", "score": 0 if b == "not_detected" else 1, "detail": f"bot={b}"}


def parse_incolumitas(d):
    t = d["text"]
    m = re.search(r"\{\s*\"[a-zA-Z_]+\":.*?\n\}", t, re.S)
    if not m:
        return {"verdict": "unknown", "score": None, "detail": "no detection JSON"}
    try:
        j = json.loads(m.group(0))
    except Exception:
        return {"verdict": "unknown", "score": None, "detail": "bad JSON"}
    bad = [k for k, v in j.items() if v is True or (isinstance(v, str) and v.lower() in ("failed", "fail", "true"))]
    return {"verdict": "pass" if not bad else "fail", "score": len(bad), "detail": ", ".join(bad) or "all clear"}


def parse_pixelscan(d):
    lo = _lower(d)
    if "inconsistent" in lo or "masking" in lo or "automation framework detected" in lo or "you are a bot" in lo:
        return {"verdict": "fail", "score": 1, "detail": "pixelscan flags inconsistency/automation"}
    if "consistent" in lo or "no automation" in lo:
        return {"verdict": "pass", "score": 0, "detail": "consistent"}
    return {"verdict": "unknown", "score": None, "detail": "no verdict text"}


def parse_blockpage(d):
    """Generic real-site parser: did we get the real page, or a wall?"""
    lo = _lower(d)
    title = d.get("title", "")
    hits = [m for m in BLOCK_MARKERS if m in lo[:4000] or m in title.lower()]
    if title.lower().startswith("blocked") or title.lower().startswith("access denied"):
        hits.insert(0, f"title: {title[:40]}")
    text_len = len(d.get("text", ""))
    if hits:
        return {"verdict": "fail", "score": 1, "detail": f"wall: {hits[0]!r}, title={title[:60]!r}"}
    if text_len < 300:
        return {"verdict": "unknown", "score": None, "detail": f"near-empty page ({text_len} chars), title={title[:60]!r}"}
    return {"verdict": "pass", "score": 0, "detail": f"content loaded ({text_len} chars), title={title[:60]!r}"}


def parse_scrapingcourse(d):
    lo = _lower(d)
    if "just a moment" in lo or "verify you are human" in lo or "checking" in lo[:500]:
        return {"verdict": "fail", "score": 1, "detail": "stuck on challenge"}
    if "bypass" in lo or "product" in lo or "congrat" in lo or "you passed" in lo:
        return {"verdict": "pass", "score": 0, "detail": "challenge passed"}
    return parse_blockpage(d)


# Trigger JS run *before* reading, for tests that need the automation to poke the page.
REBROWSER_TRIGGERS = [
    "window.dummyFn && window.dummyFn()",
    "document.getElementById('detections-json') && 1",
    "document.getElementsByClassName('div') && 1",
]

TARGETS = [
    # --- fingerprint / automation detectors (say bot or not) ---
    dict(id="sannysoft", group="detector", url="https://bot.sannysoft.com/", wait=4000, parser=parse_sannysoft,
         label="bot.sannysoft.com", what="classic headless/webdriver signal table"),
    dict(id="rebrowser", group="detector", url="https://bot-detector.rebrowser.net/", wait=3000, parser=parse_rebrowser,
         triggers=REBROWSER_TRIGGERS, label="rebrowser bot-detector", what="CDP / Playwright leak tests"),
    dict(id="creepjs", group="detector", url="https://abrahamjuliot.github.io/creepjs/", wait=18000, parser=parse_creepjs,
         label="CreepJS", what="deep fingerprint consistency + headless/stealth %"),
    dict(id="browserscan", group="detector", url="https://www.browserscan.net/bot-detection", wait=8000, parser=parse_browserscan,
         label="BrowserScan bot-detection", what="webdriver/CDP/navigator checks"),
    dict(id="dbi", group="detector", url="https://deviceandbrowserinfo.com/are_you_a_bot", wait=6000, parser=parse_dbi,
         label="deviceandbrowserinfo.com", what="22 fingerprint-only bot signals"),
    dict(id="fingerprintcom", group="detector", url="https://fingerprint.com/products/bot-detection/", wait=9000, parser=parse_fingerprintcom,
         label="Fingerprint.com BotD", what="commercial bot detection demo"),
    dict(id="incolumitas", group="detector", url="https://bot.incolumitas.com/", wait=8000, parser=parse_incolumitas,
         label="bot.incolumitas.com", what="behavioral + fingerprint test suite"),
    dict(id="pixelscan", group="detector", url="https://pixelscan.net/", wait=12000, parser=parse_pixelscan,
         label="Pixelscan", what="fingerprint consistency (IP vs browser)"),
    # --- purpose-built WAF challenge pages ---
    dict(id="sc-cloudflare", group="waf", url="https://www.scrapingcourse.com/cloudflare-challenge", wait=15000, parser=parse_scrapingcourse,
         label="ScrapingCourse: Cloudflare challenge", what="real Cloudflare managed challenge"),
    dict(id="sc-antibot", group="waf", url="https://www.scrapingcourse.com/antibot-challenge", wait=15000, parser=parse_scrapingcourse,
         label="ScrapingCourse: antibot challenge", what="real Cloudflare Turnstile"),
    # --- real production sites behind big WAFs, homepage only, read-only ---
    dict(id="nike", group="real", url="https://www.nike.com/", wait=8000, parser=parse_blockpage,
         label="nike.com", what="Akamai Bot Manager"),
    dict(id="zillow", group="real", url="https://www.zillow.com/", wait=8000, parser=parse_blockpage,
         label="zillow.com", what="HUMAN (PerimeterX)"),
    dict(id="walmart", group="real", url="https://www.walmart.com/", wait=8000, parser=parse_blockpage,
         label="walmart.com", what="HUMAN + Akamai"),
    dict(id="leboncoin", group="real", url="https://www.leboncoin.fr/", wait=8000, parser=parse_blockpage,
         label="leboncoin.fr", what="DataDome"),
    dict(id="g2", group="real", url="https://www.g2.com/", wait=12000, parser=parse_blockpage,
         label="g2.com", what="Cloudflare (strict)"),
    dict(id="ticketmaster", group="real", url="https://www.ticketmaster.com/", wait=10000, parser=parse_blockpage,
         label="ticketmaster.com", what="Imperva / custom"),
    dict(id="indeed", group="real", url="https://www.indeed.com/", wait=10000, parser=parse_blockpage,
         label="indeed.com", what="Cloudflare Turnstile"),
]

TARGETS_BY_ID = {t["id"]: t for t in TARGETS}
