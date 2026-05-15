import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSkillsProgram,
	renderSkillsList,
	type SkillListItem,
} from "../../../cli/skills/subcommand.ts";
import type { LoadedDomain } from "../../../lib/domains/types.ts";
import type { DiscoveredSkill } from "../../../lib/skills/index.ts";
import { captureCliOutput } from "../../helpers/cli.ts";

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
	discoverFrameworkBundledPackageDirs: vi.fn(),
}));

vi.mock("../../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: runtimeMocks.create },
}));

vi.mock("../../../lib/packages/dev-bundled.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../../lib/packages/dev-bundled.ts")
		>();
	return {
		...actual,
		discoverFrameworkBundledPackageDirs:
			runtimeMocks.discoverFrameworkBundledPackageDirs,
	};
});

function skill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
	return {
		name: "plan",
		description: "How to structure plans",
		domain: "coding",
		dirPath: "/abs/coding/skills/plan",
		...overrides,
	};
}

function makeDomain(id: string, rootDir: string): LoadedDomain {
	return {
		manifest: { id, description: `${id} domain` },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		workflows: [],
		rootDirs: [rootDir],
	};
}

describe("renderSkillsList", () => {
	const skills: DiscoveredSkill[] = [
		skill(),
		skill({
			name: "tdd",
			description: "Test-first development",
			domain: "coding",
			dirPath: "/abs/coding/skills/tdd",
		}),
		skill({
			name: "pi",
			description: "Pi framework reference",
			domain: "shared",
			dirPath: "/abs/shared/skills/pi",
		}),
	];

	it("emits a JSON array stripped of internal dirPath", () => {
		const result = renderSkillsList(skills, "json");
		expect(result.kind).toBe("json");
		if (result.kind === "json") {
			const items = result.value as SkillListItem[];
			expect(items).toHaveLength(3);
			expect(items[0]).toEqual({
				name: "plan",
				description: "How to structure plans",
				domain: "coding",
			});
			// dirPath is an absolute filesystem detail; agents shouldn't see it.
			expect(
				(items[0] as unknown as Record<string, unknown>).dirPath,
			).toBeUndefined();
		}
	});

	it("plain mode emits tab-separated name, domain, description", () => {
		expect(renderSkillsList(skills, "plain")).toEqual({
			kind: "lines",
			lines: [
				"plan\tcoding\tHow to structure plans",
				"tdd\tcoding\tTest-first development",
				"pi\tshared\tPi framework reference",
			],
		});
	});

	it("human mode pads name and domain columns to align rows", () => {
		const rendered = renderSkillsList(skills, "human");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			// All rows should share leading-padding alignment with two-space gutter.
			expect(rendered.lines[0]).toMatch(
				/^ {2}plan {2}\s*coding\s* {2}How to structure plans$/,
			);
			expect(rendered.lines[1]).toMatch(
				/^ {2}tdd\s+ {2}\s*coding\s* {2}Test-first development$/,
			);
			expect(rendered.lines[2]).toMatch(
				/^ {2}pi\s+ {2}\s*shared\s* {2}Pi framework reference$/,
			);
		}
	});

	it("human mode emits 'No skills found.' on empty input", () => {
		expect(renderSkillsList([], "human")).toEqual({
			kind: "lines",
			lines: ["No skills found."],
		});
	});

	it("JSON mode on empty input emits an empty array", () => {
		expect(renderSkillsList([], "json")).toEqual({ kind: "json", value: [] });
	});
});

describe("createSkillsProgram", () => {
	it("returns a Commander program named 'cosmonauts skills'", () => {
		const program = createSkillsProgram();
		expect(program.name()).toBe("cosmonauts skills");
	});

	it("registers list and export subcommands", () => {
		const program = createSkillsProgram();
		const commandNames = program.commands.map((c) => c.name());
		expect(commandNames).toContain("list");
		expect(commandNames).toContain("export");
	});

	it("exposes --json, --plain, --domain, and --plugin-dir output options", () => {
		const program = createSkillsProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--json");
		expect(optionNames).toContain("--plain");
		expect(optionNames).toContain("--domain");
		expect(optionNames).toContain("--plugin-dir");
	});
});

describe("createSkillsProgram list — runtime discovery", () => {
	let output: ReturnType<typeof captureCliOutput>;

	beforeEach(() => {
		output = captureCliOutput();
		process.exitCode = undefined;
		runtimeMocks.discoverFrameworkBundledPackageDirs.mockResolvedValue([
			"/framework/bundled/coding",
		]);
		runtimeMocks.create.mockResolvedValue({
			domains: [
				makeDomain("shared", "/framework/domains/shared"),
				makeDomain("coding", "/framework/bundled/coding/coding"),
			],
			projectConfig: {},
		});
	});

	afterEach(() => {
		output.restore();
		vi.clearAllMocks();
		process.exitCode = undefined;
	});

	it("bootstraps a runtime that includes bundled package dirs", async () => {
		await createSkillsProgram().parseAsync(["--json", "list"], {
			from: "user",
		});

		expect(
			runtimeMocks.discoverFrameworkBundledPackageDirs,
		).toHaveBeenCalledWith(expect.stringMatching(/cosmonauts$/));
		expect(runtimeMocks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				bundledDirs: ["/framework/bundled/coding"],
				pluginDirs: undefined,
				domainOverride: undefined,
			}),
		);
	});

	it("forwards --domain and repeated --plugin-dir to runtime bootstrap", async () => {
		await createSkillsProgram().parseAsync(
			[
				"--json",
				"--domain",
				"coding",
				"--plugin-dir",
				"/tmp/plugin-a",
				"--plugin-dir",
				"/tmp/plugin-b",
				"list",
			],
			{ from: "user" },
		);

		expect(runtimeMocks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				domainOverride: "coding",
				pluginDirs: ["/tmp/plugin-a", "/tmp/plugin-b"],
			}),
		);
	});

	it("scans projectConfig.skillPaths in addition to domain skill dirs", async () => {
		// Stand up a tmp tree: one domain dir + one project skill path.
		const { mkdir, writeFile } = await import("node:fs/promises");
		const { mkdtemp } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "skills-runtime-"));
		const codingSkills = join(root, "coding", "skills");
		await mkdir(join(codingSkills, "tdd"), { recursive: true });
		await writeFile(
			join(codingSkills, "tdd", "SKILL.md"),
			"---\nname: tdd\ndescription: TDD\n---\n",
		);

		const extras = join(root, "extras");
		await mkdir(join(extras, "custom"), { recursive: true });
		await writeFile(
			join(extras, "custom", "SKILL.md"),
			"---\nname: custom\ndescription: A user-configured skill\n---\n",
		);

		runtimeMocks.create.mockResolvedValueOnce({
			domains: [makeDomain("coding", join(root, "coding"))],
			projectConfig: { skillPaths: [extras] },
		});

		await createSkillsProgram().parseAsync(["--json", "list"], {
			from: "user",
		});

		const items = JSON.parse(output.stdout()) as SkillListItem[];
		const names = items.map((i) => i.name).sort();
		expect(names).toEqual(["custom", "tdd"]);
		expect(items.find((i) => i.name === "custom")?.domain).toBe("project");
		expect(items.find((i) => i.name === "tdd")?.domain).toBe("coding");
	});
});
