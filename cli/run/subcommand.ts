import { join } from "node:path";
import { Command } from "commander";
import {
	listNamedChains,
	type NamedChainDomainSource,
	resolveNamedChain,
} from "../../lib/chains/loader.ts";
import type { NamedChain } from "../../lib/chains/types.ts";
import {
	FileRunStore,
	type RunRecord,
	type RunRef,
	type RunStatusSummary,
	runStatus,
	runWatch,
} from "../../lib/durable-runtime/index.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { executeChainExpression } from "../chain-execution.ts";
import { createDriveRunCommand } from "../drive/subcommand.ts";
import {
	type CliRuntimeContext,
	type CliRuntimeOptions,
	createCliRuntimeContext,
} from "../runtime-bootstrap.ts";
import { printJson } from "../shared/output.ts";

interface RunProgramOptions {
	runtimeOptions?: CliRuntimeOptions;
	createContext?: (options: CliRuntimeOptions) => Promise<CliRuntimeContext>;
}

interface RunStatusOptions {
	scope?: string;
}

interface RunWatchOptions {
	scope?: string;
	sinceSeq?: number;
	limit?: number;
}

interface RunListOptions {
	scope?: string;
	limit?: number;
}

interface RunChainOptions {
	name?: string;
}

interface ResolvedRunChain {
	source: "named" | "dsl";
	input: string;
	expression: string;
	name?: string;
	description?: string;
}

export function createRunProgram({
	runtimeOptions = { piFlags: {} },
	createContext = createCliRuntimeContext,
}: RunProgramOptions = {}): Command {
	const program = new Command();

	program
		.name("cosmonauts run")
		.description("Observe and start normalized Cosmonauts runs")
		.version("1.0.0");

	program
		.command("status <runId>")
		.description("Report normalized run status")
		.option("--scope <scope>", "Run scope. Omit to infer from stored runs.")
		.action(async (runId: string, options: RunStatusOptions) => {
			const context = await createContext(runtimeOptions);
			await reportRunStatus(context.cwd, runId, options);
		});

	program
		.command("watch <runId>")
		.description("Read normalized run events")
		.option("--scope <scope>", "Run scope. Omit to infer from stored runs.")
		.option(
			"--since-seq <n>",
			"Only return events after this sequence",
			parseIntOption,
		)
		.option("--limit <n>", "Maximum events to return", parseIntOption)
		.action(async (runId: string, options: RunWatchOptions) => {
			const context = await createContext(runtimeOptions);
			await reportRunWatch(context.cwd, runId, options);
		});

	program
		.command("list")
		.description("List normalized runs")
		.option("--scope <scope>", "Only list runs from this scope")
		.option("--limit <n>", "Maximum runs to return", parseIntOption)
		.action(async (options: RunListOptions) => {
			const context = await createContext(runtimeOptions);
			await listRuns(context.cwd, options);
		});

	program
		.command("chain")
		.description("Run a named chain or raw chain DSL expression")
		.argument("[expressionOrName]", "Named chain, raw DSL expression, or list")
		.argument("[prompt...]", "Prompt text injected into the chain")
		.option(
			"--name <name>",
			"Resolve only a named chain, even for reserved words",
		)
		.action(
			async (
				expressionOrName: string | undefined,
				promptArgs: string[],
				options: RunChainOptions,
			) => {
				const context = await createContext(runtimeOptions);
				await runChainCommand({
					context,
					runtimeOptions,
					expressionOrName,
					promptArgs,
					options,
				});
			},
		);

	program.addCommand(createDriveRunCommand());

	return program;
}

async function resolveRunChainExpression({
	input,
	projectRoot,
	domainChains,
	namedOnly = false,
}: {
	input: string;
	projectRoot: string;
	domainChains?: readonly NamedChain[] | NamedChainDomainSource;
	namedOnly?: boolean;
}): Promise<ResolvedRunChain> {
	try {
		const chain = await resolveNamedChain(input, projectRoot, domainChains);
		return {
			source: "named",
			input,
			name: chain.name,
			description: chain.description,
			expression: chain.chain,
		};
	} catch (error) {
		if (!isUnknownNamedChainError(error, input) || namedOnly) {
			throw error;
		}
		return { source: "dsl", input, expression: input };
	}
}

async function reportRunStatus(
	projectRoot: string,
	runId: string,
	options: RunStatusOptions,
): Promise<void> {
	const store = createStore(projectRoot);
	const ref = await resolveRunRef(store, runId, options.scope);
	const summary = await runStatus(store, ref);
	if (!summary) {
		process.exitCode = 1;
		printJson(notFoundSummary(ref));
		return;
	}
	printJson({ found: true, ...summary });
}

async function reportRunWatch(
	projectRoot: string,
	runId: string,
	options: RunWatchOptions,
): Promise<void> {
	const store = createStore(projectRoot);
	const ref = await resolveRunRef(store, runId, options.scope);
	const summary = await runWatch(store, ref, {
		sinceSeq: options.sinceSeq,
		limit: options.limit,
	});
	if (!summary.found) {
		process.exitCode = 1;
	}
	printJson(summary);
}

async function listRuns(
	projectRoot: string,
	options: RunListOptions,
): Promise<void> {
	const store = createStore(projectRoot);
	const records = await store.listRecentRuns({
		scope: options.scope,
		limit: options.limit,
	});
	const summaries = await Promise.all(
		records.map(async (record) => {
			const status = await store.readStatus(record);
			return summarizeListedRun(record, status);
		}),
	);
	printJson(summaries);
}

async function runChainCommand({
	context,
	runtimeOptions,
	expressionOrName,
	promptArgs,
	options,
}: {
	context: CliRuntimeContext;
	runtimeOptions: CliRuntimeOptions;
	expressionOrName?: string;
	promptArgs: string[];
	options: RunChainOptions;
}): Promise<void> {
	if (!options.name && (!expressionOrName || expressionOrName === "list")) {
		await listRunChains(context.cwd, context.runtime);
		return;
	}

	const input = options.name ?? expressionOrName;
	if (!input) {
		throw new Error("Missing chain expression or --name <name>");
	}

	const resolved = await resolveRunChainExpression({
		input,
		projectRoot: context.cwd,
		domainChains: runtimeChainSource(context.runtime),
		namedOnly: options.name !== undefined,
	});
	const promptParts =
		options.name && expressionOrName
			? [expressionOrName, ...promptArgs]
			: promptArgs;
	const result = await executeChainExpression({
		runtime: context.runtime,
		cwd: context.cwd,
		chainExpr: resolved.expression,
		options: {
			...runtimeOptions,
			prompt: promptParts.length > 0 ? promptParts.join(" ") : undefined,
		},
	});
	if (!result.success) {
		process.exitCode = 1;
	}
	printJson({ chain: resolved, result });
}

function runtimeChainSource(
	runtime: CosmonautsRuntime,
): readonly NamedChain[] | NamedChainDomainSource {
	if (runtime.domains.length === 0) {
		return runtime.chains;
	}
	return {
		domains: runtime.domains,
		domainContext: effectiveDomainContext(runtime),
	};
}

function effectiveDomainContext(
	runtime: CosmonautsRuntime,
): string | undefined {
	if (!runtime.domainContext) return undefined;
	return (
		runtime.bindingResolver.resolveKnownRole(runtime.domainContext)?.domainId ??
		runtime.domainContext
	);
}

async function listRunChains(
	projectRoot: string,
	runtime: CosmonautsRuntime,
): Promise<void> {
	const chains = await listNamedChains(projectRoot, runtime.chains);
	printJson(
		chains.map((chain) => ({
			name: chain.name,
			description: chain.description,
			chain: chain.chain,
		})),
	);
}

async function resolveRunRef(
	store: FileRunStore,
	runId: string,
	scope?: string,
): Promise<RunRef> {
	if (scope) {
		return { scope, runId };
	}

	const matches = (await store.listRecentRuns()).filter(
		(record) => record.runId === runId,
	);
	if (matches.length === 1) {
		const match = matches[0] as RunRecord;
		return { scope: match.scope, runId: match.runId };
	}
	if (matches.length > 1) {
		throw new Error(
			`Run ${runId} exists in multiple scopes: ${matches
				.map((record) => record.scope)
				.join(", ")}. Pass --scope <scope>.`,
		);
	}
	return { scope: "chain", runId };
}

function createStore(projectRoot: string): FileRunStore {
	return new FileRunStore({
		rootDir: join(projectRoot, "missions", "sessions"),
	});
}

function summarizeListedRun(
	record: RunRecord,
	status: RunStatusSummary | undefined,
): Record<string, unknown> {
	return {
		scope: record.scope,
		runId: record.runId,
		status: status?.status ?? record.status,
		statusSource: status?.statusSource ?? "record",
		recordStatus: record.status,
		updatedAt: status?.updatedAt ?? record.updatedAt,
		createdAt: record.createdAt,
		metadata: record.metadata,
		diagnostics: status?.diagnostics ?? [],
	};
}

function notFoundSummary(ref: RunRef): Record<string, unknown> {
	return {
		scope: ref.scope,
		runId: ref.runId,
		found: false,
		diagnostics: [
			{
				code: "run_not_found",
				message: `Run ${ref.scope}/${ref.runId} was not found.`,
			},
		],
	};
}

function isUnknownNamedChainError(error: unknown, name: string): boolean {
	return (
		error instanceof Error &&
		error.message.startsWith(`Unknown named chain "${name}"`)
	);
}

function parseIntOption(value: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`Expected a non-negative integer, got "${value}"`);
	}
	return parsed;
}
