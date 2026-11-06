import { describe, expect, it } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { parseChallengeAnswer, toCaptchaApiError } from "../../src/lib/captcha/vision";
import { saveScreenshot } from "../../src/lib/screenshot";

describe("parseChallengeAnswer", () => {
  it("reads the final JSON after an explanation", () => {
    const reply = 'Looking at the 3×3 grid, row 1 has two matches.\n{"clicks":[[120,80],[300,240]]}';
    expect(parseChallengeAnswer(reply, 500, 470)).toEqual({ clicks: [{ x: 120, y: 80 }, { x: 300, y: 240 }] });
  });

  it("never turns numbers in prose into clicks", () => {
    expect(parseChallengeAnswer("Looking at the 3×3 grid: tiles 1, 4 and 7 match.", 500, 470)).toBeNull();
  });

  it("uses the last answer when a reply has several", () => {
    const reply = 'First guess {"clicks":[[1,1]]}, but actually:\n{"clicks":[[50,60]]}';
    expect(parseChallengeAnswer(reply, 500, 470)).toEqual({ clicks: [{ x: 50, y: 60 }] });
  });

  it("reads a drag", () => {
    expect(parseChallengeAnswer('{"drag":[[10,20],[300,400]]}', 500, 470)).toEqual({
      drag: { from: { x: 10, y: 20 }, to: { x: 300, y: 400 } },
    });
  });

  it("accepts an explicit empty answer", () => {
    expect(parseChallengeAnswer('{"clicks":[]}', 500, 470)).toEqual({ clicks: [] });
  });

  it("rejects points outside the image and malformed answers", () => {
    expect(parseChallengeAnswer('{"clicks":[[10,10],[900,10]]}', 500, 470)).toBeNull();
    expect(parseChallengeAnswer('{"clicks":[[10]]}', 500, 470)).toBeNull();
    expect(parseChallengeAnswer('{"drag":[[10,10]]}', 500, 470)).toBeNull();
    expect(parseChallengeAnswer('{"clicks":"3,4"}', 500, 470)).toBeNull();
    expect(parseChallengeAnswer("{not json}", 500, 470)).toBeNull();
  });
});

describe("toCaptchaApiError", () => {
  it("surfaces the API's own message", () => {
    const body = { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } };
    const err = toCaptchaApiError(new Anthropic.BadRequestError(400, body, undefined, new Headers()));
    expect(err.message).toBe("Claude API call failed (400): Your credit balance is too low");
  });

  it("handles errors that aren't from the API", () => {
    expect(toCaptchaApiError(new Error("socket hang up")).message).toBe("Claude API call failed: socket hang up");
  });
});

describe("saveScreenshot", () => {
  it("saves the file the returned URL names, under a name a timestamp can't guess", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-shot-"));
    try {
      const url = saveScreenshot(Buffer.from("x"), "state-123.jpg", dir, "http://localhost:1");
      const name = url.split("/screenshots/")[1];
      expect(name).toMatch(/^state-123-[0-9a-f]{16}\.jpg$/);
      expect(fs.readFileSync(path.join(dir, name), "utf8")).toBe("x");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
