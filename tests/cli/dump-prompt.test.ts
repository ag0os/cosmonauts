import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const CLI_PATH = join(REPO_ROOT, "bin", "cosmonauts");

let tempRoot: string;
let projectRoot: string;

beforeEach(async () => {
	tempRoot = await mkdtemp(join(tmpdir(), "cosmo-dump-prompt-"));
	projectRoot = join(tempRoot, "project");
	await mkdir(projectRoot, { recursive: true });
});

afterEach(async () => {
	await rm(tempRoot, { recursive: true, force: true });
});

async function dumpPrompt(args: readonly string[] = []): Promise<string> {
	const { stdout } = await execFileAsync(
		"bun",
		[CLI_PATH, "--dump-prompt", ...args],
		{
			cwd: projectRoot,
			encoding: "utf-8",
			env: { ...process.env, HOME: tempRoot },
		},
	);
	return String(stdout);
}

describe("--dump-prompt", () => {
	test("defaults to main/cosmo when no agent is provided", async () => {
		const prompt = await dumpPrompt();

		expect(prompt).toContain("You are Cosmo");
		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:main/cosmo -->");
	});

	test("uses the explicit cody agent when provided", async () => {
		const prompt = await dumpPrompt(["-a", "cody"]);

		expect(prompt).toContain("You are Cody");
		expect(prompt).not.toContain("You are Cosmo");
		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:coding/cody -->");
	});
});
