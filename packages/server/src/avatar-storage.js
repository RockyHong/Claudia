import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const VALID_FILENAMES = new Set(["idle.webm", "idle.mp4", "busy.webm", "busy.mp4", "pending.webm", "pending.mp4"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
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
	const configPath = path.join(baseDir, "config.json");

	async function ensureDirs() {
		await fs.mkdir(avatarsDir, { recursive: true });
	}

	async function getConfig() {
		try {
			const raw = await fs.readFile(configPath, "utf-8");
			return JSON.parse(raw);
		} catch {
			return {};
		}
	}

	async function setConfig(patch) {
		const config = await getConfig();
		Object.assign(config, patch);
		await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
		return config;
	}

	async function getActiveSet() {
		const config = await getConfig();
		return config.activeSet || "default";
	}

	async function getActiveSetPath() {
		const name = await getActiveSet();
		return path.join(avatarsDir, name);
	}

	async function listSets() {
		await ensureDirs();
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
			await fs.writeFile(path.join(setPath, file.name), file.data);
		}
	}

	async function deleteSet(name) {
		const activeSet = await getActiveSet();
		if (name === activeSet) {
			throw new Error("Cannot delete the active set");
		}

		const setPath = getSetPath(name);
		await fs.rm(setPath, { recursive: true });
	}

	async function setActiveSet(name) {
		const setPath = getSetPath(name);

		try {
			await fs.access(setPath);
		} catch {
			throw new Error("Set not found");
		}

		await setConfig({ activeSet: name });
	}

	async function ensureDefaults() {
		await ensureDirs();

		const entries = await fs.readdir(avatarsDir, { withFileTypes: true });
		const hasSets = entries.some((e) => e.isDirectory());
		if (hasSets) return;

		const defaultPath = path.join(avatarsDir, "default");
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

		await setConfig({ activeSet: "default" });
	}

	return {
		getConfig,
		setConfig,
		getActiveSet,
		getActiveSetPath,
		listSets,
		getSetPath,
		createSet,
		deleteSet,
		setActiveSet,
		ensureDefaults,
		ensureDirs,
	};
}

// Default singleton for production use
const DEFAULT_DIR = path.join(os.homedir(), ".claudia");
const defaultStorage = createAvatarStorage(DEFAULT_DIR);

export const {
	getConfig,
	setConfig,
	getActiveSet,
	getActiveSetPath,
	listSets,
	getSetPath,
	createSet,
	deleteSet,
	setActiveSet,
	ensureDefaults,
	ensureDirs,
} = defaultStorage;
