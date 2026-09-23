# Stealth test protocol

How iframer's bot-detection posture is measured, before and after any stealth change.
Baseline: `results/baseline-2026-09-17.jsonl` (iframer 0.10.6, camoufox 0.5.6 / Firefox 152).
A change is only "done" when a full run of this protocol beats the baseline on the numbers in section 7.

## 1. Ground rules

- One machine, one IP, one sitting. All configs interleaved per page (config A, B, C on page 1, then A, B, C on page 2). A site's mood hits everyone equally.
- Fresh browser and fresh cookies before every load. iframer: `session stop` + `session clear`. Camoufox: new launch. camofox-browser: new `userId`.
- Every engine driven only through its public surface: `iframer execute --json`, camoufox Python API, camofox REST. No repo internals, no special flags a user wouldn't have.
- Same read JS on every engine (`targets.READ_JS`), same parser per page. Parsers never look at which engine produced the text.
- 3 runs per (config, page) minimum. 3 runs answers "always / sometimes / never", not a rate. Use 5 when two configs are within 2 loads of each other.
- No proxies. IP reputation is a fixed variable in this protocol, not a tested one. Note the country in the run header.
- Record everything: full page text, title, final URL, wall time, iframer `modeUsed`, obstacles. Re-grading must be possible without re-running.

## 2. Configs

Baseline set (all exist in `engines.py`):

| config | meaning |
|---|---|
| `iframer-auto` | product default: no `--mode`, picks, escalates, remembers per domain |
| `iframer-headless` | forced headless |
| `iframer-headful` | forced binary-headful (Chrome for Testing window) |
| `camoufox-headless` | `Camoufox(headless=True)`, defaults |
| `camoufox-headed` | `Camoufox(headless=False)` |
| `camofox-hermes` | jo-inc/camofox-browser REST, headless, defaults |

To add before the post-fix run:

| config | meaning | why |
|---|---|---|
| `iframer-hidden` | headful Chrome with the window off-screen / minimized | candidate new tier 1 on desktops |
| `iframer-chrome` | headful using the user's installed Google Chrome (`channel: chrome`) | removes the "Chrome for Testing" brand tell |
| `iframer-docker` | iframer running inside the docker image (Xvfb, Linux) | the environment where "declare the truth" hurts most; currently blank |
| `camoufox-virtual` | `Camoufox(headless="virtual")` on Linux | camoufox's recommended server mode, only fair comparison for `iframer-docker` |
| `iframer-extension` | real user Chrome tab via the extension | upper bound: a real browser, real profile |

`iframer-auto` stays in every run. It's the only row that measures the product as shipped, escalation and domain memory included. Report which mode it landed on per run.

## 3. Environments

Run the full matrix on each, separately, never mixed in one results file:

1. macOS desktop with display (baseline environment).
2. Linux host with Xvfb available, no real display (the Hermes case).
3. Docker, the iframer image, from a home IP.

Docker from a datacenter IP is a fourth environment, only if there's a reason to care. Datacenter IP results say more about the IP than about the browser.

## 4. Pages

### 4a. Fingerprint detectors (load, wait, read)

| id | page | grades on |
|---|---|---|
| probe | example.com + our JS | contradictions between declared values (UA vs platform vs client hints vs GPU vs screen) |
| sannysoft | bot.sannysoft.com | classic headless / webdriver table |
| rebrowser | bot-detector.rebrowser.net | Playwright / CDP leaks, viewport, UA brand |
| creepjs | abrahamjuliot.github.io/creepjs | like-headless %, headless %, stealth %, lies |
| browserscan | browserscan.net/bot-detection | Normal / Robot |
| dbi | deviceandbrowserinfo.com/are_you_a_bot | 22 boolean signals |
| fingerprintcom | fingerprint.com/products/bot-detection | commercial BotD verdict |
| incolumitas | bot.incolumitas.com | static detection JSON |

Dropped: pixelscan (verdict not in DOM text), areyouheadless (502). Re-check both each run; put back if fixed.

### 4b. Cloudflare challenge pages

| id | page |
|---|---|
| sc-cloudflare | scrapingcourse.com/cloudflare-challenge |
| sc-antibot | scrapingcourse.com/antibot-challenge (Turnstile) |

### 4c. Production sites (homepage, read-only)

| id | vendor |
|---|---|
| nike | Akamai |
| zillow | HUMAN / PerimeterX |
| walmart | HUMAN + Akamai |
| g2 | Cloudflare strict |
| ticketmaster | Imperva / custom |
| indeed | Cloudflare Turnstile |

Dropped: leboncoin (CloudFront geo-block from Brazil, DataDome never reached).

Gaps to fill, one gradeable target each, homepage only: DataDome (candidates: hermes.com, vinted.com, footlocker), Kasada (candidates: canadagoose.com, ticketek), Shape/F5 (candidates: a US bank login page, target.com). Confirm the vendor by the block page markup before adding.

### 4d. Behaviour (post-load interaction)

Not in the baseline. Add as a separate group so load-only numbers stay comparable.

| id | what the pipeline does | grades on |
|---|---|---|
| incolumitas-behav | load, move mouse along 3 waypoints, scroll 600px, wait 5s, click one link, read `#behavioralClassificationScore` | behavioural bot score |
| dbi-behav | deviceandbrowserinfo behavioural test page: type into the field at human speed, submit | its verdict + "CDP mouse leak" flag |
| zillow-search | load, type a city into search, submit | Press & Hold appears or not |
| walmart-search | load, type a product, submit | "Robot or human?" appears or not |

Same interaction steps for every engine. iframer uses `human-click` / `human-type` / `scroll human:true`. Camoufox uses `humanize=True`. Neither gets hand-tuned per site.

## 5. Grading

| verdict | meaning |
|---|---|
| pass | site said human, or the real page content rendered |
| partial | site flagged something without calling it a bot (creepjs like-headless ≥ 30%, lies > 0) |
| fail | site said bot, or a wall page (markers in `targets.BLOCK_MARKERS`) |
| unknown | no verdict rendered in the wait window; excluded from rates, counted and shown |

Regrade rules that live in `report.py`, applied to every engine identically:
- iframer `errorType: bot-blocked` = fail (it's a verdict, iframer just refused to read the wall).
- Blank document for the full wait, title = domain, on a site that renders for other configs = fail (interstitial never resolved).
- Firefox UA + sannysoft "Chrome missing" = ignored (a Chrome-only check).

Any new regrade rule gets written down here with the reason before it's used.

## 6. The probe checklist

The self-report probe is the unit test of this protocol. After the declared-layer fixes, every iframer config must show:

| check | baseline (0.10.6) | required |
|---|---|---|
| UA contains `HeadlessChrome` | yes, headless | no |
| UA OS = `navigator.platform` OS | no (Mac UA, Win32) | yes |
| UA OS = Client Hints platform | no (Mac UA, Windows) | yes |
| GPU renderer plausible for declared OS | no (Intel Iris on M3 / Windows) | yes |
| viewport = Playwright default 1280×720 with a bigger screen | yes | no |
| Client Hints brand = "Chrome for Testing" | yes | no, on `iframer-chrome` |
| `window.chrome` present under a Chrome UA | yes | yes |
| console.debug stack leak (Runtime.enable) | no | no |
| `webdriver` | false | false |

Docker adds: GPU renderer must not read `SwiftShader`; font count ≥ 40; timezone = IP timezone.

## 7. Pass criteria for a fix

Compared against the baseline numbers, same environment, same page set, unknowns excluded:

| metric | baseline | target |
|---|---|---|
| iframer-headless, detectors | 29% | ≥ 85% |
| iframer-headful, detectors | 71% | ≥ 95% |
| iframer-headless, Cloudflare pages | 100% | ≥ 100% (no regression) |
| iframer-headful, production walls | 94% | ≥ 94% (no regression) |
| iframer-headless, production walls | 61% | ≥ 80% |
| iframer-auto, all groups | 77% | ≥ 90%, and ≤ 1 escalation per domain per run |
| probe checklist | 6 red | 0 red |

Camoufox and camofox rows are re-run in the same sitting, not copied from the baseline. Their numbers are the yardstick, and the yardstick moves when sites update.

A fix that raises detector scores and lowers wall scores is a regression. Walls are the job, detectors are the exam.

## 8. Run procedure

```bash
cd tests/blind-tests && . .venv/bin/activate
iframer status                              # note version, modes available
python -m camoufox version                  # note Firefox build
rm results/results.jsonl                    # or --resume to continue an interrupted sitting
python bench.py --runs 3                    # all configs, all load-only pages
python bench.py --runs 3 --configs camofox-hermes --targets ...   # with the server up, own CAMOUFOX_INSTALL_DIR
python report.py                            # results/report.html
cp results/results.jsonl results/<date>-<what-changed>.jsonl
```

Header of every results file (first line of the narrative): date, iframer version, Chrome version, camoufox version, OS, country of IP, display yes/no.

## 9. Known traps

- `npm i @askjo/camofox-browser` wipes `~/Library/Caches/camoufox`, the Python package's binary. Give it `CAMOUFOX_INSTALL_DIR`.
- Two bench processes at once double-hit the same sites and produce "no JSON" unknowns. One process per sitting.
- iframer `evaluate` step field is `expression`, not `code` as the README says. `code` silently returns nothing.
- iframer daemon screenshot URLs need auth from outside the daemon; don't rely on them for evidence, use the page text.
- `iframer-auto` run 1 is the only cold visit; runs 2 and 3 use domain memory. Read the `modeUsed` column before concluding anything about auto.
- Memory pressure kills background watchers, not the bench. Keep the bench detached (`nohup`).

## 10. Docker sitting, what it took (2026-09-18)

Containers, all prefixed `benchmark-iframer-`, images built from `docker/`:
- `benchmark-iframer-api`: the repo Dockerfile, host port 3121 -> container 3022 (see trap 1), VNC 6180-6184, data dir `~/.iframer-benchmark`, secret `benchmark-iframer-secret`, run with `--init` (see trap 2). Host CLI reaches it with `IFRAMER_MODE=docker IFRAMER_URL=http://localhost:3121 IFRAMER_SECRET=...`.
- `benchmark-iframer-camoufox`: python camoufox + Xvfb, driven by `docker exec ... camoufox_worker.py`.
- `benchmark-iframer-camofox`: `@askjo/camofox-browser` from npm on `node:24-trixie-slim`, host port 9378.

Traps found in iframer's Docker mode, all pre-existing, none fixed:
1. `index.ts` binds `127.0.0.1`, so the shipped `docker-compose.yml` port mapping is unreachable from the host. Workaround: a node forwarder inside the container, 0.0.0.0:3022 -> 127.0.0.1:3021.
2. The daemon reaps its own Chrome mid-run ("owner 1 is dead"): the pid liveness check fails for pid 1 in a container. Workaround: `docker run --init` so the server is not pid 1.
3. The daemon hangs (execute or `session stop` never return) roughly 1 run in 10. The harness restarts the container on a timeout (`engines.docker_reset`) and marks the run unknown.

Caveat on the numbers: Docker Desktop on Apple Silicon runs arm64 Linux containers. A real VPS is x86_64. arm64 desktop browsers are near nonexistent in the wild, so any "container" finding here may partly be an "arm64" finding. Cloudflare's challenge pages blocked all six container configs 36 of 36 on the home IP; on x86_64 that number may differ. Re-run on an x86_64 box before drawing the VPS conclusion.

Cloudflare 0/36 in Docker, what was ruled out (2026-09-18): same egress IP as the host; challenge JS loads and posts (`orchestrate/chl_page`, Turnstile `api.js`, `/fo/` all 200); 60 s wait, no change; `--platform linux/amd64` under Rosetta fails identically, so not arm64. Still on the table: no GPU / software canvas (headless camoufox has no WebGL context at all), and Docker Desktop's user-space networking (TCP stack is the Mac's, browser claims Linux/Windows). Only a real x86_64 Linux host separates those two.
