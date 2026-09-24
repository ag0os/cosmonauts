import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createSnapshotAnalysisAuthorization } from "../../domains/shared/extensions/project-tools/analysis-consent.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

// @cosmo-behavior plan:qm-chain-safety#B-002
it("maps source consent to one verified snapshot for one run only", async () => {
	const root = await mkdtemp(join(tmpdir(), "snapshot-consent-"));
	roots.push(root);
	const sourceRoot = join(root, "source");
	const snapshotRoot = join(root, "snapshot");
	const userStateRoot = join(root, "state");
	await Promise.all([
		mkdir(sourceRoot),
		mkdir(snapshotRoot),
		mkdir(userStateRoot),
	]);
	await writeFile(
		join(userStateRoot, "analysis-execution-consent.json"),
		JSON.stringify({
			schemaVersion: 1,
			projects: { [await realpath(sourceRoot)]: { providers: ["fallow"] } },
		}),
	);
	const consent = await createSnapshotAnalysisAuthorization({
		sourceRoot,
		snapshotRoot,
		userStateRoot,
		runId: "run-1",
		providerId: "fallow",
	});
	expect(
		consent.authorizationFor({
			runId: "run-1",
			snapshotRoot,
			providerId: "fallow",
		}),
	).toEqual({
		canonicalProjectRoot: consent.snapshotRealPath,
		consented: true,
	});
	expect(() =>
		consent.authorizationFor({
			runId: "run-2",
			snapshotRoot,
			providerId: "fallow",
		}),
	).toThrow("scope mismatch");
	expect(() =>
		consent.authorizationFor({
			runId: "run-1",
			snapshotRoot: sourceRoot,
			providerId: "fallow",
		}),
	).toThrow("scope mismatch");
	expect(() =>
		consent.authorizationFor({
			runId: "run-1",
			snapshotRoot,
			providerId: "other",
		}),
	).toThrow("scope mismatch");
	expect("sourceRealPath" in consent).toBe(false);
	consent.dispose();
	expect(() =>
		consent.authorizationFor({
			runId: "run-1",
			snapshotRoot,
			providerId: "fallow",
		}),
	).toThrow("scope mismatch");
});
