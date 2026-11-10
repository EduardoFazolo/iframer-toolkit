import { describe, expect, test } from "bun:test";
import { recipeCore } from "../../src/lib/kit/recipe-core";

const core = recipeCore();
const flight = (...rows: string[]) => rows.join("\n") + "\n";

describe("flight parsing (Next.js RSC)", () => {
  test("client component props, Next internals left out", () => {
    const d = core.flightData(core.parseFlight(flight(
      `1:I["1",[],"default"]`,
      `2:I["2",[],"default"]`,
      `0:["$","$L1",null,{"parallelRouterKey":"children","template":"x","children":["$","$L2",null,{"rows":[{"id":1}],"team":"core"}]}]`,
    )));
    expect(d.components).toEqual({ Component2: { rows: [{ id: 1 }], team: "core" } });
  });

  test("Map, Set, BigInt, Date, undefined decode to plain data", () => {
    const d = core.flightData(core.parseFlight(flight(
      `0:{"a":"$@1","f":"","b":"x"}`,
      `1:{"m":"$Q2","s":"$W3","n":"$n42","big":"$n9007199254740993","when":"$D2026-01-02T00:00:00.000Z","u":"$undefined","esc":"$$dollar"}`,
      `2:[["a",1],["b",2]]`,
      `3:["x","y"]`,
    )));
    expect(d.action).toEqual({ m: { a: 1, b: 2 }, s: ["x", "y"], n: 42, big: "9007199254740993", when: "2026-01-02T00:00:00.000Z", u: undefined, esc: "$dollar" });
  });

  test("an action passed as a prop resolves to its id and bound args", () => {
    const d = core.flightData(core.parseFlight(flight(
      `1:I["1",[],"default"]`,
      `2:{"id":"60cd3452aa","bound":"$@3"}`,
      `3:["$@4",1]`,
      `4:"enc:abc"`,
      `0:["$","$L1",null,{"rows":[],"close":"$h2"}]`,
    )));
    expect(d.components.Component1.close).toEqual({ $action: "60cd3452aa", bound: ["enc:abc", 1] });
    expect(core.reEncode(["$x", 1])).toEqual(["$$x", 1]);
  });

  test("redirects and server errors streamed inside a 200", () => {
    expect(core.flightData(core.parseFlight(flight(`b:E{"digest":"NEXT_REDIRECT;replace;/login;307;"}`))).redirect).toBe("/login");
    expect(core.flightData(core.parseFlight(flight(`b:E{"digest":"343463367"}`))).errors).toEqual(["343463367"]);
  });

  test("T rows use byte lengths (multibyte text)", () => {
    const txt = "Café ✓ ok";
    const d = core.flightData(core.parseFlight(`1:I["1",[],"Note"]\n2:T${Buffer.byteLength(txt).toString(16)},${txt}\n0:["$","$L1",null,{"body":"$2"}]\n`));
    expect(d.components.Note.body).toBe(txt);
  });
});

describe("find and pick across variants", () => {
  const A = { components: { C1: { team: "core", rows: [{ id: 1, status: "open" }, { id: 2, status: "done" }] } } };
  const B = { components: { C9: { meta: { team: "core" }, payload: { items: [{ id: 1, state: "open" }] } } } };

  test("alternatives: rows|payload, status|state", () => {
    expect(core.find(A.components, "rows|payload")).toBe(A.components.C1);
    expect(core.find(B.components, "rows|payload")).toBe(B.components.C9);
    expect(core.find(A.components, "rows.status|state")).toBe(A.components.C1);
    expect(core.pick(A.components.C1, "rows.{id,status|state}")).toEqual([{ id: 1, status: "open" }, { id: 2, status: "done" }]);
    // the key is the name that matched
    expect(core.pick({ items: [{ id: 1, state: "open" }] }, "items.{id,status|state}")).toEqual([{ id: 1, state: "open" }]);
    expect(core.pick({ r: [{ restaurant: { name: "Bistro" } }, { restaurantId: 7 }] }, "r.{restaurant.name|restaurantId}")).toEqual([{ "restaurant.name": "Bistro" }, { restaurantId: 7 }]);
  });

  test("comma means all keys", () => {
    expect(core.find(A.components, "team,rows")).toBe(A.components.C1);
    expect(core.find(A.components, "team,nope")).toBeUndefined();
  });
});


describe("answering without the list", () => {
  const props = { data: Array.from({ length: 10 }, (_, i) => ({ slug: `c${i}`, status: i % 2 ? "DRAFT" : "PUBLISHED", n: i % 3 })), other: Array.from({ length: 8 }, (_, i) => ({ id: i })) };
  test("where, then group on the same list even after it shrinks", () => {
    const lk = core.listKey(props);
    const f = core.query(props, { where: "n>0", key: lk });
    expect(core.query(f, { group: "status", key: lk })).toEqual({ count: 6, by: { DRAFT: 3, PUBLISHED: 3 } });
    expect(core.query(props, { where: "n>0&status=DRAFT", count: true, key: lk })).toBe(3);
    expect(core.query(props, { where: (x: any) => x.slug === "c4", count: true, key: lk })).toBe(1);
  });
  test("limit, contains", () => {
    const r = core.query(props, { limit: 2, key: "data" }) as any;
    expect(r.data.length).toBe(2);
    expect(core.query({ items: [{ t: "Hello World" }, { t: "x" }] }, { where: "t~world", count: true })).toBe(1);
  });
  test("server-rendered nodes with text and href", () => {
    const rows = core.parseFlight(`0:["$","ul",null,{"children":[["$","li","a",{"children":["$","a",null,{"href":"/m?id=1","children":["Subject 1"," (unread)"]}]}],["$","li","b",{"children":["$","a",null,{"href":"/m?id=2","children":"Subject 2"}]}]]}]\n`);
    const n = core.nodes(rows, "a");
    expect(n).toEqual([{ tag: "a", text: "Subject 1 (unread)", href: "/m?id=1" }, { tag: "a", text: "Subject 2", href: "/m?id=2" }]);
    expect(core.query(n, { where: "text~unread", count: true })).toBe(1);
  });
});

describe("references and links", () => {
  test("$id:path references resolve to the shared object", () => {
    const d = core.flightData(core.parseFlight(
      `1:I["1",[],"Table"]\n` +
      `9b:["$","div",null,{"children":[["$","p",null,{"children":"x"}],["$","$L1",null,{"reservations":[{"id":1,"restaurant":{"name":"Bistro","city":"W"}}]}]]}]\n` +
      `0:["$","$L1",null,{"reservations":[{"id":2,"restaurant":"$9b:props:children:1:props:reservations:0:restaurant"}]}]\n`));
    const all = ([] as any[]).concat(d.components.Table).flatMap((t: any) => t.reservations);
    expect(all.map((r: any) => r.restaurant.name)).toEqual(["Bistro", "Bistro"]);
  });
  test("rows inside a Link carry its href; Link counts as a link", () => {
    const rows = core.parseFlight(`1:I["1",[],"default"]\n0:["$","ul",null,{"children":[["$","$L1","a",{"href":"/inbox?id=7","children":["$","li",null,{"children":"Green Table confirmed"}]}]]}]\n`);
    expect(core.nodes(rows, "li")).toEqual([{ tag: "li", text: "Green Table confirmed", href: "/inbox?id=7" }]);
    expect(core.nodes(rows, "a")).toEqual([{ tag: "a", text: "Green Table confirmed", href: "/inbox?id=7" }]);
  });
  test("find by component name, never the components map itself", () => {
    const d = core.flightData(core.parseFlight(`1:I["1",[],"TablesV2"]\n0:["$","$L1",null,{"data":{"tables":[]}}]\n`));
    expect(core.find(d.components, "TablesV2")).toEqual({ data: { tables: [] } });
    expect(core.find(d.components, "TablesV2.nope")).toBeUndefined();
  });
});

describe("answer pipeline never skips a filter", () => {
  const comp = { data: { org: "acme", reservations: Array.from({ length: 16 }, (_, i) => ({ id: i, status: i % 2 ? "CONFIRMED" : "PENDING", restaurant: { name: i % 4 < 2 ? "Bistro" : "Cafe" } })) } };
  test("where runs on the list pick points at", () => {
    expect(core.answer(comp, { pick: "data.reservations", where: "status=PENDING", count: true })).toBe(8);
    expect(core.answer(comp, { pick: "data.reservations", where: "status=PENDING", group: "restaurant.name" })).toEqual({ count: 8, by: { Bistro: 4, Cafe: 4 } });
    expect(core.answer(comp, { pick: "data.reservations.{id,restaurant.name}", where: "status=PENDING", limit: 1 })).toEqual([{ id: 0, "restaurant.name": "Bistro" }]);
  });
  test("a filter with no list is an error, not a no-op", () => {
    expect(() => core.answer(comp, { where: "status=PENDING", count: true })).toThrow(/need a list/);
  });
  test("a key no item has is 'shape changed', not 0", () => {
    expect(() => core.answer(comp, { pick: "data.reservations", where: "statusX=PENDING", count: true })).toThrow(/shape changed: missing statusX/);
    expect(() => core.answer(comp, { pick: "data.reservationz", count: true })).toThrow(/shape changed/);
  });

});

describe("links and field selection", () => {
  test("li gets the href of its single link inside (li > a)", () => {
    const rows = core.parseFlight(`1:I["1",[],"default"]\n0:["$","ul",null,{"children":[["$","li","a",{"children":["$","$L1",null,{"href":"/inbox?id=7","children":"Green Table"}]}],["$","li","b",{"children":["$","a",null,{"href":"/inbox?id=8","children":"Cafe"}]}]]}]\n`);
    expect(core.nodes(rows, "li")).toEqual([{ tag: "li", text: "Green Table", href: "/inbox?id=7" }, { tag: "li", text: "Cafe", href: "/inbox?id=8" }]);
  });
  test("{fields} apply to the object, and a missing field is an error", () => {
    const comp = { data: { tables: [] }, reservations: [{ id: 1 }] };
    expect(core.answer(comp, { pick: "{data}" })).toEqual({ data: { tables: [] } });
    expect(() => core.answer(comp, { pick: "{nope}" })).toThrow(/shape changed: missing nope/);
    expect(core.answer(comp, { pick: "reservations.{id}", where: "id>0", count: true })).toBe(1);
  });
});

describe("wrong-list protection", () => {
  const page = (withActions: boolean) => core.flightData(core.parseFlight(
    `1:I["1",[],"default"]\n2:I["2",[],"TablesV2"]\n` +
    `0:["$","main",null,{"children":[${withActions ? `["$","$L1",null,{"data":{"tables":[{"status":"ACCEPTED"},{"status":"OPEN"}]},"communitySlug":"a","actionsTargetId":"t"}],` : ""}["$","$L2",null,{"data":{"tables":[]},"communitySlug":"a"}]]}]\n`));
  test("an ambiguous find is refused, with a suggestion", () => {
    expect(() => core.findLocked(page(true).components, "data.tables", undefined)).toThrow(/ambiguous find 'data.tables'.*2 items.*0 items.*actionsTargetId/);
  });
  test("a learned fingerprint never falls through to another component", () => {
    const fp = core.fingerprint(core.findAll(page(true).components, "data.tables,actionsTargetId")[0]);
    expect(core.findLocked(page(true).components, "data.tables", fp).actionsTargetId).toBe("t");
    expect(() => core.findLocked(page(false).components, "data.tables", fp)).toThrow(/matched a different list/);
  });

});

test("find with alternatives accepts every declared variant (no shape lock)", () => {
  const A = { components: Object.defineProperty({ C: { team: "x", rows: [1], archive: 1 } }, "__components", { value: true }) };
  const fpB = ["archive", "meta", "payload"];
  expect(core.findLocked(A.components, "rows|payload", fpB)).toEqual({ team: "x", rows: [1], archive: 1 });
});


describe("schema: one rule", () => {
  test("lists of records with all keys and one masked sample; nothing else", () => {
    const comps = Object.defineProperty({
      Data: { org: "acme", rows: Array.from({ length: 5 }, (_, i) => ({ id: i, status: "open", a: 1, b: 2, c: 3, d: 4, platform: "resy", owner: { name: "Jane Doe", email: "jane@x.io" } })) },
      Intl: { locale: "en", messages: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["k" + i, ["text", "{x}"]])) },
    }, "__components", { value: true });
    const s = core.schema({ components: comps } as any);
    expect(s).toContain("Data.rows[5]");
    expect(s).toContain("platform");            // every key listed
    expect(s).not.toContain("Jane");            // name-like keys masked
    expect(s).not.toContain("jane@x.io");       // emails masked
    expect(s).not.toContain("Intl");            // no records there: not shown
    expect(s).not.toContain("org=");            // no scalars
    expect(core.schema({ components: comps } as any, { under: "Data.rows" })).toContain("Data.rows[5]");
  });
});

describe("components rendered more than once", () => {
  const comps = (a: unknown[], b: unknown[]) => Object.defineProperty({ Header: [{ posts: a }, { posts: b }] }, "__components", { value: true });
  test("identical copies are one candidate", () => {
    expect(core.answer(core.findLocked(comps([1, 2, 3, 4], [1, 2, 3, 4]), "Header", undefined), { pick: "posts", count: true })).toBe(4);
  });
  test("copies with different data are refused, and [i] selects one", () => {
    expect(() => core.findLocked(comps([1, 2, 3, 4], [1, 2]), "Header", undefined)).toThrow(/ambiguous find 'Header'.*find:'Header\[0\]'/);
    expect(core.answer(core.findLocked(comps([1, 2, 3, 4], [1, 2]), "Header[1]", undefined), { pick: "posts", count: true })).toBe(2);
  });
  test("a page payload that carries an 'a' field is not a Server Action reply", () => {
    const d = core.flightData(core.parseFlight(`1:I["1",[],"Blog"]\n0:{"P":null,"c":["","blog"],"a":"$@2","t":["$","$L1",null,{"posts":[{"id":1}]}]}\n2:[]\n`));
    expect(d.action).toBeUndefined();
    expect(d.components.Blog.posts.length).toBe(1);
  });
});

test("the app's own not-found page, passed by reference, is not page content", () => {
  const rows = core.parseFlight(
    `1:I["1",[],"default"]\n2:I["2",[],"Posts"]\n` +
    `5:["$","main",null,{"children":["$","h1",null,{"children":"Whooops, nothing here"}]}]\n` +
    `0:["$","$L1",null,{"parallelRouterKey":"children","notFound":["$L5",[]],"children":["$","$L2",null,{"posts":[{"id":1}]}]}]\n` +
    `6:["$","section",null,{"children":["$","h1",null,{"children":"Real heading"}]}]\n`);
  expect(core.nodes(rows, "h1").map((n: any) => n.text)).toEqual(["Real heading"]);
  expect(Object.keys(core.flightData(rows).components)).toEqual(["Posts"]);
});

test("forbidden()/unauthorized() digests mark the page as refused; 404 boundaries don't", () => {
  const denied = core.flightData(core.parseFlight(`0:["$","div",null,{}]\n6:E{"digest":"NEXT_HTTP_ERROR_FALLBACK;403"}\n4:E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}\n`));
  expect(denied.denied).toBe("403");
  const ok = core.flightData(core.parseFlight(`0:["$","div",null,{}]\n4:E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}\n`));
  expect(ok.denied).toBeUndefined();
});
