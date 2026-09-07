import { describe, it, expect } from "bun:test";
import type { Page, Request, Response } from "patchright";
import { ApiCapture } from "../../src/lib/api-capture";

async function capturePaths(paths: string[]) {
  let onRequest!: (request: Request) => void;
  let onResponse!: (response: Response) => Promise<void>;
  const page = {
    context: () => ({ on() {}, off() {} }),
    on(event: string, handler: unknown) {
      if (event === "request") onRequest = handler as typeof onRequest;
      if (event === "response") onResponse = handler as typeof onResponse;
    },
    off() {},
  } as unknown as Page;
  const capture = new ApiCapture(page);
  capture.start();
  try {
    for (const path of paths) {
      const request = {
        resourceType: () => "fetch",
        url: () => `https://example.test${path}`,
        method: () => "GET",
        headers: () => ({}),
        postData: () => null,
      } as unknown as Request;
      onRequest(request);
      // Await response processing without depending on arbitrary sleeps.
      await onResponse({
        request: () => request,
        text: async () => "{}",
        status: () => 200,
        headers: () => ({}),
      } as unknown as Response);
    }
    return capture.getResults()[0].endpoints;
  } finally {
    capture.stop();
  }
}

describe("API capture path parameterization", () => {
  it.each([
    ["/api/users/123", "/api/users/{id}"],
    ["/api/users/1", "/api/users/{id}"],
    ["/api/users/abcdef12", "/api/users/{id}"],
    ["/api/users/ABCDEF1234567890", "/api/users/{id}"],
    ["/api/users/550e8400-e29b-41d4-a716-446655440000", "/api/users/{id}"],
    ["/api/users/abcdefghijklmnopqrstu", "/api/users/{id}"],
    ["/api/channels/123/messages/456", "/api/channels/{id}/messages/{id2}"],
    ["/api/v2/health", "/api/v2/health"],
    ["/api/users/abc", "/api/users/abc"],
    ["/", "/"],
  ])("captures %s as %s", async (path, expected) => {
    const [endpoint] = await capturePaths([path]);
    expect(endpoint.path).toBe(expected);
    expect(endpoint.action).toBe(`GET ${expected}`);
  });

  it("groups different IDs while retaining observed paths", async () => {
    const endpoints = await capturePaths(["/api/users/123", "/api/users/456"]);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/users/{id}");
    expect(endpoints[0].rawPaths).toEqual(["/api/users/123", "/api/users/456"]);
  });
});
