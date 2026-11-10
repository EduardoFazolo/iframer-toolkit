// @ts-nocheck
/**
 * Standalone helpers that recipes carry with them: Next.js RSC flight parsing,
 * find-by-shape and pick. Serialized with Function.prototype.toString into
 * each recipe bundle, so it must not reference anything outside its body and
 * must not depend on the capture kit (recipes run in tabs without it).
 * Mirrors parseFlight/flightData/findByShape/pickPath in page-kit.ts.
 */
export function recipeCore() {
  function size(v) { try { return JSON.stringify(v === undefined ? null : v).length; } catch (e) { return 0; } }

  // RSC "flight" rows (id:payload). T rows carry a byte length, so parse bytes.
  function parseFlight(t) {
    var rows = {}, b = new TextEncoder().encode(t), dec = new TextDecoder(), i = 0, n = b.length;
    while (i < n) {
      var c = i;
      while (c < n && b[c] !== 58 && b[c] !== 10) c++;
      if (c >= n) break;
      if (b[c] === 10) { i = c + 1; continue; }
      var id = dec.decode(b.subarray(i, c)), j = c + 1;
      if (b[j] === 84) {
        var cm = j + 1;
        while (cm < n && b[cm] !== 44) cm++;
        var len = parseInt(dec.decode(b.subarray(j + 1, cm)), 16) || 0;
        rows[id] = { text: dec.decode(b.subarray(cm + 1, cm + 1 + len)) };
        i = cm + 1 + len;
        if (b[i] === 10) i++;
        continue;
      }
      var nl = j;
      while (nl < n && b[nl] !== 10) nl++;
      var p = dec.decode(b.subarray(j, nl));
      i = nl + 1;
      if (!/^[0-9a-f]+$/i.test(id)) continue;
      var tag = (/^[A-Z]+/.exec(p) || [""])[0];
      try { rows[id] = { tag: tag, v: JSON.parse(p.slice(tag.length)) }; } catch (e) {}
    }
    return rows;
  }

  // A Server Action's return value, or the props passed to client components.
  function flightData(rows) {
    function resolve(v, d) {
      if (d > 30) return null;
      if (typeof v === "string") {
        if (v.charAt(0) !== "$") return v;
        if (v === "$undefined") return undefined;
        if (v === "$NaN") return NaN;
        if (v === "$Infinity") return Infinity;
        if (v === "$-Infinity") return -Infinity;
        if (v === "$-0") return 0;
        if (/^\$D/.test(v)) return v.slice(2);                      // Date (ISO string)
        if (/^\$n-?\d+$/.test(v)) {                                 // BigInt: a number when it fits, else digits
          var big = Number(v.slice(2));
          return Number.isSafeInteger(big) ? big : v.slice(2);
        }
        var ref = /^\$([QWKhF])([0-9a-f]+)$/.exec(v);
        if (ref) {
          var row = rows[ref[2]] && rows[ref[2]].v;
          if (ref[1] === "Q") {                                       // Map -> object
            var mo = {};
            (Array.isArray(row) ? row : []).forEach(function (e) { if (Array.isArray(e)) mo[String(resolve(e[0], d + 1))] = resolve(e[1], d + 1); });
            return mo;
          }
          if (ref[1] === "W") return resolve(Array.isArray(row) ? row : [], d + 1); // Set -> array
          if (ref[1] === "K") return "[FormData]";
          // $h / $F: a Server Action passed as a prop (inline actions too). The row
          // holds the id of THIS render and its bound args, so calls stay correct
          // after deploys: read it from the page, never remember it.
          if (row && typeof row === "object" && typeof row.id === "string") {
            var bound = row.bound == null ? [] : resolve(row.bound, d + 1);
            return { $action: row.id, bound: Array.isArray(bound) ? bound : [] };
          }
          return "[server function]";
        }
        // "$9b:props:children:0:props:reservations:0:restaurant": React dedupes an
        // object already sent by pointing at its path inside another row.
        var pr = /^\$@?([0-9a-f]+):(.+)$/.exec(v);
        if (pr && rows[pr[1]] && rows[pr[1]].v !== undefined) {
          var node = rows[pr[1]].v, parts = pr[2].split(":");
          for (var pi = 0; pi < parts.length && node != null; pi++) {
            var part = parts[pi];
            if (typeof node === "string" && /^\$@?[0-9a-f]+(:|$)/.test(node)) node = resolve(node, d + 1);
            if (Array.isArray(node) && node[0] === "$" && node.length === 4 && (part === "props" || part === "type" || part === "key")) node = part === "props" ? node[3] : part === "type" ? node[1] : node[2];
            else node = node[part];
          }
          return resolve(node, d + 1);
        }
        var r = /^\$@?([0-9a-f]+)$/.exec(v);
        if (r && rows[r[1]] && rows[r[1]].v !== undefined) return resolve(rows[r[1]].v, d + 1);
        if (r && rows[r[1]] && rows[r[1]].text !== undefined) return rows[r[1]].text;
        return v.charAt(0) === "$" && v.charAt(1) === "$" ? v.slice(1) : v;
      }
      if (Array.isArray(v)) return v.map(function (x) { return resolve(x, d + 1); });
      if (v && typeof v === "object") {
        var o = {};
        Object.keys(v).forEach(function (k) { o[k] = resolve(v[k], d + 1); });
        return o;
      }
      return v;
    }
    var r0 = rows["0"] && rows["0"].v;
    // A Server Action reply: row 0 is {a:"$@1", f:"", b:"<build>"} with no route tree.
    // Page payloads can carry "a" too, next to their tree ("t", "c", or an "f" array).
    if (r0 && typeof r0 === "object" && !Array.isArray(r0) && typeof r0.a === "string" && /^\$@/.test(r0.a) &&
        !("t" in r0) && !("c" in r0) && !Array.isArray(r0.f)) return { action: resolve(r0.a, 0) };
    // Next streams redirects and server errors inside a 200: E rows with a digest.
    // forbidden()/unauthorized() answer 200 with a 401/403 digest: the page refused this session.
    var redirect = null, errors = [], denied = null;
    Object.keys(rows).forEach(function (id) {
      var r = rows[id];
      if (r.tag !== "E" || !r.v) return;
      var dg = String(r.v.digest || "");
      var m = /^NEXT_REDIRECT;[^;]*;([^;]+);/.exec(dg);
      if (m) redirect = m[1];
      else if (/^NEXT_HTTP_ERROR_FALLBACK;40[13]/.test(dg)) denied = dg.slice(-3);
      else if (/^NEXT_HTTP_ERROR_FALLBACK;404/.test(dg)) errors.push("404");
      else errors.push(dg || r.v.message || "error");
    });
    var names = {};
    Object.keys(rows).forEach(function (id) {
      var r = rows[id];
      if (r.tag !== "I" || !r.v) return;
      var nm = Array.isArray(r.v) ? r.v[2] : r.v.name;
      names["$L" + id] = nm && nm !== "default" && nm !== "*" ? nm : "Component" + id;
    });
    // Next.js's own router and boundary components: plumbing, not page data.
    function nextInternal(name, p) {
      return "parallelRouterKey" in p || "segmentPath" in p || "serverProvidedParams" in p ||
        /^(OutletBoundary|MetadataBoundary|ViewportBoundary|RootLayoutBoundary|HTTPAccessFallbackBoundary|ErrorBoundary|RenderFromTemplateContext|ClientPageRoot|ClientSegmentRoot|LayoutRouter|InnerLayoutRouter|AppRouter|ServerInsertedHTMLProvider|NotFoundBoundary|RedirectBoundary|IconMark|AsyncMetadataOutlet|StreamingMetadataOutlet)$/.test(name);
    }
    var comps = {}, seen = 0;
    function walk(v, d) {
      if (d > 60 || seen > 400 || !v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        if (v[0] === "$" && typeof v[1] === "string" && v.length === 4) {
          var props = v[3];
          if (props && typeof props === "object" && names[v[1]] && !nextInternal(names[v[1]], props)) {
            var data = {}, has = false;
            Object.keys(props).forEach(function (k) { if (k !== "children") { data[k] = resolve(props[k], 0); has = true; } });
            if (has) { seen++; (comps[names[v[1]]] = comps[names[v[1]]] || []).push(data); }
          }
          if (props && typeof props === "object") walk(props.children, d + 1);
          return;
        }
        v.forEach(function (x) { walk(x, d + 1); });
        return;
      }
      Object.keys(v).forEach(function (k) { walk(v[k], d + 1); });
    }
    var skip = fallbackRows(rows);
    Object.keys(rows).forEach(function (id) { if (!rows[id].tag && rows[id].v !== undefined && !skip[id]) walk(rows[id].v, 0); });
    Object.keys(comps).forEach(function (k) { if (comps[k].length === 1) comps[k] = comps[k][0]; });
    Object.defineProperty(comps, "__components", { enumerable: false, value: true });
    var out = { components: comps };
    // Server-rendered content, computed on demand (it can be large).
    Object.defineProperty(out, "nodes", { enumerable: false, get: function () { return nodes(rows); } });
    Object.defineProperty(out, "rows", { enumerable: false, value: rows });
    if (redirect) out.redirect = redirect;
    if (denied) out.denied = denied;
    if (errors.length) out.errors = errors;
    return out;
  }

  // First key of "a|b|c" that exists in o (field names differ between variants).
  function alt(o, tok) {
    var names = tok.replace(/\[\]$/, "").split("|");
    for (var i = 0; i < names.length; i++) if (o && typeof o === "object" && names[i] in o) return names[i];
    return null;
  }
  // "a.b" must exist; "a,b,c" means all of them; "a|b" means either.
  function hasPath(v, spec) {
    if (String(spec).indexOf(",") >= 0) return String(spec).split(",").every(function (p) { return hasPath(v, p.trim()); });
    var toks = String(spec).split(".");
    for (var i = 0; i < toks.length; i++) {
      while (Array.isArray(v)) v = v.length ? v[0] : undefined;
      if (!v || typeof v !== "object") return false;
      var t = alt(v, toks[i]);   // "rows|items": whichever this variant has
      if (t === null) return false;
      v = v[t];
    }
    return true;
  }

  // Candidates for a find: the shallowest matches only, identical copies merged
  // (a component rendered twice with the same data is one candidate).
  //   find:'Comp'     every distinct instance of that component
  //   find:'Comp[1]'  that instance
  function findAll(data, f) {
    var uniq = function (list) {
      var seen = {}, out = [];
      list.forEach(function (x) { var h = contentKey(x); if (!seen[h]) { seen[h] = 1; out.push(x); } });
      return out;
    };
    if (typeof f === "string" && data && data.__components) {
      var m = /^([A-Za-z_$][\w$]*)(?:\[(\d+)\])?$/.exec(f);
      if (m && Object.prototype.hasOwnProperty.call(data, m[1])) {
        var inst = [].concat(data[m[1]]);
        if (m[2] !== undefined) return inst[+m[2]] ? [inst[+m[2]]] : [];
        return uniq(inst);
      }
    }
    var test = typeof f === "function" ? function (x) { try { return !!f(x); } catch (e) { return false; } } : function (x) { return hasPath(x, f); };
    var level = data && data.__components ? Object.keys(data).reduce(function (a, k) { return a.concat(data[k]); }, []) : [data], depth = 0;
    while (level.length && depth < 12) {
      var hits = level.filter(function (x) { return x && typeof x === "object" && !Array.isArray(x) && test(x); });
      if (hits.length) return uniq(hits);
      var next = [];
      level.forEach(function (x) {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) { for (var i = 0; i < Math.min(x.length, 50); i++) next.push(x[i]); }
        else Object.keys(x).forEach(function (k) { next.push(x[k]); });
      });
      level = next.slice(0, 5000);
      depth++;
    }
    return [];
  }
  function contentKey(x) { var s; try { s = JSON.stringify(x); } catch (e) { s = String(Math.random()); } var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return s.length + ":" + h; }
  // The shape a recipe was learned on: the matched object's keys.
  function fingerprint(obj) { return obj && typeof obj === "object" && !Array.isArray(obj) ? Object.keys(obj).sort() : []; }
  // find, locked to a learned fingerprint: prefer the candidate whose keys include
  // all learned keys; if none does, it's a different list, not an answer.
  // Candidates with different key sets: the find could mean different things.
  // More than one distinct candidate: different components, or several instances
  // of one component with different data. Answering from either could be wrong.
  function ambiguity(all) { return all.length > 1 ? all : null; }
  // {keys} plus how many items each candidate has at the find path: that's what tells them apart.
  function describe(x, f) {
    var at = typeof f === "string" && !/^[A-Za-z_$][\w$]*(\[\d+\])?$/.test(f) ? f.split(",")[0] : null, v = at ? pick(x, at) : null, L = Array.isArray(v) ? null : listIn(x);
    return "{" + Object.keys(x).slice(0, 8).join(",") + "}" + (Array.isArray(v) ? " (" + at + ": " + v.length + " items)" : L ? " (" + L.key + ": " + L.list.length + " items)" : "");
  }
  function ambiguousMsg(f, amb) {
    var extra = Object.keys(amb[0]).filter(function (k) { return !(k in amb[1]); })[0] || Object.keys(amb[1]).filter(function (k) { return !(k in amb[0]); })[0];
    var name = typeof f === "string" && /^[A-Za-z_$][\w$]*$/.test(f) ? f : null;
    return "ambiguous find '" + f + "': matches " + amb.length + ": " + amb.slice(0, 4).map(function (x, i) { return "[" + i + "] " + describe(x, f); }).join(" | ") +
      ". " + (name ? "The component is rendered " + amb.length + " times with different data: pick one, e.g. find:'" + name + "[0]'"
        : extra ? "Add a key only the right one has, e.g. find:'" + f + "," + extra + "'" : "Use a more specific find");
  }
  function findLocked(data, f, fp) {
    var all = findAll(data, f);
    // "rows|payload" declares variants: any of them is right, so no lock to one shape.
    if (typeof f === "string" && f.indexOf("|") >= 0) fp = null;
    if (!fp || !fp.length) {
      var amb = ambiguity(all);
      if (amb) {
        var e0 = new Error(ambiguousMsg(f, amb));
        e0.ambiguous = true;
        throw e0;
      }
      return all[0];
    }
    var ok = all.filter(function (x) { return fp.every(function (k) { return k in x; }); });
    if (ok.length > 1) { var e1 = new Error(ambiguousMsg(f, ok)); e1.ambiguous = true; throw e1; }
    if (ok.length) return ok[0];
    var e = new Error("matched a different list: learned on {" + fp.join(",") + "}, found " + (all.length ? all.map(function (x) { return "{" + Object.keys(x).slice(0, 10).join(",") + "}"; }).join(" ") : "nothing"));
    e.missing = fp;
    throw e;
  }
  function find(data, f) { return findAll(data, f)[0]; }


  function pick(v, spec) {
    if (typeof spec === "function") return spec(v);
    if (Array.isArray(spec)) { var r = {}; spec.forEach(function (sp) { r[sp] = pick(v, sp); }); return r; }
    var toks = String(spec).match(/\{[^}]*\}|[^.]+/g) || [];
    function go(x, i) {
      if (i >= toks.length || x == null) return x;
      var t = toks[i].replace(/\[\]$/, "");
      if (Array.isArray(x) && t !== "length" && !/^\d+$/.test(t)) return x.map(function (y) { return go(y, i); });
      if (t.charAt(0) === "{") {
        // {status|state, restaurant.name|restaurantId}: the key is the name that
        // matched (nested paths allowed); none matched -> first name, undefined.
        var o = {};
        t.slice(1, -1).split(",").forEach(function (k) {
          k = k.trim(); if (!k) return;
          var alts = k.split("|"), hit = null;
          for (var ai = 0; ai < alts.length && hit === null; ai++) {
            var val = alts[ai].indexOf(".") >= 0 ? pick(x, alts[ai]) : x[alts[ai]];
            if (val !== undefined) { hit = alts[ai]; o[hit] = val; }
          }
          if (hit === null) o[alts[0]] = undefined;
        });
        return go(o, i + 1);
      }
      var a = t.indexOf("|") >= 0 ? alt(x, t) : t;
      return go(a === null ? undefined : x[a], i + 1);
    }
    return go(v, 0);
  }

  // ── Answering a question without sending the list back ───────────────────
  // where: "tablesNeeded>0", "status=PUBLISHED", "href~?id=", "a!=b", joined by "&";
  // or a function. No eval: works under strict CSP.
  function cond(spec) {
    if (typeof spec === "function") return spec;
    var parts = String(spec).split("&").map(function (c) {
      var m = /^\s*([\w$.|]+)\s*(>=|<=|!=|=|>|<|~|!~)\s*(.*?)\s*$/.exec(c);
      if (!m) throw new Error("bad where: " + c + " (use key>1, key=val, key~text)");
      return { key: m[1], op: m[2], val: m[3] };
    });
    return function (x) {
      return parts.every(function (p) {
        var v = pick(x, p.key), want = p.val, n = Number(want);
        if (want === "null") want = null;
        switch (p.op) {
          case "=": return v == want || String(v) === String(want);
          case "!=": return !(v == want || String(v) === String(want));
          case ">": return Number(v) > n;
          case "<": return Number(v) < n;
          case ">=": return Number(v) >= n;
          case "<=": return Number(v) <= n;
          case "~": return String(v == null ? "" : v).toLowerCase().indexOf(String(want).toLowerCase()) >= 0;
          case "!~": return String(v == null ? "" : v).toLowerCase().indexOf(String(want).toLowerCase()) < 0;
        }
      });
    };
  }
  function shapeChanged(missing, sample) {
    var e = new Error("shape changed: missing " + missing.join(", ") + (sample && typeof sample === "object" ? " (items have: " + Object.keys(sample).slice(0, 15).join(", ") + ")" : ""));
    e.missing = missing;
    return e;
  }
  // For --run recipes: throws "shape changed" when any path is missing.
  function need(v, paths) {
    var miss = [].concat(paths).filter(function (p) { return !hasPath(v, p); });
    if (miss.length) throw shapeChanged(miss, Array.isArray(v) ? v[0] : v);
    return v;
  }
  // pick, but a path or field that matches nothing is an error, not undefined.
  function strictPick(v, spec) {
    if (typeof spec === "function" || Array.isArray(spec)) return pick(v, spec);
    var out = pick(v, spec);
    if (out === undefined) throw shapeChanged([String(spec)], v);
    var m = /\{([^}]*)\}$/.exec(String(spec));
    if (m) {
      var rows = Array.isArray(out) ? out : [out];
      if (rows.length) {
        var gone = m[1].split(",").map(function (k) { return k.trim(); }).filter(function (k) {
          if (!k) return false;
          return !rows.some(function (r) { return r && Object.keys(r).some(function (rk) { return k.split("|").indexOf(rk) >= 0 && r[rk] !== undefined; }); });
        });
        if (gone.length) throw shapeChanged(gone, null);
      }
    }
    return out;
  }

  // One pipeline for kit calls and recipes, so a filter can never be skipped:
  //   pick "a.b.list.{x,y}" = list path "a.b.list" + fields "{x,y}"
  //   1. go to the list path   2. where/sort on that list (all fields available)
  //   3. keep fields           4. group/count/limit
  // where/sort/group/count with no list to work on is an error, never a no-op.
  function answer(data, o) {
    var prefix = "", fields = null, fn = null;
    if (typeof o.pick === "function" || Array.isArray(o.pick)) fn = o.pick;
    else if (o.pick !== undefined) {
      var m = /^(.*?)\.?(\{[^}]*\})$/.exec(String(o.pick));
      if (m) { prefix = m[1]; fields = m[2]; } else prefix = String(o.pick);
    }
    var t = prefix ? strictPick(data, prefix) : data;
    var needList = o.where !== undefined || o.group !== undefined || o.count || o.limit;
    var lk = null;
    if (needList && !fn) {
      var L = listIn(t);
      if (!L) throw new Error("where/group/count need a list: point pick at it (e.g. pick:'data.items'). Got " + (t === null ? "null" : Array.isArray(t) ? "array" : typeof t) + (t && typeof t === "object" ? " with keys " + Object.keys(t).slice(0, 12).join(", ") : ""));
      lk = L.key;
      if (o.where !== undefined) t = query(t, { where: o.where, key: lk });
    }
    if (fields) {
      // Fields apply to the list only when where/sort/group/count chose it; otherwise to t itself.
      var L2 = lk ? listIn(t, lk) : null;
      t = L2 && !Array.isArray(t) ? L2.set(strictPick(L2.list, fields)) : strictPick(t, fields);
    }
    if (fn) t = typeof fn === "function" ? fn(t) : pick(t, fn);
    if (needList && fn && o.where !== undefined) t = query(t, { where: o.where });
    if (o.group !== undefined || o.count || o.limit) t = query(t, { group: o.group, count: o.count, limit: o.limit, key: lk });
    return t;
  }

  // ── Schema: one rule ────────────────────────────────────────────────────
  // Every list of objects (records) with all its keys and one sample row.
  // Nothing else: no layout guessing, no dictionaries, no scalars. Zoom with
  // {schema:{under:'Comp.path'}}. Samples: values cut to 24 chars, emails masked,
  // anything under a key named like name/email/phone masked.
  var SENSITIVE_KEY = /name|email|phone/i;
  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  function sampleVal(v, d, key) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "string") {
      if (key && SENSITIVE_KEY.test(key)) return JSON.stringify(v.charAt(0) + "…");
      var s = v.replace(EMAIL, "…@…");
      return JSON.stringify(s.length > 24 ? s.slice(0, 23) + "…" : s);
    }
    if (typeof v !== "object") return String(v);
    if (Array.isArray(v)) return "[" + v.length + "]";
    var ks = Object.keys(v);
    if (d >= 2) return "{" + ks.slice(0, 6).join(",") + (ks.length > 6 ? ",…" : "") + "}";
    // every key listed; values for the first 6
    return "{" + ks.map(function (k, i) { return i < 6 ? k + ":" + sampleVal(v[k], d + 1, k) : k; }).join(", ") + "}";
  }
  function isRecordList(v) { return Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === "object" && !Array.isArray(v[0]); }
  function schema(data, o) {
    o = o || {};
    var lines = [], LIMIT = 1500;
    function walk(path, v, d) {
      if (d > 8 || v == null || typeof v !== "object") return;
      if (v.$action) { lines.push(path + " = Server Action prop (recipe: --action-prop " + path.split(".").pop() + ")"); return; }
      if (Array.isArray(v)) {
        if (!isRecordList(v)) return;
        lines.push(path + "[" + v.length + "] " + fmtBytes(size(v)) + "  " + sampleVal(v[0], 0));
        Object.keys(v[0]).forEach(function (k) { walk(path + "[]." + k, v[0][k], d + 1); });
        return;
      }
      Object.keys(v).forEach(function (k) { walk(path ? path + "." + k : k, v[k], d + 1); });
    }
    if (data && data.components) {
      Object.keys(data.components).forEach(function (n) {
        var c = data.components[n];
        if (o.under && n !== o.under.split(".")[0]) return;
        var start = Array.isArray(c) ? c[0] : c, base = n;
        var distinct = Array.isArray(c) ? findAll(data.components, n).length : 1;
        if (distinct > 1 && !o.under) lines.push(n + " ×" + distinct + " instances with different data (paths below are [0]); select one with find:'" + n + "[i]'");
        if (o.under && o.under.indexOf(".") > 0) { start = pick(start, o.under.split(".").slice(1).join(".")); base = o.under; }
        walk(base, start, 0);
      });
    } else walk(o.under || "", o.under ? pick(data, o.under) : data, 0);
    if (data && data.rows) {
      var byTag = {};
      nodes(data.rows).forEach(function (n) { (byTag[n.tag] = byTag[n.tag] || []).push(n); });
      Object.keys(byTag).forEach(function (t) {
        if (byTag[t].length < 2) return;
        var ex = byTag[t][0];
        lines.push("nodes:" + t + "[" + byTag[t].length + "]  " + sampleVal(ex.href ? { href: ex.href, text: ex.text } : { text: ex.text }, 0));
      });
    }
    var out = ["# find:'<1st part>' pick:'<rest>'. Lists of records only; zoom: {schema:{under:'Comp.path'}}"], used = 0, more = 0;
    lines.forEach(function (l) {
      if (l.length > 260) l = l.slice(0, 259) + "…";
      if (used + l.length > LIMIT) { more++; return; }
      out.push(l); used += l.length + 1;
    });
    if (!lines.length) out.push("(no lists of records; try {nodes:'a'} or call without schema)");
    if (more) out.push("# +" + more + " more: zoom with {schema:{under:'Comp.path'}}");
    return out.join("\n");
  }
  function sigOf(v) { return v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort().join(",") : ""; }
  function fmtBytes(n) { return n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + "KB" : n + "B"; }

  // The first list in v (v itself, or the biggest array property), so a filter
  // can run after find without naming the list.
  function listIn(v, key) {
    if (Array.isArray(v)) return { list: v, set: function (l) { return l; } };
    if (v && typeof v === "object") {
      var best = key && Array.isArray(v[key]) ? key : null;
      if (!best) Object.keys(v).forEach(function (k) { if (Array.isArray(v[k]) && (!best || v[k].length > v[best].length)) best = k; });
      if (best) return { key: best, list: v[best], set: function (l) { var o = Object.assign({}, v); o[best] = l; return o; } };
    }
    return null;
  }
  // q: {where, group, count, limit}. Applied to the first list in data.
  function query(data, q) {
    if (!q || (q.where === undefined && q.group === undefined && !q.count && !q.limit)) return data;
    var L = listIn(data, q.key);
    if (!L) return data;
    var list = L.list;
    // A key no item has means the site changed (or a typo): never answer 0 for it.
    var keysOf = function (spec) {
      if (typeof spec !== "string") return [];
      return spec.split("&").map(function (c) { return (/^\s*([\w$.|]+)/.exec(c) || [])[1]; }).filter(Boolean);
    };
    var mustHave = keysOf(q.where).concat(q.group !== undefined ? [String(q.group)] : []);
    var missing = mustHave.filter(function (k) { return list.length && !list.some(function (x) { return x && typeof x === "object" && pick(x, k) !== undefined; }); });
    if (missing.length) throw shapeChanged(missing, list[0]);
    if (q.where !== undefined) list = list.filter(cond(q.where));
    if (q.group !== undefined) {
      var g = {};
      list.forEach(function (x) { var k = String(pick(x, q.group)); g[k] = (g[k] || 0) + 1; });
      return { count: list.length, by: g };
    }
    if (q.count) return list.length;
    if (q.limit) list = list.slice(0, q.limit);
    return L.set(list);
  }

  // Server-rendered elements (no client component props): links, list items,
  // rows, headings, with their text. Lets plain HTML lists be queried too.
  var FALLBACK_PROP = /^(notFound|forbidden|unauthorized|error|errorStyles|errorScripts|notFoundStyles)$/;
  // Rows that hold Next's fallback UI (the app's not-found/forbidden/error pages):
  // reached through a fallback prop like "notFound":["$L29",…], shipped with every
  // page, never shown. Content only reachable from there is skipped.
  function fallbackRows(rows) {
    var skip = {}, todo = [];
    var refs = function (v, d, out) {
      if (d > 30 || v == null) return;
      if (typeof v === "string") { var m = /^\$(?:L|@)?([0-9a-f]+)$/.exec(v); if (m && rows[m[1]] && !rows[m[1]].tag) out.push(m[1]); return; }
      if (typeof v === "object") Object.keys(v).forEach(function (k) { refs(v[k], d + 1, out); });
    };
    var scan = function (v, d) {
      if (!v || typeof v !== "object" || d > 60) return;
      if (!Array.isArray(v)) Object.keys(v).forEach(function (k) { if (FALLBACK_PROP.test(k)) refs(v[k], 0, todo); });
      Object.keys(v).forEach(function (k) { scan(v[k], d + 1); });
    };
    Object.keys(rows).forEach(function (id) { if (!rows[id].tag) scan(rows[id].v, 0); });
    while (todo.length) { var id = todo.pop(); if (skip[id]) continue; skip[id] = 1; refs(rows[id].v, 0, todo); }
    return skip;
  }
  var NODE_TAGS = /^(a|li|tr|td|th|h[1-6]|p|button|option|label|dt|dd|time|span|strong|code)$/;
  function nodes(rows, tag) {
    var out = [];
    function text(v, d) {
      if (v == null || d > 40) return "";
      if (typeof v === "string") return v.charAt(0) === "$" ? "" : v;
      if (typeof v === "number") return String(v);
      if (Array.isArray(v)) {
        if (v[0] === "$" && v.length === 4) return text(v[3] && v[3].children, d + 1);
        return v.map(function (x) { return text(x, d + 1); }).join(" ");
      }
      return "";
    }
    var want = function (t) { return !tag || tag === "*" || tag.split("|").indexOf(t) >= 0; };
    // Distinct hrefs of links inside (host <a> or a link component).
    function linksIn(v, d) {
      var found = [];
      (function scan(x, dd) {
        if (!x || typeof x !== "object" || dd > 20 || found.length > 2) return;
        if (Array.isArray(x)) {
          if (x[0] === "$" && x.length === 4 && x[3] && typeof x[3] === "object") {
            var h = typeof x[3].href === "string" ? x[3].href : null;
            if (h && found.indexOf(h) < 0) found.push(h);
            scan(x[3].children, dd + 1);
            return;
          }
          x.forEach(function (y) { scan(y, dd + 1); });
        }
      })(v, d);
      return found;
    }
    // href: the nearest enclosing link, so a row inside <Link> still knows where it goes.
    function walk(v, d, href) {
      if (!v || typeof v !== "object" || d > 80 || out.length >= 3000) return;
      if (Array.isArray(v)) {
        // A client component with an href (Next's Link and similar) renders a link.
        if (v[0] === "$" && typeof v[1] === "string" && v.length === 4 && v[1].charAt(0) === "$") {
          var cp = v[3] || {};
          var ch = typeof cp.href === "string" ? cp.href : cp.href && typeof cp.href.pathname === "string" ? cp.href.pathname : null;
          if (ch && want("a")) {
            var lt = text(cp.children, 0).replace(/\s+/g, " ").trim().slice(0, 300);
            out.push({ tag: "a", text: lt, href: ch });
          }
          // Next's fallbacks (not-found/forbidden/error UI) ship with every page: not content.
          if (cp && typeof cp === "object") Object.keys(cp).forEach(function (k) { if (!FALLBACK_PROP.test(k)) walk(cp[k], d + 1, ch || href); });
          return;
        }
        if (v[0] === "$" && typeof v[1] === "string" && v.length === 4 && v[1].charAt(0) !== "$") {
          var p = v[3] || {};
          var here = typeof p.href === "string" ? p.href : href;
          if (NODE_TAGS.test(v[1]) && want(v[1])) {
            var t = text(p.children, 0).replace(/\s+/g, " ").trim().slice(0, 300);
            if (t || here) {
              var n = { tag: v[1], text: t };
              if (!here && v[1] !== "a") { var inner = linksIn(p.children, 0); if (inner.length === 1) here = inner[0]; }
              if (here) n.href = here;
              if (p.id) n.id = p.id;
              if (p.value !== undefined) n.value = p.value;
              if (p.dateTime) n.dateTime = p.dateTime;
              out.push(n);
            }
          }
          walk(p.children, d + 1, here);
          return;
        }
        v.forEach(function (x) { walk(x, d + 1, href); });
        return;
      }
      Object.keys(v).forEach(function (k) { walk(v[k], d + 1, href); });
    }
    var skip = fallbackRows(rows);
    Object.keys(rows).forEach(function (id) { if (!rows[id].tag && rows[id].v !== undefined && !skip[id]) walk(rows[id].v, 0); });
    return out;
  }

  // Where requests go. In a page: relative paths, the tab's cookies and the
  // auth sources the page uses. In Node (setTransport): an absolute base, a
  // Cookie header and auth header values from the environment.
  var NET = { base: null, cookie: null, env: null, actions: {}, relogin: "log in again in this tab", onExpired: null };
  var inPage = typeof document !== "undefined" && typeof location !== "undefined";
  function abs(p) { return NET.base ? new URL(p, NET.base).href : p; }
  function origin() { return NET.base ? new URL(NET.base).origin : location.origin; }
  function here() { return inPage && !NET.base ? location.pathname + location.search : "/"; }

  // Server Action ids sit next to their export names in the page's JS chunks.
  // live: read the script list from a fresh copy of the page instead of this
  // tab's (which may predate a deploy), and skip the HTTP cache.
  function scriptsOf(live, page) {
    if (!live && inPage && !NET.base) {
      var s0 = {};
      [].slice.call(document.scripts).forEach(function (s) { if (s.src) s0[s.src] = 1; });
      performance.getEntriesByType("resource").forEach(function (r) { if (r.initiatorType === "script" || /\.js(\?|$)/.test(r.name)) s0[r.name] = 1; });
      return Promise.resolve(Object.keys(s0));
    }
    var url = abs(page || here());
    return send(url, { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (html) {
      var out = [], re = /<script[^>]+src="([^"]+)"/g, x;
      while ((x = re.exec(html))) out.push(new URL(x[1].replace(/&amp;/g, "&"), NET.base ? url : location.href).href);
      return out;
    });
  }
  function actionId(name, live, page) {
    var known = NET.actions[name];
    if (known && !live) return Promise.resolve(known.id);
    return scriptsOf(live || !inPage || !!NET.base, page || (known && known.page)).then(function (list) { return scanFor(name, list, live); });
  }
  function scanFor(name, list, live) {
    var urls = list.filter(function (s) { try { var u = new URL(s, NET.base || location.href); return u.origin === origin() && /\/_next\//.test(u.pathname); } catch (e) { return false; } });
    var re = /\(\s*"([0-9a-f]{40,44})"\s*,[^"()]{0,200}?,\s*"([A-Za-z_$][\w$]*)"\s*\)/g;
    return Promise.all(urls.map(function (u) {
      return send(u, { cache: live ? "no-store" : "default" }).then(function (r) { return r.text(); }).then(function (t) {
        var x, hit = null;
        re.lastIndex = 0;
        while ((x = re.exec(t))) if (x[2] === name || x[1] === name) hit = x[1];
        return hit;
      }, function () { return null; });
    })).then(function (ids) { return ids.filter(Boolean)[0] || null; });
  }

  // React's reply encoding for plain arguments: "$" strings escaped, Dates, undefined, BigInt.
  function encodeArgs(v) {
    if (typeof v === "string") return v.charAt(0) === "$" ? "$" + v : v;
    if (v === undefined) return "$undefined";
    if (typeof v === "bigint") return "$n" + v.toString();
    if (v instanceof Date) return "$D" + v.toISOString();
    if (Array.isArray(v)) return v.map(encodeArgs);
    if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = encodeArgs(v[k]); }); return o; }
    return v;
  }
  // Bound args were decoded from the page's data; put them back as they came.
  function reEncode(v) {
    if (typeof v === "string") return v.charAt(0) === "$" ? "$" + v : v;
    if (Array.isArray(v)) return v.map(reEncode);
    if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = reEncode(v[k]); }); return o; }
    return v === undefined ? "$undefined" : v;
  }
  // A Server Action passed as a prop: fetch the page's data, find the props
  // object by shape, take the prop. Returns {$action, bound} from this render.
  function actionRef(from) {
    return get(from.path, { rsc: true, find: from.find }).then(function (d) {
      var obj = find(d && d.components ? d.components : d, from.find);
      var ref = obj && obj[from.prop];
      if (!ref || !ref.$action) throw new Error("action prop " + from.prop + " not found on " + from.path + " (page changed?)");
      return ref;
    });
  }

  // Auth headers. In a page: rebuilt from where the page keeps them (names only
  // were recorded): localStorage/sessionStorage key (+ JSON path), cookie, <meta>.
  // In Node: the value of the env var named after the header (x-api-key -> X_API_KEY).
  var AUTH = {};
  function envName(h) { return h.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase(); }
  function authHeaders() {
    var out = {};
    Object.keys(AUTH).forEach(function (name) {
      var s = AUTH[name], v = null;
      try {
        if (NET.env) v = NET.env[envName(name)];
        else if (s.from === "localStorage" || s.from === "sessionStorage") {
          v = window[s.from] && window[s.from].getItem(s.key);
          if (v != null && (s.json || s.path)) { v = JSON.parse(v); (s.path || []).forEach(function (k) { v = v == null ? v : v[k]; }); }
        } else if (s.from === "cookie") {
          document.cookie.split(/;\s*/).forEach(function (c) { if (c.indexOf(s.key + "=") === 0) v = decodeURIComponent(c.slice(s.key.length + 1)); });
        } else if (s.from === "meta") {
          var m = document.querySelector('meta[name="' + s.key + '"]');
          v = m && m.getAttribute("content");
        }
      } catch (e) { v = null; }
      if (typeof v === "string" && v) out[name] = NET.env && s.prefix && v.indexOf(s.prefix) === 0 ? v : (s.prefix || "") + v;
    });
    return out;
  }
  // One HTTP request with the session attached (Cookie header outside a page).
  function send(url, init) {
    init = Object.assign({ credentials: "include" }, init || {});
    if (NET.cookie) init.headers = Object.assign({ cookie: NET.cookie }, init.headers || {});
    return fetch(abs(url), init);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var LOGIN = /\/(login|log-in|signin|sign-in|auth|sso)(\/|\?|$)/i;

  // One request -> data. Page data needs the RSC header on Next.js. GETs retry
  // on 5xx and network errors (o.retry, default 2); 403/429/bot walls stop.
  function get(path, o, attempt) {
    o = o || {};
    attempt = attempt || 0;
    var method = o.method || "GET";
    var retries = o.retry != null ? o.retry : method === "GET" ? 2 : 0;
    var h = Object.assign({}, authHeaders(), o.headers || {});
    if (o.rsc) h.RSC = "1";
    var again = function (why) {
      if (attempt >= retries) throw new Error(why);
      return sleep(300 * Math.pow(2, attempt)).then(function () { return get(path, o, attempt + 1); });
    };
    // A stale session: let the host refresh it once (client.mjs re-reads the logged-in browser), then retry.
    var refreshed = function (e) {
      if (o._fresh || !NET.onExpired || !/^(session expired|HTTP 401)/.test(e && e.message || "")) throw e;
      return Promise.resolve(NET.onExpired()).then(function (ok) {
        if (!ok) throw e;
        return get(path, Object.assign({}, o, { _fresh: true }), attempt);
      });
    };
    return send(path, { method: method, headers: h, body: o.body }).then(function (r) {
      return r.text().then(function (t) {
        if (r.redirected && LOGIN.test(new URL(r.url).pathname)) throw new Error("session expired: " + NET.relogin);
        if (r.status === 401) throw new Error("HTTP 401: not logged in, or the session expired: " + NET.relogin);
        if (r.status === 403 || r.status === 429 || /captcha|cf-chl|are you a robot/i.test(t.slice(0, 3000))) {
          var ra = r.headers.get("retry-after");
          throw new Error("stopped: HTTP " + r.status + (ra ? " (retry-after " + ra + ")" : "") + " or bot wall");
        }
        if (r.status >= 500) return again("HTTP " + r.status + " after " + (attempt + 1) + " tries");
        if (!r.ok) throw new Error("HTTP " + r.status);
        var d;
        if (/text\/x-component/i.test(r.headers.get("content-type") || "")) {
          d = flightData(parseFlight(t));
          if (d.redirect && LOGIN.test(d.redirect)) throw new Error("session expired: " + NET.relogin);
          if (d.redirect) throw new Error("redirected to " + d.redirect);
          if (d.denied) throw new Error("session expired, or this account can't see " + path + " (the page answered " + d.denied + "): " + NET.relogin);
          if (d.action !== undefined) d = d.action;
          // A render that errored on the server: retry while the wanted shape is missing.
          else if (d.errors && o.find !== undefined && find(d.components, o.find) === undefined) {
            return again("page errored on the server (" + d.errors[0] + ") after " + (attempt + 1) + " tries");
          }
        } else {
          try { d = JSON.parse(t); } catch (e) {
            if (/html/i.test(r.headers.get("content-type") || "") && /<input[^>]+type=["']?password/i.test(t)) throw new Error("session expired (got a login page): " + NET.relogin);
            throw new Error("not data (got " + (r.headers.get("content-type") || "text") + ")");
          }
        }
        return d;
      });
    }, function (e) {
      if (/^(session|stopped|HTTP)/.test(e.message)) throw e;
      return again("network: " + e.message);
    }).catch(refreshed);
  }

  // target: export name or id (looked up in the page's JS), a {$action, bound}
  // reference, or {path, find, prop} to read the reference from a page first.
  function action(target, args, path) {
    var resolveRef = target && typeof target === "object"
      ? (target.$action ? Promise.resolve(target) : actionRef(target).then(function (r) { path = path || target.path; return r; }))
      : actionId(target, false, path).then(function (id) {
        if (!id) throw new Error("action " + target + " not found" + (inPage && !NET.base ? " on this page: open a page that uses it" : ": pass the page that uses it"));
        return { $action: id, bound: [] };
      });
    return resolveRef.then(function (ref) {
      var body = reEncode(ref.bound || []).concat(encodeArgs(args || []));
      var known = typeof target === "string" && NET.actions[target];
      var post = function (id) {
        return get(path || (known && known.page) || here(), {
          method: "POST", body: JSON.stringify(body),
          headers: { "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
        });
      };
      return post(ref.$action).catch(function (e) {
        // Stale id (this tab predates a deploy): the server says 404/409. Read the
        // live page again and retry once with the current id.
        if (!/HTTP (404|409)/.test(e.message)) throw e;
        if (target && typeof target === "object" && !target.$action) return actionRef(target).then(function (r2) { body = reEncode(r2.bound || []).concat(encodeArgs(args || [])); return post(r2.$action); });
        if (typeof target === "string") return actionId(target, true, path).then(function (id) { if (!id || id === ref.$action) throw e; return post(id); });
        throw e;
      });
    });
  }

  return {
    parseFlight: parseFlight, flightData: flightData, find: find, pick: pick, get: get, action: action, actionRef: actionRef,
    encodeArgs: encodeArgs, reEncode: reEncode, size: size, sleep: sleep, actionId: actionId,
    query: query, cond: cond, nodes: nodes, listKey: function (v) { var L = listIn(v); return L && L.key; },
    schema: schema, need: need, strictPick: strictPick, answer: answer, sigOf: sigOf,
    findAll: findAll, findLocked: findLocked, fingerprint: fingerprint, ambiguity: ambiguity, describe: describe, ambiguousMsg: ambiguousMsg,
    setAuth: function (a) { AUTH = a || {}; }, authHeaders: authHeaders,
    setTransport: function (t) { Object.keys(t || {}).forEach(function (k) { NET[k] = t[k]; }); }, envName: envName,
  };
}

/**
 * Runs one recipe spec with a core. Shared by the Node client (client.mjs) and
 * the in-page bundle, serialized like recipeCore. fps: {get() -> map, set(map)}
 * keeps the shape each recipe first matched, so a different list with the
 * same path is an error instead of an answer.
 */
export function recipeRunner(core, fps) {
  function fill(t, a) {
    if (typeof t === "string") return t.replace(/\{([A-Za-z_$][\w$]*)\}/g, function (_, k) { if (a[k] === undefined) throw new Error("missing arg " + k); return t.charAt(0) === "/" ? String(a[k]).split("/").map(encodeURIComponent).join("/") : a[k]; });
    if (Array.isArray(t)) return t.map(function (x) { return fill(x, a); });
    if (t && typeof t === "object") {
      var o = {};
      Object.keys(t).forEach(function (k) {
        var v = t[k];
        o[k] = typeof v === "string" && /^\{[A-Za-z_$][\w$]*\}$/.test(v) ? (function (n) { if (a[n] === undefined) throw new Error("missing arg " + n); return a[n]; })(v.slice(1, -1)) : fill(v, a);
      });
      return o;
    }
    return t;
  }
  return function run(spec, a, max) {
    a = a || {};
    max = max || 4000;
    return Promise.resolve().then(function () {
      if (spec.run) return spec.run(core, a);
      var p = spec.path ? fill(spec.path, a) : undefined;
      if (spec.actionProp) return core.action({ path: p, find: spec.find, prop: spec.actionProp }, fill(spec.args || [], a), p);
      return spec.action ? core.action(spec.action, fill(spec.args || [], a), p) : core.get(p, { rsc: spec.rsc, find: spec.find });
    }).then(function (d) {
      if (spec.nodes && !spec.run) { if (!d || !d.rows) throw new Error("nodes needs a Next.js page (RSC) response"); d = core.nodes(d.rows, spec.nodes); }
      if (spec.find !== undefined && !spec.actionProp && !spec.run && !spec.nodes) {
        var all = fps.get(), fp = spec.fp || all[spec.name];
        var f = core.findLocked(d && d.components ? d.components : d, spec.find, fp);
        if (f === undefined) throw new Error("shape not found (site changed?): " + (spec.findText || spec.find));
        if (!fp && spec.name && typeof spec.find === "string" && spec.find.indexOf("|") < 0) { all[spec.name] = core.fingerprint(f); fps.set(all); }
        d = f;
      }
      if (!spec.run) d = core.answer(d, spec);
      var line = spec.format ? spec.format(d, a) : d;
      line = typeof line === "string" ? line : JSON.stringify(line);
      return line.length > max ? line.slice(0, max) + " …(" + line.length + " chars: tighten pick/format)" : line;
    }).catch(function (e) { return "error: " + (e && e.message || e); });
  };
}
