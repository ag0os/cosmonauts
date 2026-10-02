import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { directScopeRefusal } from "../../lib/lean-run/direct-scope.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("direct-scope-");

async function makeDirs(...dirs: string[]): Promise<void> {
	for (const dir of dirs) await mkdir(join(tmp.path, dir), { recursive: true });
}

describe("directScopeRefusal in a project with none of the default source roots", () => {
	test.each([
		"Fix `app/x.ts` and add a test in `spec/x_spec.rb`.",
		"Fix `app/x.ts` and document it in `README.md`.",
		"Crash at /srv/app/x.ts:3 — fix `app/x.ts`.",
		"Use `and/or` in `app/x.ts`.",
		"Bump `@scope/pkg` used by `app/x.ts`.",
		"Upgrade to v0.87.1/0.88.0 in app/x.ts.",
	])("refuses nothing: %s", async (request) => {
		await makeDirs("app", "spec");

		expect(
			await directScopeRefusal({ projectRoot: tmp.path, request }),
		).toBeUndefined();
	});
});

describe("directScopeRefusal in a project with source roots", () => {
	test("does not count a glob as a module", async () => {
		await makeDirs("lib");

		expect(
			await directScopeRefusal({
				projectRoot: tmp.path,
				request:
					"Rename foo in `lib/agents/skills.ts` and its uses in `lib/**/*.ts`.",
			}),
		).toBeUndefined();
	});

	test("reads the latest non-blank user message", async () => {
		await makeDirs("cli");

		expect(
			await directScopeRefusal({
				projectRoot: tmp.path,
				request: "Make the plain listings tab-separated.",
				userMessages: [
					"Fix `cli/plans/list.ts` and `cli/tasks/shared.ts`.",
					"",
				],
			}),
		).toContain("name 2 (cli/plans, cli/tasks)");
	});

	test("names the request and the user's message as the source of the modules", async () => {
		await makeDirs("cli");

		expect(
			await directScopeRefusal({
				projectRoot: tmp.path,
				request: "Make the plain listings tab-separated.",
				userMessages: ["Fix `cli/plans/list.ts` and `cli/tasks/shared.ts`."],
			}),
		).toBe(
			"direct runs cover one module; request and user message name 2 (cli/plans, cli/tasks): write missions/lean/<slug>/plan.md and pass planPath",
		);
	});
});
