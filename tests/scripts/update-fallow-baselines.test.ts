import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const script = resolve("scripts/update-fallow-baselines.ts");
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "baseline-refresh-"));
	roots.push(root);
	mkdirSync(join(root, ".fallow-baselines"));
	writeFileSync(
		join(root, ".fallow-baselines", "manifest.json"),
		JSON.stringify({
			version: 1,
			baselines: {
				"dead-code": {
					path: ".fallow-baselines/dead-code.json",
					sha256: "old",
					provenance: [{ action: "adopted as-is", commit: "old" }],
				},
			},
		}),
	);
	writeFileSync(join(root, ".fallow-baselines", "dead-code.json"), "old\n");
	spawnSync("git", ["init", "-q"], { cwd: root });
	spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
	spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
	spawnSync("git", ["add", "."], { cwd: root });
	spawnSync("git", ["commit", "-qm", "base"], { cwd: root });
	const executable = join(root, "fallow");
	writeFileSync(
		executable,
		'#!/bin/sh\nprintf \'{"saved":true}\\n\' > "$3"\nexit 1\n',
	);
	chmodSync(executable, 0o755);
	return root;
}

// @cosmo-behavior plan:qm-chain-safety#B-007
test("refresh rejects a missing base or reason without changing the baseline", () => {
	const root = fixture();
	const path = join(root, ".fallow-baselines", "dead-code.json");
	for (const args of [
		["--reason", "cleanup"],
		["--base", "HEAD"],
		["--base", "HEAD", "--reason", " "],
	]) {
		const result = spawnSync(
			"bun",
			[script, "--root", root, "--category", "dead-code", ...args],
			{ encoding: "utf8" },
		);
		expect(result.status).not.toBe(0);
		expect(readFileSync(path, "utf8")).toBe("old\n");
	}
});

test("reasoned refresh saves a requested baseline and appends provenance", () => {
	const root = fixture();
	const result = spawnSync(
		"bun",
		[
			script,
			"--root",
			root,
			"--category",
			"dead-code",
			"--base",
			"HEAD",
			"--reason",
			"debt cleanup",
			"--fallow",
			join(root, "fallow"),
		],
		{ encoding: "utf8" },
	);
	expect(result.status, result.stderr).toBe(0);
	expect(
		JSON.parse(
			readFileSync(join(root, ".fallow-baselines", "dead-code.json"), "utf8"),
		),
	).toEqual({ saved: true });
	const manifest = JSON.parse(
		readFileSync(join(root, ".fallow-baselines", "manifest.json"), "utf8"),
	);
	expect(manifest.baselines["dead-code"].provenance.at(-1)).toMatchObject({
		action: "refresh",
		base: "HEAD",
		reason: "debt cleanup",
	});
	expect(manifest.baselines["dead-code"].sha256).toMatch(/^[a-f0-9]{64}$/);
	expect(manifest.baselines["dead-code"].provenance.at(-1).sha256).toBe(
		manifest.baselines["dead-code"].sha256,
	);
});
