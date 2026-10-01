/**
 * Tests for lib/code-health/fallow-function-metrics.ts: narrowing Fallow's
 * `health --format json` findings into per-function metrics.
 */

import { chmod, mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	PINNED_FALLOW_VERSION,
	parseFallowHealthFunctions,
	resolveFallowExecutable,
} from "../../lib/code-health/fallow-function-metrics.ts";
import { useTempDir } from "../helpers/fs.ts";

function report(findings: unknown[]): string {
	return JSON.stringify({ schema_version: 4, version: "2.54.2", findings });
}

const FINDING = {
	path: "src/sample.ts",
	name: "<arrow>",
	line: 12,
	col: 4,
	cyclomatic: 3,
	cognitive: 2,
	line_count: 5,
	crap: 6.5,
	coverage_tier: "none",
};

describe("parseFallowHealthFunctions", () => {
	test("maps a finding to an inclusive line range and its metrics", () => {
		expect(parseFallowHealthFunctions(report([FINDING]))).toEqual([
			{
				file: "src/sample.ts",
				name: "<arrow>",
				startLine: 12,
				endLine: 16,
				cyclomatic: 3,
				cognitive: 2,
				crap: 6.5,
			},
		]);
	});

	test("reports CRAP as null when Fallow omits it", () => {
		const { crap: _omitted, ...withoutCrap } = FINDING;

		expect(
			parseFallowHealthFunctions(report([withoutCrap]))[0]?.crap,
		).toBeNull();
	});

	test("rejects a finding with a non-numeric metric", () => {
		expect(() =>
			parseFallowHealthFunctions(report([{ ...FINDING, cyclomatic: "3" }])),
		).toThrow("fallow health finding 0 has an unexpected shape");
	});

	test("rejects output without a findings array", () => {
		expect(() => parseFallowHealthFunctions("{}")).toThrow(
			"fallow health JSON has no findings array",
		);
	});

	test("rejects output that is not JSON", () => {
		expect(() => parseFallowHealthFunctions("WARN something")).toThrow(
			"fallow health did not print JSON",
		);
	});
});

describe("resolveFallowExecutable", () => {
	const tmp = useTempDir("fallow-resolve-");
	const platformPackage = `@fallow-cli/${process.platform}-${process.arch}`;

	async function installFallow(root: string, version: string, binary = true) {
		const fallowDir = join(root, "node_modules", "fallow");
		await mkdir(fallowDir, { recursive: true });
		await writeFile(
			join(fallowDir, "package.json"),
			JSON.stringify({
				name: "fallow",
				version,
				optionalDependencies: { [platformPackage]: version },
			}),
		);
		if (!binary) return;
		const platformDir = join(
			root,
			"node_modules",
			...platformPackage.split("/"),
		);
		await mkdir(platformDir, { recursive: true });
		await writeFile(
			join(platformDir, "package.json"),
			JSON.stringify({ name: platformPackage, version }),
		);
		const executable = join(
			platformDir,
			process.platform === "win32" ? "fallow.exe" : "fallow",
		);
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o755);
	}

	test("finds the pinned fallow in the package's own node_modules", async () => {
		const pkg = join(tmp.path, "project", "node_modules", "cosmonauts");
		await installFallow(pkg, PINNED_FALLOW_VERSION);
		const found = await resolveFallowExecutable(undefined, { searchFrom: pkg });
		expect(await realpath(found)).toBe(
			await realpath(
				join(
					pkg,
					"node_modules",
					...platformPackage.split("/"),
					process.platform === "win32" ? "fallow.exe" : "fallow",
				),
			),
		);
	});

	test("finds a copy hoisted into the consumer project", async () => {
		const project = join(tmp.path, "project");
		const pkg = join(project, "node_modules", "cosmonauts");
		await mkdir(pkg, { recursive: true });
		await installFallow(project, PINNED_FALLOW_VERSION);
		await expect(
			resolveFallowExecutable(undefined, { searchFrom: pkg }),
		).resolves.toContain(join(project, "node_modules", "@fallow-cli"));
	});

	test("refuses a hoisted fallow of another version and names it", async () => {
		const project = join(tmp.path, "project");
		const pkg = join(project, "node_modules", "cosmonauts");
		await mkdir(pkg, { recursive: true });
		await installFallow(project, "2.53.0");
		await expect(
			resolveFallowExecutable(undefined, { searchFrom: pkg }),
		).rejects.toThrow(
			/fallow 2\.54\.2 is not installed.*found: .*node_modules\/fallow is 2\.53\.0/,
		);
	});

	test("prefers the pinned copy over a nearer copy of another version", async () => {
		const project = join(tmp.path, "project");
		const pkg = join(project, "node_modules", "cosmonauts");
		await installFallow(pkg, "2.53.0");
		await installFallow(project, PINNED_FALLOW_VERSION);
		await expect(
			resolveFallowExecutable(undefined, { searchFrom: pkg }),
		).resolves.toContain(join(project, "node_modules", "@fallow-cli"));
	});

	test("reports a pinned package without a platform binary", async () => {
		const pkg = join(tmp.path, "pkg");
		await installFallow(pkg, PINNED_FALLOW_VERSION, false);
		await expect(
			resolveFallowExecutable(undefined, { searchFrom: pkg }),
		).rejects.toThrow(/has no binary for this platform/);
	});

	test("fails with an install hint when no fallow exists upward", async () => {
		const pkg = join(tmp.path, "empty", "node_modules", "cosmonauts");
		await mkdir(pkg, { recursive: true });
		await expect(
			resolveFallowExecutable(undefined, { searchFrom: pkg }),
		).rejects.toThrow(/install fallow@2\.54\.2/);
	});

	test("returns an explicit executable without searching", async () => {
		await expect(resolveFallowExecutable("/custom/fallow")).resolves.toBe(
			"/custom/fallow",
		);
	});
});
