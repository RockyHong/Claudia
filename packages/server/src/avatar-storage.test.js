import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import AdmZip from "adm-zip";
import { createAvatarStorage, isValidSetName } from "./avatar-storage.js";

let tmpDir;
let storage;

beforeEach(async () => {
	tmpDir = path.join(os.tmpdir(), `claudia-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(tmpDir, { recursive: true });
	storage = createAvatarStorage(tmpDir);
});

afterEach(async () => {
	if (tmpDir) {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

// EBML header for .webm, "ftyp" at offset 4 for .mp4
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const MP4_MAGIC = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);

function fakeFile(name, size = 100) {
	const data = Buffer.alloc(size, 0x42);
	const magic = name.endsWith(".webm") ? WEBM_MAGIC : MP4_MAGIC;
	magic.copy(data);
	return { name, data };
}

function makeZipBuffer(files) {
	const zip = new AdmZip();
	for (const { name, data } of files) {
		zip.addFile(name, data);
	}
	return zip.toBuffer();
}

describe("isValidSetName", () => {
	it("accepts valid names", () => {
		expect(isValidSetName("default")).toBe(true);
		expect(isValidSetName("pixel-art")).toBe(true);
		expect(isValidSetName("my set 01")).toBe(true);
		expect(isValidSetName("a")).toBe(true);
		expect(isValidSetName("AB")).toBe(true);
	});

	it("rejects invalid names", () => {
		expect(isValidSetName("")).toBe(false);
		expect(isValidSetName(null)).toBe(false);
		expect(isValidSetName(undefined)).toBe(false);
		expect(isValidSetName("../escape")).toBe(false);
		expect(isValidSetName("-starts-dash")).toBe(false);
		expect(isValidSetName(" space")).toBe(false);
		expect(isValidSetName("a".repeat(51))).toBe(false);
	});
});

describe("config defaults", () => {
	it("getActiveSet returns 'default' when no config exists", async () => {
		expect(await storage.getActiveSet()).toBe("default");
	});
});

describe("getActiveSet", () => {
	it("defaults to 'default' when no config", async () => {
		expect(await storage.getActiveSet()).toBe("default");
	});

	it("returns configured active set", async () => {
		await storage.createSet("pixel-art", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.setActiveSet("pixel-art");
		expect(await storage.getActiveSet()).toBe("pixel-art");
	});
});

describe("listSets", () => {
	it("always includes the default set", async () => {
		const sets = await storage.listSets();
		expect(sets).toHaveLength(1);
		expect(sets[0].name).toBe("default");
	});

	it("lists sets with files and active flag", async () => {
		await storage.createSet("one", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.createSet("two", [fakeFile("idle.mp4"), fakeFile("busy.mp4"), fakeFile("pending.mp4")]);
		await storage.setActiveSet("one");

		const sets = await storage.listSets();
		expect(sets).toHaveLength(3); // default + one + two

		const one = sets.find((s) => s.name === "one");
		expect(one.active).toBe(true);
		expect(one.files).toContain("idle.webm");
		expect(one.files).toContain("busy.webm");

		const two = sets.find((s) => s.name === "two");
		expect(two.active).toBe(false);
		expect(two.files).toContain("idle.mp4");
	});
});

describe("createSet", () => {
	it("creates a set with files on disk", async () => {
		await storage.createSet("test-set", [
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const setPath = storage.getSetPath("test-set");
		const files = await fs.readdir(setPath);
		expect(files).toContain("idle.webm");
		expect(files).toContain("busy.webm");
		expect(files).toContain("pending.webm");
	});

	it("rejects invalid set names", async () => {
		await expect(storage.createSet("../bad", [fakeFile("idle.webm")])).rejects.toThrow("Invalid set name");
	});

	it("rejects duplicate set names", async () => {
		await storage.createSet("dupe", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await expect(
			storage.createSet("dupe", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")])
		).rejects.toThrow("Set already exists");
	});

	it("rejects invalid filenames", async () => {
		await expect(
			storage.createSet("bad-files", [
				fakeFile("idle.webm"),
				fakeFile("busy.webm"),
				{ name: "pending.exe", data: Buffer.alloc(10) },
			])
		).rejects.toThrow("Invalid filename");
	});

	it("rejects files with wrong magic bytes", async () => {
		const badContent = { name: "pending.webm", data: Buffer.alloc(100, 0x00) };
		await expect(
			storage.createSet("bad-magic", [fakeFile("idle.webm"), fakeFile("busy.webm"), badContent])
		).rejects.toThrow("Invalid file content");
	});

	it("rejects files over size limit", async () => {
		const bigFile = { name: "pending.webm", data: Buffer.alloc(6 * 1024 * 1024) };
		await expect(
			storage.createSet("big", [fakeFile("idle.webm"), fakeFile("busy.webm"), bigFile])
		).rejects.toThrow("File too large");
	});

	it("rejects sets with fewer than 3 state videos", async () => {
		await expect(
			storage.createSet("partial", [fakeFile("idle.webm"), fakeFile("busy.webm")])
		).rejects.toThrow("All three videos required: idle, busy, pending");
	});

	it("rejects sets with only one video", async () => {
		await expect(
			storage.createSet("solo", [fakeFile("idle.webm")])
		).rejects.toThrow("All three videos required: idle, busy, pending");
	});

	it("accepts sets with all 3 states in webm", async () => {
		await storage.createSet("full-webm", [
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);
		const sets = await storage.listSets();
		expect(sets.find((s) => s.name === "full-webm")).toBeTruthy();
	});

	it("accepts sets with mixed formats across states", async () => {
		await storage.createSet("mixed", [
			fakeFile("idle.webm"),
			fakeFile("busy.mp4"),
			fakeFile("pending.webm"),
		]);
		const sets = await storage.listSets();
		expect(sets.find((s) => s.name === "mixed")).toBeTruthy();
	});
});

describe("deleteSet", () => {
	it("deletes a non-active set", async () => {
		await storage.createSet("to-delete", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.createSet("keeper", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.setActiveSet("keeper");

		await storage.deleteSet("to-delete");
		const sets = await storage.listSets();
		expect(sets.find((s) => s.name === "to-delete")).toBeUndefined();
	});

	it("falls back to default when deleting the active set", async () => {
		await storage.ensureDefaults();
		await storage.createSet("active-one", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.setActiveSet("active-one");

		await storage.deleteSet("active-one");
		expect(await storage.getActiveSet()).toBe("default");
		const sets = await storage.listSets();
		expect(sets.find((s) => s.name === "active-one")).toBeUndefined();
	});

	it("refuses to delete the default set", async () => {
		await storage.ensureDefaults();
		await expect(storage.deleteSet("default")).rejects.toThrow("Cannot delete the default set");
	});
});

describe("setActiveSet", () => {
	it("switches the active set", async () => {
		await storage.createSet("a", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.createSet("b", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.setActiveSet("a");
		expect(await storage.getActiveSet()).toBe("a");
		await storage.setActiveSet("b");
		expect(await storage.getActiveSet()).toBe("b");
	});

	it("rejects non-existent set", async () => {
		await expect(storage.setActiveSet("ghost")).rejects.toThrow("Set not found");
	});
});

describe("updateSet", () => {
  it("replaces a single file in an existing set", async () => {
    await storage.createSet("updatable", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const newIdle = fakeFile("idle.webm", 200);
    await storage.updateSet("updatable", { files: [newIdle] });

    const setPath = storage.getSetPath("updatable");
    const stat = await fs.stat(path.join(setPath, "idle.webm"));
    expect(stat.size).toBe(200);
  });

  it("renames a set", async () => {
    await storage.createSet("old-name", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await storage.updateSet("old-name", { rename: "new-name" });

    const sets = await storage.listSets();
    expect(sets.find((s) => s.name === "old-name")).toBeUndefined();
    expect(sets.find((s) => s.name === "new-name")).toBeTruthy();
  });

  it("renames and replaces files simultaneously", async () => {
    await storage.createSet("combo", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await storage.updateSet("combo", {
      rename: "combo-v2",
      files: [fakeFile("busy.mp4", 300)],
    });

    const sets = await storage.listSets();
    const set = sets.find((s) => s.name === "combo-v2");
    expect(set).toBeTruthy();
    expect(set.files).toContain("busy.mp4");
  });

  it("throws for non-existent set", async () => {
    await expect(
      storage.updateSet("ghost", { files: [fakeFile("idle.webm")] })
    ).rejects.toThrow("Set not found");
  });

  it("throws for invalid rename target", async () => {
    await storage.createSet("valid", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await expect(
      storage.updateSet("valid", { rename: "../escape" })
    ).rejects.toThrow("Invalid set name");
  });

  it("throws if rename target already exists", async () => {
    await storage.createSet("src", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);
    await storage.createSet("dst", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await expect(
      storage.updateSet("src", { rename: "dst" })
    ).rejects.toThrow("Set already exists");
  });

  it("updates active set config when renaming the active set", async () => {
    await storage.createSet("active-rename", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);
    await storage.setActiveSet("active-rename");

    await storage.updateSet("active-rename", { rename: "renamed-active" });

    expect(await storage.getActiveSet()).toBe("renamed-active");
  });

  it("validates replacement files (magic bytes, size)", async () => {
    await storage.createSet("validate-me", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const badContent = { name: "idle.webm", data: Buffer.alloc(100, 0x00) };
    await expect(
      storage.updateSet("validate-me", { files: [badContent] })
    ).rejects.toThrow("Invalid file content");
  });

  it("removes old format file when replacing with different format", async () => {
    await storage.createSet("format-swap", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await storage.updateSet("format-swap", { files: [fakeFile("idle.mp4", 150)] });

    const setPath = storage.getSetPath("format-swap");
    const files = await fs.readdir(setPath);
    expect(files).toContain("idle.mp4");
    expect(files).not.toContain("idle.webm");
  });
});

describe("ensureDefaults", () => {
	it("creates default set when no sets exist", async () => {
		await storage.ensureDefaults();
		const sets = await storage.listSets();
		expect(sets.length).toBeGreaterThanOrEqual(1);
		expect(sets.find((s) => s.name === "default")).toBeTruthy();
		expect(await storage.getActiveSet()).toBe("default");
	});

	it("does nothing when sets already exist", async () => {
		await storage.createSet("existing", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
		await storage.setActiveSet("existing");
		await storage.ensureDefaults();
		expect(await storage.getActiveSet()).toBe("existing");
	});
});

describe("exportSet", () => {
	it("returns a zip buffer containing the set's video files", async () => {
		await storage.createSet("export-me", [
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const zipBuffer = await storage.exportSet("export-me");
		expect(zipBuffer).toBeInstanceOf(Buffer);

		const zip = new AdmZip(zipBuffer);
		const entries = zip.getEntries().map((e) => e.entryName);
		expect(entries).toHaveLength(3);
		expect(entries).toContain("idle.webm");
		expect(entries).toContain("busy.webm");
		expect(entries).toContain("pending.webm");
	});

	it("exports mixed format sets correctly", async () => {
		await storage.createSet("mixed-export", [
			fakeFile("idle.webm"),
			fakeFile("busy.mp4"),
			fakeFile("pending.webm"),
		]);

		const zipBuffer = await storage.exportSet("mixed-export");
		const zip = new AdmZip(zipBuffer);
		const entries = zip.getEntries().map((e) => e.entryName);
		expect(entries).toContain("idle.webm");
		expect(entries).toContain("busy.mp4");
		expect(entries).toContain("pending.webm");
	});

	it("throws for non-existent set", async () => {
		await expect(storage.exportSet("ghost")).rejects.toThrow("Set not found");
	});
});

describe("importSet", () => {
	it("imports a valid .claudia zip and creates the set", async () => {
		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const result = await storage.importSet("my-avatar", zipBuf);
		expect(result.name).toBe("my-avatar");

		const sets = await storage.listSets();
		expect(sets.find((s) => s.name === "my-avatar")).toBeTruthy();
	});

	it("auto-suffixes on name conflict", async () => {
		await storage.createSet("conflict", [
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const result = await storage.importSet("conflict", zipBuf);
		expect(result.name).toBe("conflict 2");

		const sets = await storage.listSets();
		expect(sets.find((s) => s.name === "conflict 2")).toBeTruthy();
	});

	it("auto-suffixes incrementally", async () => {
		await storage.createSet("dupe", [
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);
		await storage.createSet("dupe 2", [
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		const result = await storage.importSet("dupe", zipBuf);
		expect(result.name).toBe("dupe 3");
	});

	it("rejects zip with wrong file count", async () => {
		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
		]);

		await expect(storage.importSet("bad", zipBuf)).rejects.toThrow(
			"Avatar pack must contain exactly 3 files: idle, busy, and pending"
		);
	});

	it("rejects zip with duplicate state", async () => {
		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("idle.mp4"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		await expect(storage.importSet("dup-state", zipBuf)).rejects.toThrow(
			"Avatar pack must contain exactly 3 files: idle, busy, and pending"
		);
	});

	it("rejects zip with invalid filenames", async () => {
		const zip = new AdmZip();
		zip.addFile("idle.webm", fakeFile("idle.webm").data);
		zip.addFile("busy.webm", fakeFile("busy.webm").data);
		zip.addFile("malware.exe", Buffer.alloc(100));

		await expect(storage.importSet("bad-files", zip.toBuffer())).rejects.toThrow(
			"Avatar pack must contain exactly 3 files: idle, busy, and pending"
		);
	});

	it("rejects file exceeding 5MB", async () => {
		const bigFile = fakeFile("pending.webm", 6 * 1024 * 1024);
		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			bigFile,
		]);

		await expect(storage.importSet("too-big", zipBuf)).rejects.toThrow(
			"One or more files exceed the 5MB limit"
		);
	});

	it("rejects file with bad magic bytes", async () => {
		const zip = new AdmZip();
		zip.addFile("idle.webm", fakeFile("idle.webm").data);
		zip.addFile("busy.webm", fakeFile("busy.webm").data);
		zip.addFile("pending.webm", Buffer.alloc(100, 0x00));

		await expect(storage.importSet("bad-magic", zip.toBuffer())).rejects.toThrow(
			"One or more files aren't valid video files"
		);
	});

	it("imports mixed format sets", async () => {
		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.mp4"),
			fakeFile("pending.webm"),
		]);

		const result = await storage.importSet("mixed", zipBuf);
		expect(result.name).toBe("mixed");

		const sets = await storage.listSets();
		const set = sets.find((s) => s.name === "mixed");
		expect(set.files).toContain("idle.webm");
		expect(set.files).toContain("busy.mp4");
		expect(set.files).toContain("pending.webm");
	});

	it("strips directory paths from zip entries", async () => {
		const zip = new AdmZip();
		zip.addFile("subfolder/idle.webm", fakeFile("idle.webm").data);
		zip.addFile("subfolder/busy.webm", fakeFile("busy.webm").data);
		zip.addFile("subfolder/pending.webm", fakeFile("pending.webm").data);

		await expect(storage.importSet("paths", zip.toBuffer())).rejects.toThrow(
			"Avatar pack must contain exactly 3 files: idle, busy, and pending"
		);
	});

	it("rejects invalid set name derived from filename", async () => {
		const zipBuf = makeZipBuffer([
			fakeFile("idle.webm"),
			fakeFile("busy.webm"),
			fakeFile("pending.webm"),
		]);

		await expect(storage.importSet("../escape", zipBuf)).rejects.toThrow(
			"Filename isn't a valid avatar set name"
		);
	});
});
