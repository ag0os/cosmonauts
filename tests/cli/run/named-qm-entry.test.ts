import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import chains from "../../../bundled/coding/chains.ts";
import { executeChainExpression } from "../../../cli/chain-execution.ts";
import { createRunProgram } from "../../../cli/run/subcommand.ts";
import { AgentRegistry } from "../../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { renderQualityReviewReport } from "../../../lib/orchestration/quality-review-report.ts";
import type { AgentSpawner } from "../../../lib/orchestration/types.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import { captureCliOutput } from "../../helpers/cli.ts";

const spawner = vi.hoisted(() => ({
	current: undefined as AgentSpawner | undefined,
}));

vi.mock("../../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => spawner.current,
	getModelForRole: () => "test/model",
	getThinkingForRole: () => undefined,
}));

const agent = (id: string, loop = false): AgentDefinition => ({
	id,
	domain: "coding",
	description: id,
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop,
});

let root: string | undefined;

afterEach(async () => {
	if (root) await rm(root, { recursive: true, force: true });
	root = undefined;
	spawner.current = undefined;
	process.exitCode = undefined;
});

test.each([
	"verify",
	"implement",
])("runs the shipped %s named chain through the CLI to a terminal QM report", async (name) => {
	root = await mkdtemp(join(tmpdir(), "named-qm-entry-"));
	const projectRoot = root;
	execFileSync("git", ["init", "-q"], { cwd: projectRoot });
	execFileSync("git", ["config", "user.email", "test@example.com"], {
		cwd: projectRoot,
	});
	execFileSync("git", ["config", "user.name", "Test"], { cwd: projectRoot });
	await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
	execFileSync("git", ["add", ".gitignore"], { cwd: projectRoot });
	execFileSync("git", ["commit", "-qm", "base"], { cwd: projectRoot });
	if (name === "implement") {
		const tasks = new TaskManager(projectRoot);
		await tasks.init();
		const task = await tasks.createTask({ title: "Completed work" });
		await tasks.updateTask(task.id, { status: "Cancelled" });
	}

	const spawned: string[] = [];
	spawner.current = {
		spawn: vi.fn(async (config) => {
			spawned.push(config.role);
			return {
				success: true,
				sessionId: `session-${config.role}`,
				messages: [],
			};
		}),
		dispose: vi.fn(),
	};
	const registry = new AgentRegistry([
		agent("quality-manager"),
		agent("task-manager"),
		agent("coordinator", true),
		agent("integration-verifier"),
		agent("fixer"),
	]);
	const runtime = {
		chains,
		domains: [],
		domainsDir: join(projectRoot, "domains"),
		agentRegistry: registry,
		projectSkills: [],
		skillPaths: [],
	} as never;
	const review = vi.fn(async () => ({
		markdown: renderQualityReviewReport({
			verdict: "not-ready",
			reason: "entry-point finding",
		}),
	}));
	const output = captureCliOutput();
	try {
		const program = createRunProgram({
			createContext: async () => ({
				cwd: projectRoot,
				frameworkRoot: projectRoot,
				domainsDir: join(projectRoot, "domains"),
				runtime,
			}),
			executeChain: (input) =>
				executeChainExpression({
					...input,
					qualityReview: { execute: review },
				}),
		});
		program.exitOverride();
		await program.parseAsync(["chain", name, "review changes"], {
			from: "user",
		});
		const { chain, result } = JSON.parse(output.stdout());
		expect(chain).toMatchObject({ source: "named", name });
		expect(result.success, JSON.stringify(result)).toBe(true);
		expect(
			result.stageResults.map(
				(stage: { stage: { name: string } }) => stage.stage.name,
			),
		).toEqual(
			chains.find((candidate) => candidate.name === name)?.chain.split(" -> "),
		);
		expect(result.stageResults.at(-1).stage.name).toBe("quality-manager");
		expect(result.stageResults.at(-1).artifacts[0].id).toBe("qm/final.md");
		expect(review).toHaveBeenCalledTimes(1);
		expect(spawned).not.toContain("quality-manager");
		const report = await readFile(
			join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.stageResults.at(-1).run.runId,
				"artifacts",
				"qm",
				"final.md",
			),
			"utf8",
		);
		expect(report).toContain("Verdict: not-ready");
		if (name === "verify") expect(result.run.runId).toMatch(/^chain-/);
	} finally {
		output.restore();
	}
});
