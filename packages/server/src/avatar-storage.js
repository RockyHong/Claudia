import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { createPreferences } from "./preferences.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const VALID_FILENAMES = new Set([
	"idle.webm",
	"idle.mp4",
	"busy.webm",
	"busy.mp4",
	"pending.webm",
	"pending.mp4",
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ZIP_SIZE = 20 * 1024 * 1024;
const REQUIRED_STATES = ["idle", "busy", "pending"];

// Magic bytes for video format validation
const MAGIC_BYTES = {
	webm: { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML header
	mp4: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // "ftyp"
};

function hasValidMagicBytes(data, filename) {
	const ext = filename.split(".").pop();
	const magic = MAGIC_BYTES[ext];
	if (!magic || data.length < magic.offset + magic.bytes.length) return false;
	return magic.bytes.every((b, i) => data[magic.offset + i] === b);
}
const SET_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,48}[a-zA-Z0-9]$/;
const BUNDLED_AVATARS = path.resolve(__dirname, "../assets/avatar");

export function isValidSetName(name) {
	if (!name || typeof name !== "string") return false;
	if (name.length > 50) return false;
	if (name.length === 1) return /^[a-zA-Z0-9]$/.test(name);
	return SET_NAME_RE.test(name);
}

export function createAvatarStorage(baseDir) {
	const avatarsDir = path.join(baseDir, "avatars");
	const prefs = createPreferences(baseDir);

	async function ensureDirs() {
		await fs.mkdir(avatarsDir, { recursive: true });
	}

	async function getActiveSet() {
		const config = await prefs.get();
		return config.activeSet || "default";
	}

	async function getActiveSetPath() {
		const name = await getActiveSet();
		return path.join(avatarsDir, name);
	}

	async function listSets() {
		await ensureDefaults();
		const [entries, activeSet] = await Promise.all([
			fs.readdir(avatarsDir, { withFileTypes: true }),
			getActiveSet(),
		]);

		const dirs = entries.filter((e) => e.isDirectory());
		const sets = await Promise.all(
			dirs.map(async (entry) => {
				const files = await fs.readdir(path.join(avatarsDir, entry.name));
				return {
					name: entry.name,
					active: entry.name === activeSet,
					files: files.filter((f) => VALID_FILENAMES.has(f)),
				};
			}),
		);

		return sets;
	}

	function getSetPath(name) {
		return path.join(avatarsDir, name);
	}

	async function createSet(name, files) {
		if (!isValidSetName(name)) {
			throw new Error("Invalid set name");
		}

		// Require all three avatar states
		const states = new Set(files.map((f) => f.name.split(".")[0]));
		if (!states.has("idle") || !states.has("busy") || !states.has("pending")) {
			throw new Error("All three videos required: idle, busy, pending");
		}

		const setPath = getSetPath(name);

		try {
			await fs.access(setPath);
			throw new Error("Set already exists");
		} catch (err) {
			if (err.message === "Set already exists") throw err;
		}

		await fs.mkdir(setPath, { recursive: true });

		for (const file of files) {
			if (!VALID_FILENAMES.has(file.name)) {
				throw new Error(`Invalid filename: ${file.name}`);
			}
			if (file.data.length > MAX_FILE_SIZE) {
				throw new Error(`File too large: ${file.name}`);
			}
			if (!hasValidMagicBytes(file.data, file.name)) {
				throw new Error(`Invalid file content: ${file.name}`);
			}
			await fs.writeFile(path.join(setPath, file.name), file.data);
		}
	}

	async function updateSet(name, { files = [], rename } = {}) {
		const setPath = getSetPath(name);

		try {
			await fs.access(setPath);
		} catch {
			throw new Error("Set not found");
		}

		// Validate and write replacement files
		for (const file of files) {
			if (!VALID_FILENAMES.has(file.name)) {
				throw new Error(`Invalid filename: ${file.name}`);
			}
			if (file.data.length > MAX_FILE_SIZE) {
				throw new Error(`File too large: ${file.name}`);
			}
			if (!hasValidMagicBytes(file.data, file.name)) {
				throw new Error(`Invalid file content: ${file.name}`);
			}

			// Remove opposite format if swapping (e.g., idle.webm -> idle.mp4)
			const state = file.name.split(".")[0];
			const otherExt = file.name.endsWith(".webm") ? ".mp4" : ".webm";
			const otherFile = path.join(setPath, `${state}${otherExt}`);
			await fs.rm(otherFile, { force: true });

			await fs.writeFile(path.join(setPath, file.name), file.data);
		}

		// Handle rename
		if (rename) {
			if (!isValidSetName(rename)) {
				throw new Error("Invalid set name");
			}
			if (rename !== name) {
				const newPath = getSetPath(rename);
				try {
					await fs.access(newPath);
					throw new Error("Set already exists");
				} catch (err) {
					if (err.message === "Set already exists") throw err;
				}
				await fs.rename(setPath, newPath);

				// Update active set config if this was the active set
				const activeSet = await getActiveSet();
				if (activeSet === name) {
					await prefs.set({ activeSet: rename });
				}
			}
		}
	}

	async function deleteSet(name) {
		if (name === "default") {
			throw new Error("Cannot delete the default set");
		}

		const setPath = getSetPath(name);
		await fs.rm(setPath, { recursive: true });

		// If we deleted the active set, fall back to default
		const activeSet = await getActiveSet();
		if (activeSet === name) {
			await prefs.set({ activeSet: "default" });
		}
	}

	async function setActiveSet(name) {
		const setPath = getSetPath(name);

		try {
			await fs.access(setPath);
		} catch {
			throw new Error("Set not found");
		}

		await prefs.set({ activeSet: name });
	}

	async function ensureDefaults() {
		await ensureDirs();

		const defaultPath = path.join(avatarsDir, "default");
		try {
			await fs.access(defaultPath);
			return; // default set exists, nothing to do
		} catch {
			// default set missing — recreate it
		}

		await fs.mkdir(defaultPath, { recursive: true });

		try {
			const bundledFiles = await fs.readdir(BUNDLED_AVATARS);
			for (const file of bundledFiles) {
				if (VALID_FILENAMES.has(file)) {
					await fs.copyFile(
						path.join(BUNDLED_AVATARS, file),
						path.join(defaultPath, file),
					);
				}
			}
		} catch {
			// Bundled avatars may not exist (e.g., in test environment)
		}
	}

	async function importSet(name, zipBuffer) {
		if (!isValidSetName(name)) {
			throw new Error("Filename isn't a valid avatar set name");
		}
		if (zipBuffer.length > MAX_ZIP_SIZE) {
			throw new Error("File is too large");
		}

		let zip;
		try {
			zip = new AdmZip(zipBuffer);
		} catch {
			throw new Error(
				"This file doesn't look like a valid .claudia avatar pack",
			);
		}

		const entries = zip.getEntries();

		// Filter to only valid filenames (no directories, no invalid names)
		const validEntries = entries.filter(
			(e) => !e.isDirectory && VALID_FILENAMES.has(e.entryName),
		);

		// Check exactly 3 valid files, one per state
		const states = new Set(validEntries.map((e) => e.entryName.split(".")[0]));
		if (
			validEntries.length !== 3 ||
			states.size !== 3 ||
			!REQUIRED_STATES.every((s) => states.has(s))
		) {
			throw new Error(
				"Avatar pack must contain exactly 3 files: idle, busy, and pending",
			);
		}

		// Validate each file
		const files = [];
		for (const entry of validEntries) {
			const data = entry.getData();
			if (data.length > MAX_FILE_SIZE) {
				throw new Error("One or more files exceed the 5MB limit");
			}
			if (!hasValidMagicBytes(data, entry.entryName)) {
				throw new Error("One or more files aren't valid video files");
			}
			files.push({ name: entry.entryName, data });
		}

		// Resolve name conflicts
		let finalName = name;
		let suffix = 1;
		while (true) {
			try {
				await fs.access(getSetPath(finalName));
				suffix++;
				finalName = `${name} ${suffix}`;
			} catch {
				break;
			}
		}

		// Create the set directory and write files
		const setPath = getSetPath(finalName);
		await fs.mkdir(setPath, { recursive: true });
		for (const file of files) {
			await fs.writeFile(path.join(setPath, file.name), file.data);
		}

		return { name: finalName };
	}

	async function exportSet(name) {
		const setPath = getSetPath(name);
		try {
			await fs.access(setPath);
		} catch {
			throw new Error("Set not found");
		}

		const files = await fs.readdir(setPath);
		const validFiles = files.filter((f) => VALID_FILENAMES.has(f));

		const zip = new AdmZip();
		for (const file of validFiles) {
			const data = await fs.readFile(path.join(setPath, file));
			zip.addFile(file, data);
		}

		return zip.toBuffer();
	}

	return {
		getActiveSet,
		getActiveSetPath,
		listSets,
		getSetPath,
		createSet,
		updateSet,
		deleteSet,
		setActiveSet,
		ensureDefaults,
		ensureDirs,
		exportSet,
		importSet,
		getAvatarsDir: () => avatarsDir,
	};
}

// Default singleton for production use
const DEFAULT_DIR = path.join(os.homedir(), ".claudia");
const defaultStorage = createAvatarStorage(DEFAULT_DIR);

export const {
	getActiveSet,
	getActiveSetPath,
	listSets,
	getSetPath,
	createSet,
	updateSet,
	deleteSet,
	setActiveSet,
	ensureDefaults,
	ensureDirs,
	exportSet,
	importSet,
	getAvatarsDir,
} = defaultStorage;
