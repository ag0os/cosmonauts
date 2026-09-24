import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProjectConfig } from "../../lib/config/index.ts";
import {
	HOST_GATE_OWNED_DIRECTORY,
	HOST_GATE_OWNED_PATHS,
} from "../../lib/orchestration/quality-review-run.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const archivedRoundsDir = "missions/archive/reviews/qm/shared-rounds";

function gitInRepo(args: string[]): { status: number | null; stdout: string } {
	const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
	return { status: result.status, stdout: result.stdout };
}

function trackedFilesUnder(path: string): string[] {
	return gitInRepo(["ls-files", "-z", "--", path])
		.stdout.split("\0")
		.filter(Boolean);
}

describe("quality review repository pins", () => {
	// @cosmo-behavior plan:qm-chain-safety#B-008
	it("keeps every gate-owned path tracked in this repository", async () => {
		const configured =
			(await loadProjectConfig(repoRoot)).qualityReview?.gateOwnedPaths ?? [];
		const missing = [
			...HOST_GATE_OWNED_PATHS,
			HOST_GATE_OWNED_DIRECTORY,
			...configured,
		].filter((path) => trackedFilesUnder(path).length === 0);
		expect(configured.length).toBeGreaterThan(0);
		expect(missing).toEqual([]);
	});

	// @cosmo-behavior plan:qm-chain-safety#B-012
	it("links no live surface to a former shared review-round path", async () => {
		const formerPaths = (await readdir(`${repoRoot}/${archivedRoundsDir}`))
			.filter((name) => /-round-\d+\.md$/.test(name))
			.map((name) => `missions/reviews/${name}`);
		expect(formerPaths).toHaveLength(11);
		const search = gitInRepo([
			"grep",
			"-l",
			"-F",
			...formerPaths.flatMap((path) => ["-e", path]),
			"--",
			".",
			":!missions/archive/",
			":!missions/reviews/",
			":!knowledge/",
			":!tests/fixtures/",
			":!missions/plans/qm-chain-safety/*review*",
		]);
		expect(search.stdout.split("\n").filter(Boolean)).toEqual([]);
		expect(search.status).toBe(1);
	});
});
