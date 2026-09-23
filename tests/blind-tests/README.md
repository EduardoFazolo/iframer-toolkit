# blind-tests: iframer vs camoufox, bot detection

Same machine, same network, same minute, same pages. Each engine is driven only through
what a user gets: iframer through `iframer execute --json`, camoufox through its Python API,
camofox-browser (the backend Hermes Agent ships) through its REST API. No repo internals.

## What is measured

- Does the page call us a bot? (8 public detector pages, each with its own verdict)
- Do we get through a real WAF challenge? (2 purpose-built Cloudflare pages)
- Do we get the real homepage or a wall? (7 production sites behind Akamai, HUMAN, DataDome, Cloudflare, Imperva)
- What does the browser admit about itself? (one JS probe on example.com: UA, platform, GPU, screen, client hints)

Every (engine, page) pair runs 3 times, fresh browser and fresh cookies each time,
interleaved so no engine gets a quieter minute than another.

## Engines

| config | what it is |
|---|---|
| `iframer-auto` | `iframer execute` with no `--mode`, whatever iframer picks |
| `iframer-headless` | `--mode headless` |
| `iframer-headful` | `--mode binary-headful` (real Chrome for Testing window) |
| `camoufox-headless` | `Camoufox(headless=True)`, default fingerprint rotation |
| `camoufox-headed` | `Camoufox(headless=False)` |
| `camofox-hermes` | jo-inc/camofox-browser REST server, headless, default config |

## Run

```bash
cd tests/blind-tests
uv venv .venv -p 3.13 && . .venv/bin/activate
uv pip install "camoufox[geoip]" playwright && python -m camoufox fetch

python bench.py --runs 3                       # everything, ~1h
python bench.py --configs camoufox-headless --targets sannysoft,creepjs --runs 1
python bench.py --resume                       # skip what's already in results/results.jsonl
python report.py                               # -> results/report.html
```

For `camofox-hermes`: `npm i @askjo/camofox-browser` somewhere, start `node .../server.js`
with `CAMOUFOX_INSTALL_DIR` pointed at its own cache (its postinstall wipes
`~/Library/Caches/camoufox`, which is also where the Python package keeps its binary).

## Files

- `targets.py`: the pages, wait times, and the verdict parser for each
- `probe.py`: the self-report JS and its consistency checks
- `engines.py`: the three adapters
- `bench.py`: orchestrator, writes `results/results.jsonl` (full page text kept, so re-grading is possible without re-running)
- `report.py`: builds the HTML report from the jsonl
