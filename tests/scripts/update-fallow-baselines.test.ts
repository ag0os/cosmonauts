import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
	spawnSync("git", ["commit", "--allow-empty", "-qm", "base"], {
		cwd: root,
	});
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

test("refresh analyzes the base commit despite ahead and dirty findings", () => {
	const root = fixture();
	writeFileSync(join(root, "findings.json"), '{"findings":["base"]}\n');
	spawnSync("git", ["add", "findings.json"], { cwd: root });
	spawnSync("git", ["commit", "-qm", "base findings"], { cwd: root });
	const base = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).stdout.trim();
	writeFileSync(join(root, "findings.json"), '{"findings":["base","ahead"]}\n');
	spawnSync("git", ["add", "findings.json"], { cwd: root });
	spawnSync("git", ["commit", "-qm", "ahead findings"], { cwd: root });
	writeFileSync(
		join(root, "findings.json"),
		'{"findings":["base","ahead","dirty"]}\n',
	);
	mkdirSync(join(root, "node_modules"));
	writeFileSync(join(root, "node_modules", "fixture"), "installed");
	const executable = join(root, "fallow");
	writeFileSync(
		executable,
		'#!/bin/sh\ntest -f node_modules/fixture || exit 2\ncat findings.json > "$3"\n',
	);
	const result = spawnSync(
		"bun",
		[
			script,
			"--root",
			root,
			"--category",
			"dead-code",
			"--base",
			base,
			"--reason",
			"base only",
			"--fallow",
			executable,
		],
		{ encoding: "utf8" },
	);
	expect(result.status, result.stderr).toBe(0);
	expect(
		JSON.parse(
			readFileSync(join(root, ".fallow-baselines", "dead-code.json"), "utf8"),
		),
	).toEqual({ findings: ["base"] });
	const manifest = JSON.parse(
		readFileSync(join(root, ".fallow-baselines", "manifest.json"), "utf8"),
	);
	expect(manifest.baselines["dead-code"].provenance.at(-1).baseCommit).toBe(
		base,
	);
});

function healthFixture() {
	const root = fixture();
	const data = {
		finding_counts: {
			"old/file.ts": { crap_moderate: { count: 2 } },
			"keep.ts": { complexity_high: { count: 1 } },
		},
		ignored: ["unchanged"],
	};
	const content = `${JSON.stringify(data, null, 2)}\n`;
	const path = join(root, ".fallow-baselines", "health.json");
	writeFileSync(path, content);
	const manifestPath = join(root, ".fallow-baselines", "manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	manifest.baselines.health = {
		path: ".fallow-baselines/health.json",
		sha256: hash(content),
		provenance: [{ action: "adopted" }],
	};
	writeFileSync(manifestPath, JSON.stringify(manifest));
	return { root, data, path, manifestPath, content };
}
function hash(content: string) {
	return createHash("sha256").update(content).digest("hex");
}
function rekey(root: string, mapping: unknown) {
	const mappingPath = join(root, "mapping.json");
	writeFileSync(mappingPath, JSON.stringify(mapping));
	return spawnSync(
		"bun",
		[
			script,
			"--root",
			root,
			"--base",
			"HEAD",
			"--reason",
			"Approved path-only moves",
			"--category",
			"health",
			"--rekey-paths",
			mappingPath,
		],
		{ encoding: "utf8" },
	);
}

test("path-only mode preserves counts and other data and records matching provenance without a scan", () => {
	const { root, data, path, manifestPath, content } = healthFixture();
	const result = rekey(root, { "old/file.ts": "new/file.ts" });
	expect(result.status).toBe(0);
	const after = readFileSync(path, "utf8");
	expect(JSON.parse(after)).toEqual({
		...data,
		finding_counts: {
			"new/file.ts": data.finding_counts["old/file.ts"],
			"keep.ts": data.finding_counts["keep.ts"],
		},
	});
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	expect(manifest.baselines.health.sha256).toBe(hash(after));
	expect(manifest.baselines.health.provenance).toHaveLength(2);
	expect(manifest.baselines.health.provenance[1]).toMatchObject({
		action: "path-rekey",
		priorSha256: hash(content),
		sha256: hash(after),
		reason: "Approved path-only moves",
		mapping: JSON.stringify({ "old/file.ts": "new/file.ts" }),
	});
	expect(
		readFileSync(join(root, ".fallow-baselines", "dead-code.json"), "utf8"),
	).toBe("old\n");
});

test.each([
	{},
	{ "missing.ts": "new.ts" },
	{ "old/file.ts": "keep.ts" },
	{ "old/file.ts": "../escape.ts" },
])("invalid path moves leave both baseline and manifest unchanged: %j", (mapping) => {
	const { root, path, manifestPath, content } = healthFixture();
	const before = readFileSync(manifestPath, "utf8");
	expect(rekey(root, mapping).status).not.toBe(0);
	expect(readFileSync(path, "utf8")).toBe(content);
	expect(readFileSync(manifestPath, "utf8")).toBe(before);
});

test("path-only mode refuses a stale manifest hash before writing", () => {
	const { root, path, manifestPath } = healthFixture();
	writeFileSync(path, '{"finding_counts":{}}');
	const before = readFileSync(manifestPath, "utf8");
	const result = rekey(root, { "old/file.ts": "new/file.ts" });
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain("does not match its manifest hash");
	expect(readFileSync(path, "utf8")).toBe('{"finding_counts":{}}');
	expect(readFileSync(manifestPath, "utf8")).toBe(before);
});
