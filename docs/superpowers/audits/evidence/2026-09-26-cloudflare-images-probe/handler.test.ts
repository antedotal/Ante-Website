// These tests exercise the diagnostic request boundary while replacing only Cloudflare's external Images service.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { handleProbe, type ProbeEnv } from "./handler";

const token = "a".repeat(64);
const fixture = new Uint8Array(readFileSync(new URL("./phone-pattern.png", import.meta.url)));
const expiry = "2099-01-01T00:00:00Z";

function request(body: Uint8Array = fixture, headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://probe.example/probe", {
    method,
    headers: { "x-ante-images-probe-token": token, "content-type": "image/png", ...headers },
    body: method === "POST" ? Uint8Array.from(body) : undefined,
  });
}

function service(input = { format: "png", fileSize: fixture.length, width: 4032, height: 3024 }, output = { format: "jpeg", fileSize: 7, width: 1440, height: 1080 }) {
  const calls: unknown[] = [];
  let infos = 0;
  const images = {
    async info(stream: ReadableStream<Uint8Array>) {
      await new Response(stream).arrayBuffer();
      calls.push("info");
      return infos++ === 0 ? input : output;
    },
    input(stream: ReadableStream<Uint8Array>) {
      calls.push("input");
      return {
        transform(options: unknown) {
          calls.push(options);
          return {
            async output(options: unknown) {
              calls.push(options);
              await new Response(stream).arrayBuffer();
              return { response: () => new Response("encoded", { headers: { "content-type": "image/jpeg" } }) };
            },
          };
        },
      };
    },
  };
  return { images, calls };
}

function env(images = service().images): ProbeEnv {
  return { IMAGES: images, ANTE_IMAGES_PROBE_TOKEN: token, ANTE_IMAGES_PROBE_EXPIRES_AT: expiry };
}

async function result(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json();
}

describe("operator-only Images fixture probe", () => {
  it("denies an unauthenticated request before reading its body or touching Images", async () => {
    let read = false;
    const body = new ReadableStream<Uint8Array>({ pull() { read = true; } }, { highWaterMark: 0 });
    const cloud = service();
    const response = await handleProbe(new Request("https://probe.example/probe", { method: "POST", body, duplex: "half" } as RequestInit), env(cloud.images));
    expect(response.status).toBe(401);
    expect(await result(response)).toEqual({ error: "unauthorized" });
    expect(read).toBe(false);
    expect(cloud.calls).toEqual([]);
  });

  it("rejects missing or expired server expiry and unsupported methods before body/Images", async () => {
    const cloud = service();
    expect((await handleProbe(request(), { ...env(cloud.images), ANTE_IMAGES_PROBE_EXPIRES_AT: undefined })).status).toBe(503);
    expect((await handleProbe(request(), { ...env(cloud.images), ANTE_IMAGES_PROBE_EXPIRES_AT: "2000-01-01T00:00:00Z" })).status).toBe(410);
    const wrongMethod = await handleProbe(request(fixture, {}, "GET"), env(cloud.images));
    expect(wrongMethod.status).toBe(405);
    expect(await result(wrongMethod)).toEqual({ error: "post_required" });
    expect(cloud.calls).toEqual([]);
  });

  it("rejects wrong MIME, hash, URL query and oversize content before Images", async () => {
    const cloud = service();
    const probeEnv = env(cloud.images);
    expect((await handleProbe(request(fixture, { "content-type": "image/jpeg" }), probeEnv)).status).toBe(422);
    expect((await handleProbe(request(new Uint8Array([1, 2, 3])), probeEnv)).status).toBe(422);
    expect((await handleProbe(new Request("https://probe.example/probe?url=https://example.com", { method: "POST", headers: { "x-ante-images-probe-token": token } }), probeEnv)).status).toBe(400);
    expect((await handleProbe(request(fixture, { "content-length": "10485761" }), probeEnv)).status).toBe(413);
    expect(cloud.calls).toEqual([]);
  });

  it("passes the exact allowed PNG through info, scale-down 1080p and JPEG85, returning metadata only", async () => {
    const cloud = service();
    const response = await handleProbe(request(), env(cloud.images));
    expect(response.status).toBe(200);
    const json = await result(response);
    expect(json).toMatchObject({ fixture: "phone-pattern.png", inputBytes: 19491, outputBytes: 7, outputWidth: 1440, outputHeight: 1080, outputFormat: "jpeg" });
    expect(json.inputSha256).toBe("16b156913f5aedc329a225b237808538e8df89b2b8c22db190cf4daf65caa2ea");
    expect(json.outputSha256).toBe("766adc67b02bf315b9b5057994bfe6cfbd9354c433f259b29ba415dbe0f7afa5");
    expect(JSON.stringify(json)).not.toContain("encoded");
    expect(cloud.calls).toEqual(["info", "input", { width: 1920, height: 1080, fit: "scale-down", metadata: "none" }, { format: "image/jpeg", quality: 85, anim: false }, "info"]);
  });

  it("rejects unexpected input dimensions and oversized output with fixed errors", async () => {
    const badInput = service({ format: "png", fileSize: fixture.length, width: 12, height: 12 });
    const first = await handleProbe(request(), env(badInput.images));
    expect(first.status).toBe(422);
    expect(await result(first)).toEqual({ error: "fixture_info_mismatch" });
    const large = service();
    large.images.input = (() => ({ transform: () => ({ output: async () => ({ response: () => new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } }) }) }) })) as typeof large.images.input;
    const second = await handleProbe(request(), env(large.images));
    expect(second.status).toBe(502);
    expect(await result(second)).toEqual({ error: "output_too_large" });
  });

  it("hides provider failures and keeps a stalled body within the deadline", async () => {
    const broken = service();
    broken.images.info = async () => { throw new Error("provider private detail"); };
    const provider = await handleProbe(request(), env(broken.images));
    expect(provider.status).toBe(502);
    expect(await result(provider)).toEqual({ error: "images_unavailable" });
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } });
      const stalled = handleProbe(new Request("https://probe.example/probe", { method: "POST", headers: { "x-ante-images-probe-token": token, "content-type": "image/png" }, body, duplex: "half" } as RequestInit), env());
      await vi.advanceTimersByTimeAsync(10_001);
      const response = await stalled;
      expect(response.status).toBe(504);
      expect(await result(response)).toEqual({ error: "deadline_exceeded" });
    } finally { vi.useRealTimers(); }
  });
});
