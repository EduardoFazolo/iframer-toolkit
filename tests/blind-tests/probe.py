"""One neutral page, one JS blob: what does the browser admit about itself?

Same JS in both engines. Flags the classic giveaways and OS/hardware consistency.
"""
import json
import re

PROBE_URL = "https://example.com/"

PROBE_JS = r"""
(() => {
  const gl = (() => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl') || c.getContext('experimental-webgl'); if (!g) return {}; const d = g.getExtension('WEBGL_debug_renderer_info'); return { vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR), renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) }; } catch (e) { return { err: String(e) }; } })();
  const n = navigator;
  return JSON.stringify({
    title: document.title, url: location.href, text: '',
    probe: {
      ua: n.userAgent, platform: n.platform, webdriver: n.webdriver, languages: n.languages,
      hw: n.hardwareConcurrency, mem: n.deviceMemory ?? null, plugins: n.plugins.length,
      chromeObj: typeof window.chrome, uaData: n.userAgentData ? { platform: n.userAgentData.platform, mobile: n.userAgentData.mobile, brands: n.userAgentData.brands.map(b => b.brand) } : null,
      screen: [screen.width, screen.height, screen.availWidth, screen.availHeight, screen.colorDepth, devicePixelRatio],
      inner: [innerWidth, innerHeight, outerWidth, outerHeight],
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffset: new Date().getTimezoneOffset(),
      touch: n.maxTouchPoints, gl,
      permissionsQuery: typeof n.permissions?.query,
      notif: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
      pdf: n.pdfViewerEnabled ?? null,
      cdpStack: (() => { try { const e = new Error(); Object.defineProperty(e, 'stack', { get() { window.__cdpLeak = true; return ''; } }); console.debug(e); return !!window.__cdpLeak; } catch (_) { return null; } })(),
    }
  });
})()
"""


def parse_probe(d):
    p = d.get("probe")
    if not p:
        return {"verdict": "unknown", "score": None, "detail": "no probe data"}
    fails, warns = [], []
    ua = p.get("ua", "")
    if "Headless" in ua:
        fails.append("UA says HeadlessChrome")
    if p.get("webdriver") is True:
        fails.append("navigator.webdriver=true")
    if p.get("cdpStack"):
        fails.append("console.debug stack leak (CDP Runtime.enable)")
    ua_os = "windows" if "Windows" in ua else "mac" if "Mac OS" in ua or "Macintosh" in ua else "linux" if "Linux" in ua else "?"
    plat = (p.get("platform") or "").lower()
    plat_os = "windows" if "win" in plat else "mac" if "mac" in plat else "linux" if "linux" in plat else "?"
    if ua_os != plat_os:
        fails.append(f"UA os={ua_os} but navigator.platform={p.get('platform')}")
    gl = p.get("gl") or {}
    r = (gl.get("renderer") or "") + " " + (gl.get("vendor") or "")
    if ua_os == "windows" and re.search(r"Apple M\d|Apple GPU|Metal", r):
        warns.append(f"UA Windows but GPU is Apple: {gl.get('renderer')}")
    if "SwiftShader" in r or "llvmpipe" in r:
        warns.append(f"software GPU renderer: {gl.get('renderer')}")
    if "Chrome" in ua and p.get("chromeObj") != "object":
        fails.append("Chrome UA but no window.chrome")
    if p.get("plugins") == 0 and "Firefox" not in ua:
        warns.append("0 plugins")
    if (p.get("hw") or 0) > 32:
        warns.append(f"hardwareConcurrency={p.get('hw')}")
    s = p.get("screen") or []
    if s and (s[0], s[1]) in ((800, 600), (1280, 720)) and p.get("inner", [0])[0] == s[0]:
        warns.append(f"default automation screen {s[0]}x{s[1]}, viewport == screen")
    if p.get("uaData") and p["uaData"].get("platform") and ua_os != "?":
        uad = p["uaData"]["platform"].lower()
        if (ua_os == "mac") != ("mac" in uad):
            fails.append(f"client hints platform={p['uaData']['platform']} vs UA {ua_os}")
    v = "fail" if fails else "partial" if warns else "pass"
    return {"verdict": v, "score": len(fails) * 2 + len(warns), "detail": "; ".join(fails + warns) or "consistent", "probe": p}
