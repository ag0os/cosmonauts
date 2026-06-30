import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();

interface BiomeConfig {
	vcs?: {
		useIgnoreFile?: unknown;
	};
	files?: {
		includes?: unknown;
	};
}

describe("biome.json", () => {
	test("does not blanket-exclude missions while git still ignores transcripts @cosmo-behavior plan:task-id-system#B-012", async () => {
		const config = JSON.parse(
			await readFile(join(projectRoot, "biome.json"), "utf-8"),
		) as BiomeConfig;
		const includes = Array.isArray(config.files?.includes)
			? config.files.includes
			: [];

		expect(config.vcs?.useIgnoreFile).toBe(true);
		expect(includes).not.toContain("!missions");
		expect(includes).not.toContain("!missions/**");
		expect(includes).not.toContain("!missions/**/*");
		expect(await isGitIgnored("missions/tasks/TASK-999 - Example.md")).toBe(
			false,
		);
		expect(await isGitIgnored("missions/sessions/example.transcript.md")).toBe(
			true,
		);
		expect(
			await isGitIgnored("missions/archive/sessions/example.transcript.md"),
		).toBe(true);
	});
});

async function isGitIgnored(path: string): Promise<boolean> {
	try {
		await execFileAsync("git", ["check-ignore", "--quiet", path], {
			cwd: projectRoot,
		});
		return true;
	} catch (error) {
		if ((error as { code?: unknown }).code === 1) {
			return false;
		}
		throw error;
	}
}
