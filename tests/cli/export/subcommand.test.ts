import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExportProgram } from "../../../cli/export/subcommand.ts";
import type { BuildAgentPackageOptions } from "../../../lib/agent-packages/build.ts";
import type {
	AgentPackage,
	AgentPackageDefinition,
} from "../../../lib/agent-packages/types.ts";
import { AgentRegistry } from "../../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const packageMocks = vi.hoisted(() => ({
	buildAgentPackage: vi.fn(),
	compileAgentPackageBinary: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
	discoverFrameworkBundledPackageDirs: vi.fn(),
}));

vi.mock("../../../lib/agent-packages/build.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../../lib/agent-packages/build.ts")
		>();
	return {
		...actual,
		buildAgentPackage: packageMocks.buildAgentPackage,
	};
});

vi.mock("../../../lib/agent-packages/export.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../../lib/agent-packages/export.ts")
		>();
	return {
		...actual,
		compileAgentPackageBinary: packageMocks.compileAgentPackageBinary,
	};
});

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

const tmp = useTempDir("export-subcommand-");

const explorerAgent = makeAgent({
	id: "explorer",
	domain: "coding",
	description: "Explore repositories.",
	capabilities: ["core"],
	tools: "readonly",
	skills: ["tdd"],
});
const plannerAgent = makeAgent({
	id: "planner",
	domain: "coding",
	description: "Plan implementation work.",
	capabilities: ["core", "spawning", "tasks"],
	extensions: ["orchestration"],
	subagents: ["worker"],
	tools: "coding",
});

function makeAgent(overrides: Partial<AgentDefinition>): AgentDefinition {
	return {
		id: "agent",
		description: "Test agent.",
		capabilities: ["core"],
		model: "anthropic/claude-sonnet-4-5",
		tools: "readonly",
		extensions: [],
		skills: [],
		projectContext: true,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
}

function makePackage(overrides: Partial<AgentPackage> = {}): AgentPackage {
	return {
		schemaVersion: 1,
		packageId: "package-from-build",
		description: "Built package.",
		systemPrompt: "Packaged system prompt.",
		tools: "readonly",
		skills: [],
		projectContext: "omit",
		target: "claude-cli",
		targetOptions: {},
		...overrides,
	};
}

function setupRuntime(
	agents: readonly AgentDefinition[] = [explorerAgent],
): void {
	runtimeMocks.discoverFrameworkBundledPackageDirs.mockResolvedValue([
		"/framework/bundled/coding",
	]);
	runtimeMocks.create.mockResolvedValue({
		agentRegistry: new AgentRegistry(agents),
		domainContext: "coding",
		domainsDir: "/framework/domains",
		domainResolver: undefined,
		projectSkills: undefined,
		skillPaths: [],
	});
}

async function parseExport(args: readonly string[]): Promise<void> {
	await createExportProgram().parseAsync([...args], { from: "user" });
}

describe("createExportProgram", () => {
	let output: ReturnType<typeof captureCliOutput>;

	beforeEach(() => {
		output = captureCliOutput();
		process.exitCode = undefined;
		packageMocks.buildAgentPackage.mockResolvedValue(makePackage());
		packageMocks.compileAgentPackageBinary.mockResolvedValue(undefined);
		setupRuntime();
	});

	afterEach(() => {
		output.restore();
		vi.clearAllMocks();
		process.exitCode = undefined;
	});

	it("documents input modes, supported target, examples, and billing safety in help", () => {
		const help = createExportProgram().helpInformation();

		expect(help).toMatch(/Provide exactly one\s+input/);
		expect(help).toContain("[agent-id] or --definition <path>");
		expect(help).toContain("Phase 1 supports target: claude-cli");
		expect(help).toContain(
			"cosmonauts export --definition ./agent-package.json --out ./bin/agent",
		);
		expect(help).toContain(
			"cosmonauts export coding/explorer --target claude-cli --out",
		);
		expect(help).toContain("./bin/explorer-claude");
		expect(help).toContain("ANTHROPIC_API_KEY");
		expect(help).toContain("--allow-api-billing");
	});

	it("exports a package definition and prints one success JSON line", async () => {
		const definitionPath = join(tmp.path, "package.json");
		const outPath = join(tmp.path, "bin", "explorer-claude");
		const definition = {
			schemaVersion: 1,
			id: "external-explorer",
			description: "External explorer.",
			prompt: { kind: "inline", content: "Explore safely." },
			tools: { preset: "readonly" },
			skills: { mode: "none" },
			projectContext: "omit",
			targets: { "claude-cli": { promptMode: "append" } },
		} satisfies AgentPackageDefinition;
		await writeFile(definitionPath, JSON.stringify(definition), "utf-8");
		packageMocks.buildAgentPackage.mockResolvedValue(
			makePackage({ packageId: definition.id }),
		);

		await parseExport(["--definition", definitionPath, "--out", outPath]);

		expect(packageMocks.buildAgentPackage).toHaveBeenCalledWith(
			expect.objectContaining({
				definition,
				target: "claude-cli",
			}),
		);
		expect(packageMocks.compileAgentPackageBinary).toHaveBeenCalledWith({
			agentPackage: expect.objectContaining({ packageId: definition.id }),
			outFile: outPath,
		});
		expect(output.stderr()).toBe("");
		expect(output.stdout()).toBe(
			`${JSON.stringify({ packageId: definition.id, target: "claude-cli", outputPath: outPath })}\n`,
		);
	});

	it("exports an agent-id shorthand through a generated package definition", async () => {
		const outPath = join(tmp.path, "explorer");
		packageMocks.buildAgentPackage.mockResolvedValue(
			makePackage({ packageId: "coding-explorer-claude-cli" }),
		);

		await parseExport([
			"coding/explorer",
			"--target",
			"claude-cli",
			"--out",
			outPath,
		]);

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
		const buildOptions = packageMocks.buildAgentPackage.mock
			.calls[0]?.[0] as BuildAgentPackageOptions;
		expect(buildOptions.definition).toMatchObject({
			id: "coding-explorer-claude-cli",
			sourceAgent: "coding/explorer",
			prompt: { kind: "source-agent" },
			tools: { preset: "readonly" },
			skills: { mode: "source-agent" },
			targets: { "claude-cli": {} },
		});
		expect(packageMocks.compileAgentPackageBinary).toHaveBeenCalledWith(
			expect.objectContaining({ outFile: outPath }),
		);
	});

	it("prints success JSON with packageId, target, and outputPath", async () => {
		const definitionPath = join(tmp.path, "json-shape.json");
		const outPath = join(tmp.path, "shape");
		await writeFile(
			definitionPath,
			JSON.stringify({
				schemaVersion: 1,
				id: "shape-agent",
				description: "Shape agent.",
				prompt: { kind: "inline", content: "Shape." },
				tools: { preset: "none" },
				skills: { mode: "none" },
				projectContext: "omit",
				targets: {},
			}),
			"utf-8",
		);
		packageMocks.buildAgentPackage.mockResolvedValue(
			makePackage({ packageId: "shape-agent" }),
		);

		await parseExport(["--definition", definitionPath, "--out", outPath]);

		const lines = output.stdout().trimEnd().split("\n");
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] ?? "{}")).toEqual({
			packageId: "shape-agent",
			target: "claude-cli",
			outputPath: outPath,
		});
	});

	it("fails unknown agent-id before building or compiling", async () => {
		setupRuntime([]);

		await expect(
			parseExport(["coding/missing", "--out", join(tmp.path, "missing")]),
		).rejects.toThrow(/unknown agent.*coding\/missing/i);
		expect(packageMocks.buildAgentPackage).not.toHaveBeenCalled();
		expect(packageMocks.compileAgentPackageBinary).not.toHaveBeenCalled();
	});

	it("rejects unsupported targets before building or compiling", async () => {
		const definitionPath = join(tmp.path, "codex.json");
		await writeFile(
			definitionPath,
			JSON.stringify({
				schemaVersion: 1,
				id: "future-agent",
				description: "Future agent.",
				prompt: { kind: "inline", content: "Future." },
				tools: { preset: "readonly" },
				skills: { mode: "none" },
				projectContext: "omit",
				targets: { codex: {} },
			}),
			"utf-8",
		);

		await expect(
			parseExport([
				"--definition",
				definitionPath,
				"--target",
				"codex",
				"--out",
				"x",
			]),
		).rejects.toThrow(/unsupported-target.*codex.*claude-cli/i);
		expect(packageMocks.buildAgentPackage).not.toHaveBeenCalled();
		expect(packageMocks.compileAgentPackageBinary).not.toHaveBeenCalled();
	});

	it("fails nonportable source-agent shorthand before compiling", async () => {
		setupRuntime([plannerAgent]);
		packageMocks.buildAgentPackage.mockRejectedValue(
			new Error(
				'Raw source-agent prompt export is not supported for "coding/planner" because it uses extensions (orchestration), subagents (worker), extension-backed capabilities (spawning, tasks). Create a package definition with prompt.kind "file" or "inline" and an external-safe prompt.',
			),
		);

		await expect(
			parseExport(["coding/planner", "--out", join(tmp.path, "planner")]),
		).rejects.toThrow(
			/extensions \(orchestration\).*subagents \(worker\).*extension-backed capabilities \(spawning, tasks\).*--definition <path>/i,
		);
		expect(packageMocks.compileAgentPackageBinary).not.toHaveBeenCalled();
	});

	it("passes domain and repeated plugin-dir options to runtime bootstrap", async () => {
		await parseExport([
			"explorer",
			"--domain",
			"coding",
			"--plugin-dir",
			"/tmp/plugin-a",
			"--plugin-dir",
			"/tmp/plugin-b",
			"--out",
			join(tmp.path, "explorer"),
		]);

		expect(runtimeMocks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				domainOverride: "coding",
				pluginDirs: ["/tmp/plugin-a", "/tmp/plugin-b"],
			}),
		);
	});
});
