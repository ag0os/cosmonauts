import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { buildAgentPackage } from "../../lib/agent-packages/build.ts";
import { rawSourcePromptIssues } from "../../lib/agent-packages/compatibility.ts";
import {
	definitionFromAgent,
	loadAgentPackageDefinition,
} from "../../lib/agent-packages/definition.ts";
import { compileAgentPackageBinary } from "../../lib/agent-packages/export.ts";
import type {
	AgentPackageDefinition,
	SupportedExportTarget,
} from "../../lib/agent-packages/types.ts";
import { qualifyRole } from "../../lib/agents/qualified-role.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { discoverFrameworkBundledPackageDirs } from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

interface ExportOptions {
	readonly definition?: string;
	readonly out?: string;
	readonly target?: string;
	readonly domain?: string;
	readonly pluginDir?: string[];
}

interface ResolvedExportInput {
	readonly definition: AgentPackageDefinition;
	readonly sourceAgent?: AgentDefinition;
	readonly shorthandAgentId?: string;
}

const SUPPORTED_TARGET: SupportedExportTarget = "claude-cli";

export function createExportProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts export")
		.description(
			`Export a Cosmonauts agent package as a standalone binary. Provide exactly one input: [agent-id] or --definition <path>. Phase 1 supports target: ${SUPPORTED_TARGET}. Examples: cosmonauts export --definition ./agent-package.json --out ./bin/agent; cosmonauts export coding/explorer --target claude-cli --out ./bin/explorer-claude. The exported binary omits ANTHROPIC_API_KEY from Claude's environment by default to preserve subscription auth; pass --allow-api-billing to the exported binary to opt into API billing.`,
		)
		.argument("[agent-id]", "Source agent id to export as shorthand")
		.option("--definition <path>", "Agent package definition JSON path")
		.requiredOption("--out <path>", "Output binary path")
		.option(
			"--target <target>",
			`Export target. Phase 1 supports: ${SUPPORTED_TARGET}`,
			SUPPORTED_TARGET,
		)
		.option("--domain <id>", "Set domain context for agent resolution")
		.option(
			"--plugin-dir <path>",
			"Add a directory as a session-only domain source (repeatable)",
			(value: string, previous: string[]) => [...previous, value],
			[] as string[],
		)
		.action(async (agentId: string | undefined, options: ExportOptions) => {
			await exportAgentPackage(agentId, options);
		});

	return program;
}

async function exportAgentPackage(
	agentId: string | undefined,
	options: ExportOptions,
): Promise<void> {
	const outFile = requireOutFile(options.out);
	const target = parseTarget(options.target ?? SUPPORTED_TARGET);
	validateInputMode(agentId, options.definition);

	const runtime = await createExportRuntime(options);
	const input = await resolveExportInput(
		agentId,
		options.definition,
		runtime,
		target,
	);

	if (input.sourceAgent && input.shorthandAgentId) {
		assertPortableShorthand(input.shorthandAgentId, input.sourceAgent);
	}

	const agentPackage = await buildAgentPackage({
		definition: input.definition,
		target,
		agentRegistry: runtime.agentRegistry,
		domainContext: runtime.domainContext,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
		projectSkills: runtime.projectSkills,
		skillPaths: runtime.skillPaths,
	});

	await compileAgentPackageBinary({ agentPackage, outFile });
	process.stdout.write(
		`${JSON.stringify({
			packageId: agentPackage.packageId,
			target,
			outputPath: outFile,
		})}\n`,
	);
}

function requireOutFile(outFile: string | undefined): string {
	if (!outFile) {
		throw new Error('Missing required option "--out <path>"');
	}
	return outFile;
}

function parseTarget(value: string): SupportedExportTarget {
	if (value === SUPPORTED_TARGET) return value;
	throw new Error(
		`unsupported-target: "${value}" is not supported. Supported export targets in Phase 1: ${SUPPORTED_TARGET}`,
	);
}

function validateInputMode(
	agentId: string | undefined,
	definitionPath: string | undefined,
): void {
	if (agentId && definitionPath) {
		throw new Error(
			"Provide either <agent-id> or --definition <path>, not both",
		);
	}
	if (!agentId && !definitionPath) {
		throw new Error("Provide either <agent-id> or --definition <path>");
	}
}

async function createExportRuntime(options: ExportOptions) {
	const frameworkRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const bundledDirs = await discoverFrameworkBundledPackageDirs(frameworkRoot);
	const pluginDirs = options.pluginDir?.length ? options.pluginDir : undefined;

	return CosmonautsRuntime.create({
		builtinDomainsDir: join(frameworkRoot, "domains"),
		projectRoot: process.cwd(),
		bundledDirs,
		domainOverride: options.domain,
		pluginDirs,
	});
}

async function resolveExportInput(
	agentId: string | undefined,
	definitionPath: string | undefined,
	runtime: Awaited<ReturnType<typeof createExportRuntime>>,
	target: SupportedExportTarget,
): Promise<ResolvedExportInput> {
	if (definitionPath) {
		return { definition: await loadAgentPackageDefinition(definitionPath) };
	}

	const shorthandAgentId = agentId ?? "";
	const sourceAgent = resolveSourceAgent(shorthandAgentId, runtime);
	return {
		definition: definitionFromAgent(sourceAgent, target),
		sourceAgent,
		shorthandAgentId,
	};
}

function resolveSourceAgent(
	agentId: string,
	runtime: Awaited<ReturnType<typeof createExportRuntime>>,
): AgentDefinition {
	try {
		return runtime.agentRegistry.resolve(agentId, runtime.domainContext);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unknown agent-id "${agentId}": ${message}`);
	}
}

function assertPortableShorthand(
	agentId: string,
	sourceAgent: AgentDefinition,
): void {
	const issues = rawSourcePromptIssues(sourceAgent);
	if (issues.length === 0) return;

	const sourceAgentId = qualifyRole(sourceAgent.id, sourceAgent.domain);
	throw new Error(
		`Raw source-agent shorthand export is not supported for "${sourceAgentId}" because it uses ${issues.join(
			", ",
		)}. Use --definition <path> with prompt.kind "file" or "inline" and an external-safe prompt derived from ${agentId}.`,
	);
}
