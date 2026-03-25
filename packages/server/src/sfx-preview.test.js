import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import express from "express";
import { registerSfxPreview } from "./sfx-preview.js";

let server, baseUrl;

beforeAll(async () => {
  const app = express();
  registerSfxPreview(app);
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
}

describe("registerSfxPreview", () => {
  it("registers a GET /sfx-preview route that returns HTML", async () => {
    const { statusCode } = await get(`${baseUrl}/sfx-preview`);
    expect(statusCode).toBe(200);
  });

  it("response contains expected title 'Claudia SFX Preview'", async () => {
    const { body } = await get(`${baseUrl}/sfx-preview`);
    expect(body).toContain("Claudia SFX Preview");
  });

  it("response content-type is html", async () => {
    const { headers } = await get(`${baseUrl}/sfx-preview`);
    expect(headers["content-type"]).toMatch(/text\/html/);
  });
});
