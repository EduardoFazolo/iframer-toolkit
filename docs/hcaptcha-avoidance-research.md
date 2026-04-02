# hCaptcha Avoidance Research

**Goal**: Make a Playwright/patchright browser automation setup on Linux/Docker look real enough that hCaptcha gives a green light without showing any visual challenge.

**Research date**: March 2026  
**Scope**: Browser fingerprinting signals, working techniques, known tools, IP vs fingerprint tradeoffs, and session warmup effects.

---

## Table of Contents

1. [How hCaptcha Decides Whether to Show a Challenge](#1-how-hcaptcha-decides-whether-to-show-a-challenge)
2. [Browser Fingerprint Signals hCaptcha Reads](#2-browser-fingerprint-signals-hcaptcha-reads)
3. [Automation Signals That Give You Away](#3-automation-signals-that-give-you-away)
4. [IP Reputation vs Browser Fingerprint](#4-ip-reputation-vs-browser-fingerprint)
5. [Working Techniques and Tools](#5-working-techniques-and-tools)
   - [Chrome Launch Flags](#51-chrome-launch-flags)
   - [puppeteer-extra-plugin-stealth](#52-puppeteer-extra-plugin-stealth)
   - [Patchright](#53-patchright)
   - [rebrowser-patches (Runtime.Enable Fix)](#54-rebrowser-patches-runtime-enable-fix)
   - [Botright](#55-botright)
   - [nodriver (successor to undetected-chromedriver)](#56-nodriver-successor-to-undetected-chromedriver)
   - [CloakBrowser](#57-cloakbrowser)
   - [SeleniumBase UC / CDP Mode](#58-seleniumbase-uc--cdp-mode)
   - [playwright-with-fingerprints (Bablosoft)](#59-playwright-with-fingerprints-bablosoft)
   - [Ghost Cursor (Human Mouse Movement)](#510-ghost-cursor-human-mouse-movement)
6. [Docker / Linux / Headless-Specific Issues](#6-docker--linux--headless-specific-issues)
7. [Session Warmup and Cookie Trust](#7-session-warmup-and-cookie-trust)
8. [hCaptcha Difficulty Modes and Site-Owner Configuration](#8-hcaptcha-difficulty-modes-and-site-owner-configuration)
9. [Recommended Implementation Stack](#9-recommended-implementation-stack)
10. [What Definitely Does Not Work](#10-what-definitely-does-not-work)
11. [Key Sources](#11-key-sources)

---

## 1. How hCaptcha Decides Whether to Show a Challenge

hCaptcha is not a simple checkbox — it runs a multi-layered risk scoring pipeline **before** any visual challenge appears. The pipeline runs JavaScript inside your browser and collects signals. Based on the resulting risk score:

- **Low risk**: No interruption; system works invisibly (the token is issued silently).
- **Moderate risk**: Click-the-checkbox or a one-step image recognition task.
- **High risk**: Multi-round challenges, fine-grained visual tasks, sequential reasoning.

The scoring happens **before** the UI is rendered. If your score is low enough, you get a token without ever seeing a puzzle. This is the mechanism you need to exploit.

The risk pipeline collects signals across three layers:

1. **Network layer**: IP reputation, ASN type (residential vs datacenter), request timing and rate, TLS fingerprint consistency.
2. **Browser fingerprint layer**: Navigator properties, canvas, WebGL, audio, fonts, plugins, screen dimensions, hardware specs.
3. **Behavioral layer**: Mouse movement, click timing, scroll patterns, typing speed, cursor pause duration.

Source: [hCaptcha fingerprinting script analysis](https://github.com/d4c5d1e0/hcaptcha), [anyleads.com](https://anyleads.com/understanding-hcaptcha-how-bot-detection-systems-work)

---

## 2. Browser Fingerprint Signals hCaptcha Reads

In June 2022, hCaptcha deployed an encrypted fingerprinting script (executed inside WebAssembly) that collects 40+ distinct data points. The script fetches from hCaptcha's servers, decrypts in WASM, then runs the collection routine. Many properties are sent unhashed; ~15+ are hashed (WebGL data, audio, CSS properties, math op results).

### 2a. Navigator / Platform Properties
- `navigator.userAgent` — full UA string
- `navigator.platform` — OS platform string
- `navigator.language` and `navigator.languages` — locale settings
- `navigator.hardwareConcurrency` — CPU core count
- `navigator.deviceMemory` — RAM bucket (0.25, 0.5, 1, 2, 4, 8 GB)
- `navigator.maxTouchPoints` — touch capability
- `navigator.plugins` — plugin list (empty = headless red flag)
- `navigator.mimeTypes` — associated MIME types

### 2b. Screen & Window Properties
- `screen.width`, `screen.height`, `screen.availWidth`, `screen.availHeight`
- `screen.colorDepth`, `screen.pixelDepth`
- `devicePixelRatio`
- `window.outerWidth`, `window.outerHeight` (vs innerWidth/innerHeight — mismatch = red flag)

### 2c. Canvas Fingerprint
- Canvas rendering output is hashed. The rendered result differs by GPU, OS, driver, and font rendering engine. A Linux headless environment produces a distinctly different hash from a real Windows/Mac Chrome instance.

### 2d. WebGL
- `WebGLRenderingContext` vendor and renderer strings
- WebGL rendering output (hashed)
- GPU capability exposure via WebGL extensions

### 2e. Audio Fingerprint
- `AudioContext` processing output — produces a unique floating-point hash based on OS audio stack
- `speechSynthesis.getVoices()` — available voices list (none = red flag in headless)

### 2f. CSS Fingerprinting
- Some form of CSS fingerprinting that "differs across browsers but remains consistent within browser types"

### 2g. Media Codecs & Devices
- `navigator.mediaDevices.enumerateDevices()` — cameras, microphones
- Supported video/audio codec detection

### 2h. Automation-Specific Checks
- `navigator.webdriver` — true in automation (primary signal)
- `window._Selenium_IDE_Recorder` — Selenium IDE presence
- `window._phantom` — PhantomJS presence
- `window.__nightmare` — Nightmare.js presence
- Worker user-agent comparison (worker UA vs main thread UA mismatch)
- Electron app detection
- Chrome-specific properties (`window.chrome`, `chrome.runtime`)

### 2i. Behavioral Data (collected during interaction)
- Mouse trajectory, speed, acceleration, pauses before click
- Typing speed and keystroke timing
- Scroll patterns
- Click timing relative to page load

Source: [d4c5d1e0/hcaptcha](https://github.com/d4c5d1e0/hcaptcha), [rebrowser.net Incapsula/hCaptcha guide](https://rebrowser.net/blog/solving-incapsula-and-hcaptcha-complete-guide-to-imperva-security)

---

## 3. Automation Signals That Give You Away

These are the most critical tells — ordered roughly by severity:

### 3a. `navigator.webdriver = true` (CRITICAL)
The most obvious. Playwright, Puppeteer, and Selenium all set this to `true` by default. Any anti-bot system checks this first.

**Fix**: `--disable-blink-features=AutomationControlled` removes it at the Blink level. Also requires JS property override via `addInitScript` to delete the property from the prototype chain.

### 3b. Runtime.Enable CDP Leak (CRITICAL for modern detection)
When Playwright/Puppeteer enable the `Runtime` DevTools Protocol domain, it creates observable side-effects on the page. Sites can detect this via property access callbacks and MutationObservers that fire when CDP-injected contexts run.

**Fix**: rebrowser-patches and Patchright both address this differently (see Section 5).

### 3c. HeadlessChrome in User-Agent
Playwright's default UA string contains `"HeadlessChrome"`. Any bot detection script checking `navigator.userAgent` sees it immediately.

**Fix**: Override the UA to a real full-Chrome UA string.

### 3d. Empty `navigator.plugins`
Real Chrome has plugins; headless Chrome has zero. Any check of `navigator.plugins.length === 0` flags you immediately.

**Fix**: Inject fake plugin entries via `addInitScript`. puppeteer-extra-plugin-stealth has a module for this.

### 3e. Missing `window.chrome` Object
Real Chrome exposes a `window.chrome` object with `chrome.runtime`, `chrome.loadTimes`, etc. Headless Chrome doesn't.

**Fix**: Inject a realistic mock `window.chrome` object.

### 3f. Canvas Fingerprint Mismatch
A Linux Docker container with default Mesa/llvmpipe software rendering produces a wildly different canvas hash than a real Windows/Mac Chrome with hardware GPU rendering. hCaptcha has seen millions of fingerprints and knows what a "real" canvas looks like.

**Fix**: This requires either C++-level patching (CloakBrowser) or using a real GPU in Docker (with `--gpus all` and hardware acceleration).

### 3g. WebGL Renderer String
Default Linux/Docker: `"Mesa Intel(R) UHD Graphics 620"` or `"llvmpipe"` — both known bot signals. Real Windows/Mac Chrome shows actual GPU strings.

**Fix**: Override via JS (partial fix, inconsistencies detectable) or C++-level patch.

### 3h. `outerWidth / outerHeight` = 0
In headless mode, these properties are 0. Real browsers have them set to the window chrome size.

**Fix**: Set viewport, override properties via `addInitScript`.

### 3i. Inconsistent `Accept-Language` Header vs `navigator.languages`
The browser sends one language in HTTP headers but JavaScript `navigator.languages` returns another. Stealth plugins need to patch both.

### 3j. Suspicious `navigator.permissions` Behavior
Headless Chrome responds differently to `navigator.permissions.query({name: 'notifications'})`. Real Chrome returns `"default"`; headless returns `"denied"`.

### 3k. CDP Source URL Leaks
Scripts injected via CDP contain `//# sourceURL=pptr:evaluate:...` markers that are visible to page code and signal automation.

**Fix**: rebrowser-patches replaces these with generic filenames like `app.js`.

### 3l. Perfect Machine-Like Mouse Movements
Bots typically click the exact center of elements with straight-line paths at constant velocity. Human movements are curved, jittery, and have variable speed.

**Fix**: ghost-cursor library or custom Bezier curve mouse simulation.

### 3m. Missing Browsing History, Cookies, localStorage
A fresh browser profile with zero state looks suspicious. hCaptcha likely scores fresh profiles higher risk.

**Fix**: Session warmup (see Section 7).

### 3n. Datacenter IP (CRITICAL)
Regardless of fingerprint quality, a datacenter IP (AWS, GCP, Azure, DigitalOcean, etc.) is a massive red flag. hCaptcha has ASN databases and knows datacenter ranges.

Source: [rebrowser.net](https://rebrowser.net/blog/solving-incapsula-and-hcaptcha-complete-guide-to-imperva-security), [castle.io blog](https://blog.castle.io/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/), [dicloak.com](https://dicloak.com/blog-detail/playwright-stealth-what-works-in-2026-and-where-it-falls-short)

---

## 4. IP Reputation vs Browser Fingerprint

This is the most important question for the implementation decision. The evidence is clear:

### The Consensus Finding

**Both matter and you need both. But IP is the gate; fingerprint is the filter.**

- A **good fingerprint + datacenter IP** = challenge will be shown. The undetected-chromedriver issue #625 explicitly confirmed: `"browsing using datacenter IPs != human. red flag"` — the bot was detected inside Docker even with stealth specifically because of the IP type.
- A **bad fingerprint + residential IP** = challenge will likely be shown. The IP gets you past the first gate, but fingerprint/behavioral signals still score you.
- A **good fingerprint + residential IP** = best chance of no challenge.

### Quantitative Estimates from Industry Sources

| Approach | Challenge Rate (industry estimates) |
|---|---|
| Stealth plugins alone (no proxy) | 40–60% still challenged |
| Stealth + datacenter proxy | 60–80% still challenged |
| Stealth + residential proxy | 15–30% still challenged |
| Full stack (C++-level patches + residential + behavior) | < 10% challenged |

Note: These are rough industry-reported figures. Actual rates vary significantly by site configuration, IP pool quality, and how up-to-date the stealth patches are.

### IP Quality Matters Within Residential

Not all residential IPs are equal. hCaptcha has flagged that 30–95% of traffic on major residential proxy networks is associated with abuse (ad fraud, scalping, etc.). This means well-known proxy provider IP ranges may themselves have degraded trust scores.

**Implication**: ISP proxies (IPs from ISPs assigned to residential customers but hosted in datacenters, also called "static residential" or "ISP proxies") often perform better than rotating residential pools because they haven't been abused as heavily.

Source: [hCaptcha residential proxy report](https://www.hcaptcha.com/report-are-all-residential-proxy-services-criminal-organizations), [undetected-chromedriver issue #625](https://github.com/ultrafunkamsterdam/undetected-chromedriver/issues/625), [ZenRows CAPTCHA proxies](https://www.zenrows.com/blog/captcha-proxies)

---

## 5. Working Techniques and Tools

### 5.1 Chrome Launch Flags

These flags should be applied in any stealth setup. Confirmed effective individually, though not sufficient alone:

```
--disable-blink-features=AutomationControlled
```
- Removes `navigator.webdriver = true` at the Blink level
- Removes the automation-controlled infobar
- **Evidence**: Directly confirmed to remove hCaptcha challenge in a real test (Ruby/Selenium experiment at agileway.substack.com)

Additional flags to **remove** from default Playwright/Puppeteer launch args:
```
# Remove these (they signal automation):
--enable-automation
--disable-popup-blocking  
--disable-component-update
--disable-default-apps
--disable-extensions
```

Additional flags to **add**:
```
--no-sandbox                          # Required in Docker
--disable-setuid-sandbox              # Required in Docker
--disable-dev-shm-usage               # Required in Docker (prevents crashes)
--window-size=1280,800                # Set realistic dimensions
--start-maximized                     # Realistic window state
--lang=en-US                          # Consistent language
```

Source: [Patchright source](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright), [agileway.substack.com](https://agileway.substack.com/p/how-to-avoid-hcaptcha-with-selenium)

---

### 5.2 puppeteer-extra-plugin-stealth

**Repo**: https://github.com/berstend/puppeteer-extra  
**Stars**: ~6000+ (puppeteer-extra monorepo)  
**Language**: JavaScript/TypeScript

**What it patches** (confirmed module list):
1. `navigator.webdriver` — sets to undefined via ES6 Proxy
2. `navigator.plugins` — fully emulates plugins/mimetypes in headless
3. `navigator.languages` — adds `Accept-Language` header in headless
4. `navigator.vendor` — override capability
5. `window.chrome` / `chrome.runtime` — extensive mocking of the chrome object
6. `webgl.vendor` — patches WebGL vendor identification
7. `window.outerdimensions` — fixes missing outerWidth/outerHeight
8. `media.codecs` — spoof presence of proprietary codecs in Chromium
9. `iframe.contentWindow` — patches iframe detection
10. `user-agent-override` — sets stealthy UA string, language, platform

**Evidence of effectiveness against hCaptcha**:
- The plugin's own documentation says: *"Don't expect this to bypass anything but the simplest bot detection."*
- Multiple independent sources confirm it fails against advanced hCaptcha in 2025/2026
- Success rate with stealth plugin alone: 40–60% (per Skyvern benchmark)

**Verdict**: Essential baseline, but **not sufficient alone**. Fixes the obvious JS-level signals but does not address:
- Canvas fingerprint consistency
- Runtime.Enable CDP leak
- Behavioral signals
- IP reputation

**Playwright equivalent**: `playwright-stealth` npm/pip package (port of the same evasions)

---

### 5.3 Patchright

**Repo**: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright  
**Stars**: ~500+  
**Language**: Python (drop-in Playwright replacement)

**What it patches** (beyond standard Playwright):

1. **Runtime.Enable leak prevention** — primary patch: avoids the `Runtime.enable` CDP command entirely by executing JavaScript in isolated ExecutionContexts instead
2. **Console API disabling** — disables console API entirely (trades functionality for stealth)
3. **Chrome launch flags** — adds `--disable-blink-features=AutomationControlled`, removes `--enable-automation`, `--disable-popup-blocking`, `--disable-component-update`, `--disable-default-apps`, `--disable-extensions`
4. **Closed Shadow DOM** — enables manipulation of elements in Closed Shadow Roots
5. **InitScript injection** — uses Playwright Routes to inject JavaScript into HTML requests instead of CDP evaluation (avoids CDP-level detection)

**Claimed detection bypasses**: Cloudflare, Kasada, Akamai, DataDome, Fingerprint.com (14+ systems per README)

**hCaptcha mentions**: None in documentation. The library focuses on anti-bot detection frameworks, not captcha solving.

**Verdict**: Strong candidate for the CDP leak fix. Drop-in Playwright replacement. The Runtime.Enable fix is the most critical patch for modern detection. Combine with fingerprint spoofing and residential proxy for best results.

---

### 5.4 rebrowser-patches (Runtime.Enable Fix)

**Repo**: https://github.com/rebrowser/rebrowser-patches  
**Latest tested**: Playwright 1.52.0 (April 2025), Puppeteer 24.8.1 (May 2025)

**What it patches**:

1. **Runtime.Enable CDP leak** (primary) — three available modes:
   - `addBinding` (default): Creates bindings in the main world to get context IDs without the CDP leak
   - `alwaysIsolated`: Executes scripts in isolated contexts; prevents page script detection via MutationObserver
   - `enableDisable`: Calls Runtime.Enable then immediately disables — triggers context creation events without persistent exposure

2. **sourceURL modification** — replaces `//# sourceURL=pptr:evaluate:...` with generic filenames like `app.js`

3. **Utility world naming** — allows customization of the default execution world identifier

**Claimed effectiveness**: *"Our tests show that all these approaches are currently undetectable by Cloudflare or DataDome."*

**Caveats**: 
- `Page.pause()` debugging doesn't work with the fixes enabled
- Chrome only currently (for Playwright)
- Drop-in packages available: `rebrowser-playwright`, `rebrowser-playwright-core`

**Verdict**: The Runtime.Enable fix is the most important single patch for modern Playwright detection. This is the technique Patchright also implements. Should be applied in every production stealth setup.

Source: [rebrowser/rebrowser-patches](https://github.com/rebrowser/rebrowser-patches)

---

### 5.5 Botright

**Repo**: https://github.com/Vinyzu/Botright  
**Stars**: ~956  
**Language**: Python, built on Playwright

**What it does**:
- Uses a **real local Chromium-based browser** (recommends Ungoogled Chromium) as the base, not a patched headless binary
- Self-scrapes real Chrome fingerprints and injects them to create a fake browser fingerprint
- Integrates `Undetected-Playwright-Python` for additional evasion layers
- Has a `get_hcaptcha()` method for solving challenges when they appear

**Fingerprint spoofing approach**: Collects real fingerprints from actual browser instances and replays them in the automation context — more convincing than generating synthetic fingerprints.

**Detection test results** (from README):
- reCAPTCHA v3: 0.9 score
- DataDome: bypassed
- Cloudflare Turnstile: cleared
- CreepJS: ~65.5%
- Sannysoft bot detector: passed
- Fingerprint.com: not detected

**hCaptcha status**: Listed as `✔️ ❓` (uncertain) — the hcaptcha-challenger integration is noted as "outdated" in the README.

**Verdict**: Interesting architecture (using real fingerprints from actual browsers), but hCaptcha support is uncertain and potentially broken. Worth monitoring. Not production-ready for hCaptcha avoidance specifically.

---

### 5.6 nodriver (successor to undetected-chromedriver)

**Repo**: https://github.com/ultrafunkamsterdam/nodriver  
**Stars**: ~3,900  
**Language**: Python

**What it does**:
- Communicates directly with Chrome's DevTools Protocol without Selenium/chromedriver in the middle — eliminates a detectable software layer
- Creates fresh temporary browser profiles per run (no accumulated state artifacts)
- Has a built-in `tab.cf_verify()` for Cloudflare checkbox challenges
- Has built-in cookie/localStorage save-restore

**Key technical difference from undetected-chromedriver**: Instead of patching chromedriver, it eliminates chromedriver entirely and drives Chrome directly via CDP.

**hCaptcha claims**: The README markets it as handling hCaptcha but provides no quantitative proof. The `cf_verify()` method is only for Cloudflare checkboxes specifically.

**Headless warning**: The predecessor (undetected-chromedriver) explicitly noted "headless is not supported" — this remains a concern for nodriver in Docker.

**Verdict**: Good for reducing automation layers. But the direct CDP approach still has the Runtime.Enable leak unless explicitly patched. Best combined with rebrowser-patches or similar.

---

### 5.7 CloakBrowser

**Repo**: https://github.com/CloakHQ/CloakBrowser  
**Language**: C++ (compiled Chromium binary), Playwright-compatible

**What it does**: Applies **42 C++-level source patches** to Chromium compiled directly into the binary. This is the most thorough approach.

**Patched areas** (C++ level):
- Canvas fingerprinting
- WebGL fingerprinting  
- Audio context fingerprinting
- Font detection
- GPU/hardware reporting
- Screen properties
- Automation signal removal (`navigator.webdriver`, automation flags)
- CDP input behavior mimicking
- WebGPU adapter features and device ID spoofing
- Native locale spoofing
- User agent string normalization

**Detection test results** (from README, 30+ services):
- reCAPTCHA v3: 0.9 score (server-verified)
- Cloudflare Turnstile: PASS (non-interactive)
- FingerprintJS: PASS
- BrowserScan: NORMAL (4/4 checks)
- `navigator.webdriver`: false

**Important caveat**: The documentation explicitly states: *"CloakBrowser doesn't solve CAPTCHAs — it prevents them from appearing."* No specific hCaptcha claims are made.

**Docker support**: Pre-built Docker image available on Docker Hub. Works identically local, in Docker, and on VPS per README.

**Verdict**: Most promising approach for the Docker/Linux use case. C++-level patches can't be detected by JS-based fingerprinting because the browser actually IS a real browser with modified internals. Expensive proprietary solution, but the architecture is right.

Source: [CloakHQ/CloakBrowser](https://github.com/CloakHQ/CloakBrowser)

---

### 5.8 SeleniumBase UC / CDP Mode

**Docs**: https://seleniumbase.io/help_docs/uc_mode/  
**Language**: Python

**What it does**:
- UC Mode: wraps undetected-chromedriver with convenience methods
- CDP Mode: uses `connect_over_cdp()` to connect to an already-stealth browser instance
- `sb.uc_gui_handle_captcha()` and `sb.uc_gui_click_captcha()` methods for captcha interaction

**Evidence for hCaptcha**:
- Documentation states "Using UC Mode can be enough to fool anti-bot solutions into thinking you're a human user so that they don't even show CAPTCHAs"
- KuCoin signup hCaptcha reported as bypassing successfully, but with caveat: "after doing this task repeatedly it doesn't pass the hCaptcha"
- Complex image-based challenges cannot be bypassed with UC Mode alone

**Verdict**: Works in some cases, inconsistent for repeated runs. The underlying mechanism is undetected-chromedriver + CDP mode, which shares limitations with nodriver.

---

### 5.9 playwright-with-fingerprints (Bablosoft)

**Repo**: https://github.com/bablosoft/playwright-with-fingerprints  
**Language**: JavaScript/TypeScript  
**Service**: Requires FingerprintSwitcher (commercial)

**What it does**:
- Fetches real browser fingerprints from the FingerprintSwitcher service
- Applies them before browser launch, not via runtime JS patching
- Claims to modify properties at a hardware-representation level, not just JS getters

**Properties spoofed** (documented):
- Canvas data
- WebGL data and video card properties
- Audio data and settings
- Font list
- WebRTC IP
- Browser language
- Timezone
- Plugin list
- Screen properties
- User agent and platform
- Touch support
- Battery, gamepad, geolocation
- Navigator properties
- Headers order

**hCaptcha mentions**: None in documentation.

**Evidence of effectiveness**: No quantitative metrics provided. Community reports that it fails against well-protected anti-bot challenge pages.

**Verdict**: Interesting approach using real collected fingerprints. The real fingerprint source is the key differentiator. But no evidence specifically against hCaptcha, and it still doesn't fix CDP-level leaks.

---

### 5.10 Ghost Cursor (Human Mouse Movement)

**Repo**: https://github.com/Xetera/ghost-cursor  
**Stars**: ~2,000+  
**Language**: JavaScript, Puppeteer native; Playwright port available  

**What it does**:
- Generates human-like mouse movement data using **Bezier curves** and **Fitts's Law**
- Moves to a random coordinate within the target element (not exact center)
- Speed accounts for distance and element size
- Simulates natural acceleration and deceleration

**Playwright support**: Not officially supported by the main package, but community ports exist:
- `@avilabs/ghost-cursor-playwright` on npm
- `substack.thewebscraping.club` guide on using ghost-cursor in Playwright

**Evidence against hCaptcha**: No specific evidence. Ghost Cursor addresses behavioral signals only — it becomes ineffective when deeper fingerprinting catches you first.

**Verdict**: Should be part of the stack but is not sufficient alone. Address fingerprint signals first; behavioral mimicry is the last layer.

---

## 6. Docker / Linux / Headless-Specific Issues

### The Core Problem

Docker running Linux Chrome without a GPU or display produces distinctly different fingerprints from real user browsers:
- Canvas rendering uses Mesa/llvmpipe software renderer (well-known bot signal)
- WebGL renderer string: `"llvmpipe (LLVM 12.0.0, 256 bits)"` — immediately flagged
- Audio context produces different output without real audio hardware
- Screen size, color depth, device pixel ratio all have different defaults
- Font availability differs significantly from Windows/Mac

### The Headless Detection Problem

Playwright's `headless: true` mode historically produced obvious signals beyond just `navigator.webdriver`. Chrome 112+ introduced "headless new" mode which is more convincing, but still has tells:
- Missing `window.chrome` object
- Different permission API behavior  
- No speech synthesis voices

**The Xvfb Solution**: Running Chrome in headed mode (`headless: false`) with an Xvfb virtual framebuffer in Docker avoids headless-specific detection. This was confirmed by the undetected-chromedriver community.

```bash
# Docker setup with Xvfb
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99
# Then launch Chrome with --display=:99 or headless: false
```

**Benefits of Xvfb**:
- Canvas and WebGL render with software rendering but in a more realistic context
- Fonts load correctly
- Speech synthesis may work
- Browser appears headed (non-headless signals)

**Remaining problem**: Even with Xvfb, the Mesa/llvmpipe software renderer produces detectable canvas and WebGL fingerprints. The only real fix is GPU passthrough in Docker.

### GPU Passthrough in Docker

If the host machine has a GPU, passing it through to the container produces hardware-accelerated rendering:

```yaml
# docker-compose.yml
services:
  browser:
    image: your-image
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

Or for Intel/AMD:
```bash
docker run --device /dev/dri:/dev/dri ...
```

With hardware GPU, Chrome produces authentic canvas/WebGL output matching real user browsers.

**Important**: Even with GPU passthrough, the Linux GPU vendor/renderer string will still differ from Windows Chrome users. You can spoof this via WebGL vendor string override (JS-level, partial fix) or C++-level patching (CloakBrowser approach).

Source: [undetected-chromedriver Docker issue #625](https://github.com/ultrafunkamsterdam/undetected-chromedriver/issues/625), [headful scraping with Playwright in Docker](https://francomorero.substack.com/p/headful-scraping-with-playwright)

---

## 7. Session Warmup and Cookie Trust

### Does It Help?

Yes, but the evidence is indirect. hCaptcha collects cookies and localStorage and uses them as session signals. A fresh profile with zero history is a risk signal.

**What to do**:
1. **Pre-warm the browser session** by visiting a few popular sites (Google, Reddit, Wikipedia) before hitting the hCaptcha-protected page
2. **Persist cookies and localStorage** across sessions (don't create fresh profiles every run)
3. **Save state after successful passes** and reload it for subsequent runs

```typescript
// Save state after successful run
await page.context().storageState({ path: 'session.json' });

// Restore state on next run
const context = await browser.newContext({
  storageState: 'session.json'
});
```

4. **Avoid destroying and recreating profiles** for each task — maintain a pool of "aged" profiles

### The Scope of hCaptcha's Cross-Site Tracking

Unlike reCAPTCHA (which uses Google's entire user profile and browsing history across sites), hCaptcha is designed as a privacy-first service and does **not** do cross-site tracking. This means:
- You can't benefit from a rich browsing history the way you might trick reCAPTCHA v3
- The session signals are scoped to hCaptcha itself and the specific site
- You do benefit from repeated successful hCaptcha completions on the same site building trust

Source: [hCaptcha privacy policy](https://www.hcaptcha.com/privacy), [CAPTCHA cookies comparison](https://friendlycaptcha.com/insights/captcha-cookies/)

---

## 8. hCaptcha Difficulty Modes and Site-Owner Configuration

Understanding this helps set realistic expectations:

| Mode | What It Does | Who Can Use It |
|---|---|---|
| Easy | Standard easy challenge for most users, most of the time | All publishers |
| Moderate | Progressively harder challenges | All publishers |
| Difficult | More demanding challenge types | All publishers |
| Always On | Never auto-passes; always shows a challenge | All publishers |
| Passive | No visual challenge ever; pure bot scoring returned to site | Enterprise only |
| 99.9% Passive | Challenges <0.1% of users based on risk evaluation | Enterprise only |

**Key insight**: If a site is configured as "Always On" or "Difficult", **no fingerprint technique will prevent a challenge from appearing**. The challenge will always show. The avoidance techniques in this document only work when the site is NOT configured to always challenge.

The typical behavior for sites on free/standard plans: hCaptcha uses risk scoring to decide whether to challenge. This is the scenario where your fingerprint quality matters.

**Recommendation**: Test against sites you know to use standard (non-Always-On) hCaptcha. The Discourse forum hcaptcha test page is a common benchmark.

Source: [hCaptcha difficulty settings](https://www.hcaptcha.com/post/how-hcaptcha-difficulty-settings-work), [hCaptcha invisible docs](https://docs.hcaptcha.com/invisible/)

---

## 9. Recommended Implementation Stack

Based on all research findings, here is the prioritized implementation stack for the Playwright/patchright + Docker use case:

### Layer 1: IP (Most Critical)

- **Use residential or ISP proxies**, not datacenter IPs
- Prefer ISP proxies (static residential) over rotating residential pools — less abuse history
- IPRoyal residential is the user-preferred provider per project notes
- Rotate IPs but not too aggressively — consistent IP per session is better for trust building

### Layer 2: CDP Leak Fix (Critical for Modern Detection)

Apply one of:
- **Patchright** (drop-in Playwright Python replacement) — includes Runtime.Enable fix
- **rebrowser-patches** — applies the patch to existing Playwright installation
- Both fix the same underlying CDP Runtime.Enable detection vector

### Layer 3: Chrome Launch Flags

```typescript
const browser = await chromium.launch({
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--window-size=1280,800',
    '--lang=en-US,en',
    '--disable-infobars',
    '--disable-notifications',
  ],
  // Remove these default args that signal automation:
  ignoreDefaultArgs: [
    '--enable-automation',
    '--disable-popup-blocking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
  ],
  headless: false, // Use Xvfb in Docker
});
```

### Layer 4: JavaScript Property Patches (via addInitScript)

Apply all of the following via `page.addInitScript()` or context `addInitScript()`:

```javascript
// 1. Remove webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. Realistic plugins
Object.defineProperty(navigator, 'plugins', {
  get: () => [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
  ],
});

// 3. Realistic languages
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// 4. window.chrome object
window.chrome = {
  runtime: {
    onConnect: { addListener: () => {}, removeListener: () => {} },
    onMessage: { addListener: () => {}, removeListener: () => {} },
  },
  loadTimes: () => ({}),
  csi: () => ({}),
};

// 5. Fix outerWidth/outerHeight
Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 73 });

// 6. Fix permissions
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);
```

### Layer 5: User Agent Consistency

Set a realistic UA that matches:
- A real Chrome version (not a version too far from current)
- Matching platform in both UA string and `navigator.platform`
- Matching `Accept-Language` header and `navigator.languages`

```typescript
await page.setExtraHTTPHeaders({
  'Accept-Language': 'en-US,en;q=0.9',
});
await page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
);
```

Note: Using a Windows UA from a Linux Docker container creates a UA/platform mismatch. Consider using a Linux Chrome UA instead, or patch `navigator.platform` to match the Windows UA.

### Layer 6: Docker Display Setup

```dockerfile
# Install Xvfb
RUN apt-get install -y xvfb x11-utils

# Start with display
ENV DISPLAY=:99
RUN Xvfb :99 -screen 0 1280x800x24 &
```

Run Chrome with `headless: false` and the `DISPLAY` env var set.

### Layer 7: Behavioral Simulation

- Use ghost-cursor or equivalent for mouse movements before and during interactions
- Add random delays (500ms–3000ms) between page actions
- Simulate scroll before clicking
- Don't instantly fill forms — type character by character with randomized delays

### Layer 8: Session Persistence

- Maintain a pool of aged browser profiles (persisted cookies + localStorage)
- Pre-warm new profiles before using them on hCaptcha-protected pages
- Don't destroy and recreate profiles per task

### Layer 9 (Advanced): C++-Level Canvas/WebGL Patches

For the highest success rate, consider CloakBrowser's approach: a pre-built Chromium binary with 42 source-level patches. This is the only fully reliable way to produce authentic canvas/WebGL fingerprints from Linux Docker.

Alternative: If running on hardware with GPU, use Docker GPU passthrough for hardware-accelerated rendering.

---

## 10. What Definitely Does Not Work

Based on the research, these approaches are ineffective or insufficient:

1. **Basic playwright-stealth alone**: The plugin's own docs say "Don't expect this to bypass anything but the simplest bot detection." Confirmed 40-60% failure rate in 2025/2026.

2. **Datacenter proxies**: Categorically flagged. No amount of fingerprint patching overcomes datacenter ASN detection for hCaptcha.

3. **Headless mode without Xvfb**: Multiple confirmed reports of detection specifically from headless mode in Docker, even with other stealth patches applied.

4. **Solving captchas that appear via audio challenge**: hCaptcha's audio challenges have become harder and unreliable for automation.

5. **Rotating IPs per request**: IP consistency within a session matters. Rotating mid-session looks suspicious.

6. **Reusing tokens**: hCaptcha tokens are tied to session, challenge, and timestamp. Replay attacks are blocked server-side.

7. **Browser extensions for hCaptcha avoidance**: Specifically tested by the hCaptcha community (Privacy Pass was tested and failed in a real experiment).

---

## 11. Key Sources

- [hCaptcha fingerprinting script analysis (d4c5d1e0)](https://github.com/d4c5d1e0/hcaptcha) — Reverse engineering of the hCaptcha fingerprinting script; lists 40+ data points collected
- [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) — Drop-in Playwright replacement; fixes Runtime.Enable CDP leak and removes automation flags
- [rebrowser-patches](https://github.com/rebrowser/rebrowser-patches) — The Runtime.Enable fix for Playwright/Puppeteer; confirmed undetectable by Cloudflare/DataDome
- [CloakBrowser](https://github.com/CloakHQ/CloakBrowser) — 42 C++-level Chromium patches; passes 30+ detection tests; Docker-compatible
- [Botright](https://github.com/Vinyzu/Botright) — Real-fingerprint Playwright automation; ~956 stars; hCaptcha support uncertain
- [nodriver](https://github.com/ultrafunkamsterdam/nodriver) — CDP-direct Chrome automation; ~3,900 stars; successor to undetected-chromedriver
- [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra) — JS-level property patches; confirmed insufficient for modern hCaptcha
- [playwright-with-fingerprints (Bablosoft)](https://github.com/bablosoft/playwright-with-fingerprints) — Real fingerprint injection; no hCaptcha-specific evidence
- [ghost-cursor](https://github.com/Xetera/ghost-cursor) — Human-like mouse movement; behavioral layer only
- [undetected-chromedriver Docker issue #625](https://github.com/ultrafunkamsterdam/undetected-chromedriver/issues/625) — Confirmed: datacenter IPs cause hCaptcha detection even with stealth
- [hCaptcha difficulty settings](https://www.hcaptcha.com/post/how-hcaptcha-difficulty-settings-work) — Official docs on passive/enterprise modes
- [SeleniumBase UC Mode docs](https://seleniumbase.io/help_docs/uc_mode/) — Evidence of sometimes-working hCaptcha bypass
- [Rebrowser hCaptcha guide](https://rebrowser.net/blog/solving-incapsula-and-hcaptcha-complete-guide-to-imperva-security) — Imperva/hCaptcha detection signals breakdown
- [hCaptcha on residential proxies (Trend Micro)](https://www.trendmicro.com/vinfo/us/security/news/vulnerabilities-and-exploits/a-closer-exploration-of-residential-proxies-and-captcha-breaking-services) — Explains abuse rates on residential proxy networks
- [hCaptcha "Why classic fingerprinting no longer stops bots"](https://www.hcaptcha.com/post/why-classic-browser-fingerprinting-no-longer-stops-bots) — hCaptcha's own explanation of their modern detection approach
- [Skyvern CAPTCHA bypass comparison (2025)](https://www.skyvern.com/blog/best-way-to-bypass-captcha-for-ai-browser-automation-september-2025/) — Benchmarks: stealth plugins 40-60%, integrated AI 85%+
- [castle.io anti-detect evolution article](https://blog.castle.io/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/) — Generation-by-generation breakdown of detection and evasion techniques
- [Headful Playwright in Docker (Substack)](https://francomorero.substack.com/p/headful-scraping-with-playwright) — Practical guide to Xvfb + headed Playwright in Docker
- [ZenRows CAPTCHA proxy guide](https://www.zenrows.com/blog/captcha-proxies) — Proxy type comparison for CAPTCHA avoidance
