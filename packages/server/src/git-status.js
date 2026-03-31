import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGitStatus(cwd) {
	if (!cwd) return { isGit: false };

	try {
		const [branchResult, statusResult] = await Promise.all([
			execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd,
				timeout: 5000,
			}),
			execFileAsync("git", ["status", "--porcelain", "-uno"], {
				cwd,
				timeout: 5000,
			}),
		]);

		return {
			isGit: true,
			branch: branchResult.stdout.trim(),
			dirty: statusResult.stdout.trim().length > 0,
		};
	} catch {
		return { isGit: false };
	}
}
