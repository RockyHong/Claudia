import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

// Must import after mock
const { createUsageClient } = await import("./usage.js");

const VALID_CREDENTIALS = JSON.stringify({
	claudeAiOauth: {
		accessToken: "sk-ant-oat01-test-token",
	},
});

const VALID_RESPONSE = {
	five_hour: { utilization: 42.0, resets_at: "2026-03-28T14:59:59Z" },
	seven_day: { utilization: 68.0, resets_at: "2026-03-31T03:59:59Z" },
};

describe("createUsageClient", () => {
	let client;
	let fetchMock;

	beforeEach(() => {
		vi.useFakeTimers();
		fs.readFile.mockResolvedValue(VALID_CREDENTIALS);
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(new Error("not found"), "", "");
		});
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(VALID_RESPONSE),
		});
		vi.stubGlobal("fetch", fetchMock);
		client = createUsageClient();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("returns null when no data has been fetched", () => {
		expect(client.getUsage()).toBe(null);
	});

	it("fetches and caches usage data", async () => {
		const result = await client.refreshUsage();

		expect(result).toEqual({
			fiveHour: { utilization: 42.0, resetsAt: "2026-03-28T14:59:59Z" },
			sevenDay: { utilization: 68.0, resetsAt: "2026-03-31T03:59:59Z" },
			fetchedAt: expect.any(Number),
		});
		expect(client.getUsage()).toEqual(result);
	});

	it("respects 5-minute cooldown", async () => {
		await client.refreshUsage();
		fetchMock.mockClear();

		await client.refreshUsage();
		expect(fetchMock).not.toHaveBeenCalled();

		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		await client.refreshUsage();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("applies exponential backoff on 429", async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 429 });

		await client.refreshUsage();
		fetchMock.mockClear();

		// Should not fetch again within backoff (5min * 2 = 10min)
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		await client.refreshUsage();
		expect(fetchMock).not.toHaveBeenCalled();

		// Should fetch after 10min backoff
		vi.advanceTimersByTime(5 * 60 * 1000);
		await client.refreshUsage();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("resets backoff on success after 429", async () => {
		fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
		await client.refreshUsage();

		// Wait out the 10min backoff
		vi.advanceTimersByTime(10 * 60 * 1000 + 1);
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(VALID_RESPONSE),
		});
		await client.refreshUsage();

		// Back to normal 5min cooldown
		fetchMock.mockClear();
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(VALID_RESPONSE),
		});
		await client.refreshUsage();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("returns null when credentials are missing", async () => {
		fs.readFile.mockRejectedValue(new Error("ENOENT"));
		client = createUsageClient();

		const result = await client.refreshUsage();
		expect(result).toBe(null);
	});

	it("falls back to macOS Keychain when credentials file is missing", async () => {
		fs.readFile.mockRejectedValue(new Error("ENOENT"));
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(null, VALID_CREDENTIALS, "");
		});
		client = createUsageClient();

		const result = await client.refreshUsage();
		expect(result).toEqual({
			fiveHour: { utilization: 42.0, resetsAt: "2026-03-28T14:59:59Z" },
			sevenDay: { utilization: 68.0, resetsAt: "2026-03-31T03:59:59Z" },
			fetchedAt: expect.any(Number),
		});
	});

	it("returns cached data when fetch fails", async () => {
		await client.refreshUsage();
		const cached = client.getUsage();

		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		fetchMock.mockRejectedValue(new Error("network"));
		const result = await client.refreshUsage();
		expect(result).toEqual(cached);
	});

	it("caps backoff at 60 minutes", async () => {
		// Trigger 429 four times: 5m -> 10m -> 20m -> 40m -> 60m (capped)
		for (let i = 0; i < 4; i++) {
			fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
			const waitMs =
				i === 0 ? 0 : Math.min(5 * 60 * 1000 * 2 ** i, 60 * 60 * 1000) + 1;
			vi.advanceTimersByTime(waitMs);
			await client.refreshUsage();
		}

		fetchMock.mockClear();
		// After 4th 429, backoff should be capped at 60min, not 80min
		vi.advanceTimersByTime(60 * 60 * 1000 + 1);
		fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
		await client.refreshUsage();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
