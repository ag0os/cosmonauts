import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const projectRoot = resolve(".");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture(owner = "plan:future-work") {
	const root = mkdtempSync(join(tmpdir(), "reachability-"));
	roots.push(root);
	for (const dir of [
		"lib",
		"cli",
		"missions/architecture",
		"missions/plans/future-work",
	])
		mkdirSync(join(root, dir), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		'{"type":"module","bin":{"fixture":"bin/fixture"}}',
	);
	writeFileSync(join(root, "lib/public.ts"), "export const publicValue = 1;\n");
	writeFileSync(join(root, "lib/staged.ts"), "export const stagedValue = 1;\n");
	writeFileSync(join(root, "lib/orphan.ts"), "export const orphanValue = 1;\n");
	writeFileSync(join(root, "cli/main.ts"), "export const main = 1;\n");
	writeFileSync(
		join(root, "fallow.toml"),
		'entry = ["lib/public.ts", "lib/staged.ts"]\n',
	);
	writeFileSync(
		join(root, "missions/architecture/staged-code.toml"),
		`public = ["lib/public.ts"]\n[[staged]]\npath = "lib/staged.ts"\nowner = "${owner}"\n`,
	);
	writeFileSync(
		join(root, "missions/plans/future-work/plan.md"),
		"---\nstatus: active\n---\n",
	);
	const fallow = join(root, "fallow");
	writeFileSync(fallow, "#!/bin/sh\nprintf '{\"unused_files\":[]}\\n'\n");
	execFileSync("chmod", ["+x", fallow]);
	return { root, fallow };
}

function run(root: string, fallow: string) {
	return spawnSync("bun", ["run", "check:reachability", root], {
		cwd: projectRoot,
		encoding: "utf8",
		env: { ...process.env, FALLOW_BIN: fallow },
	});
}

describe("reachability command", () => {
	test("reports an unimported lib module while accepting public and live staged roots", () => {
		const { root, fallow } = fixture();
		const result = run(root, fallow);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("lib/orphan.ts");
		expect(result.stdout).not.toContain("lib/staged.ts");
	});

	test("rejects an archived staged owner through the command", () => {
		const { root, fallow } = fixture();
		rmSync(join(root, "missions/plans/future-work"), { recursive: true });
		mkdirSync(join(root, "missions/archive/plans/future-work"), {
			recursive: true,
		});
		writeFileSync(
			join(root, "missions/archive/plans/future-work/plan.md"),
			"---\nstatus: completed\n---\n",
		);
		const result = run(root, fallow);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("plan:future-work");
		expect(result.stdout).toContain("archived or absent");
	});

	test("rejects an absent staged owner through the command", () => {
		const { root, fallow } = fixture("plan:does-not-exist");
		const result = run(root, fallow);
		expect(result.stdout).toContain(
			"staged owner archived or absent: lib/staged.ts -> plan:does-not-exist",
		);
	});

	test("accepts an exact roadmap heading as a staged owner", () => {
		const { root, fallow } = fixture("roadmap:Future work");
		writeFileSync(join(root, "ROADMAP.md"), "## Ideas\n\n### Future work\n");
		const result = run(root, fallow);
		expect(result.stdout).not.toContain("staged owner archived or absent");
		expect(result.stdout).toContain("unreachable: lib/orphan.ts");
	});

	test("does not treat a type-only import as runtime reachability", () => {
		const { root, fallow } = fixture();
		writeFileSync(
			join(root, "lib/run-loop.ts"),
			"export interface Loop { id: string }\nexport function run() { return 1; }\n",
		);
		writeFileSync(
			join(root, "cli/main.ts"),
			'import type { Loop } from "../lib/run-loop.ts";\nexport const id: Loop = { id: "one" };\n',
		);
		const result = run(root, fallow);
		expect(result.stdout).toContain("unreachable: lib/run-loop.ts");
	});

	test("rejects an entry outside the public and staged declarations", () => {
		const { root, fallow } = fixture();
		writeFileSync(
			join(root, "fallow.toml"),
			'entry = ["lib/public.ts", "lib/staged.ts", "lib/orphan.ts"]\n',
		);
		const result = run(root, fallow);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("undeclared entry: lib/orphan.ts");
	});

	test("rejects a declared staged path absent from Fallow entry", () => {
		const { root, fallow } = fixture();
		writeFileSync(join(root, "fallow.toml"), 'entry = ["lib/public.ts"]\n');
		const result = run(root, fallow);
		expect(result.stdout).toContain("missing entry: lib/staged.ts");
	});
});
