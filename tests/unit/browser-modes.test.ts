import { afterAll, describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { DomainModeStore } from "../../src/lib/domain-modes";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-modes-"));
const file = (name: string) => path.join(dir, `${name}.json`);
const LOCAL = ["headless", "binary-headful"] as const;

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("browser mode escalation", () => {
  test("a block in headless escalates to binary-headful, which is the last step", () => {
    const store = new DomainModeStore(file("ladder"));
    expect(store.getNextMode("headless", [...LOCAL])).toBe("binary-headful");
    expect(store.getNextMode("binary-headful", [...LOCAL])).toBeNull();
  });

  test("no display means nothing to escalate to", () => {
    expect(new DomainModeStore(file("nodisplay")).getNextMode("headless", ["headless"])).toBeNull();
  });

  test("a domain remembered under the removed docker mode starts from a real mode", () => {
    const old = file("old");
    fs.writeFileSync(old, JSON.stringify({
      "example.com": { mode: "docker-headful", lastSuccess: new Date().toISOString(), attempts: {} },
    }));
    expect(new DomainModeStore(old).getBestMode("example.com", [...LOCAL])).toBe("headless");
  });
});
