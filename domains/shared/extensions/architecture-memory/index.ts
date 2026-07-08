import { access } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	type ArchitectureMapConfig,
	type ArchitectureMapFreshness,
	type ArchitectureMapMemoryStoreOptions,
	type ArchitectureMapRetrievalDetails,
	checkArchitectureMapStatFreshness,
	createArchitectureMapMemoryStore,
	loadArchitectureMapConfig,
	type SourceAnalyzer,
	typescriptSourceAnalyzer,
} from "../../../../lib/architecture-map/index.ts";
import type {
	MemoryRetrieveResult,
	MemoryStore,
} from "../../../../lib/memory/index.ts";

const ARCHITECTURE_CONTEXT_TYPE = "architecture-map-context";
const ARCHITECTURE_DIR = "memory/architecture";
const CONSUMING_AGENT_IDS = new Set([
	"coding/planner",
	"coding/plan-reviewer",
	"coding/coordinator",
	"coding/worker",
	"coding/quality-manager",
]);

interface ArchitectureMemoryDeps {
	readonly loadConfig: (projectRoot: string) => Promise<ArchitectureMapConfig>;
	readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
	readonly checkFreshness: (options: {
		readonly projectRoot: string;
		readonly config: ArchitectureMapConfig;
		readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
	}) => Promise<ArchitectureMapFreshness>;
	readonly createStore: (
		options: ArchitectureMapMemoryStoreOptions,
	) => MemoryStore;
}

function textResult(
	text: string,
	details: unknown,
): {
	content: { type: "text"; text: string }[];
	details: unknown;
} {
	return {
		content: [{ type: "text", text }],
		details,
	};
}

export function createArchitectureMemoryExtension(
	deps: Partial<ArchitectureMemoryDeps> = {},
): (pi: ExtensionAPI) => void {
	const resolvedDeps: ArchitectureMemoryDeps = {
		loadConfig: deps.loadConfig ?? loadArchitectureMapConfig,
		analyzer: deps.analyzer ?? typescriptSourceAnalyzer,
		checkFreshness: deps.checkFreshness ?? checkArchitectureMapStatFreshness,
		createStore: deps.createStore ?? createArchitectureMapMemoryStore,
	};

	return function architectureMemoryExtension(pi: ExtensionAPI): void {
		let authorized = false;

		pi.registerTool({
			name: "architecture_map_read",
			label: "Read Architecture Map",
			description:
				"Read the generated architecture-map index or a module shard by module resource.",
			parameters: Type.Object({
				module: Type.Optional(
					Type.String({
						description:
							"Module resource from the architecture-map module shard frontmatter, for example `lib/agents`. Omit to read the full index.",
					}),
				),
				resource: Type.Optional(
					Type.String({
						description:
							"Deprecated alias for `module`. Module resource from the architecture-map module shard frontmatter, for example `lib/agents`.",
					}),
				),
			}),
			execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
				if (!authorized) return unauthorizedResult();

				const cwd = getCwd(ctx);
				const result = await retrieveArchitectureMap({
					projectRoot: cwd,
					resource: normalizeRequestedModule(params),
					deps: resolvedDeps,
				});
				return renderArchitectureMapResult(result);
			},
		});

		pi.on("session_start", async () => {
			authorized = false;
		});

		pi.on("session_shutdown", async () => {
			authorized = false;
		});

		pi.on("before_agent_start", async (event, ctx) => {
			const systemPrompt = getSystemPrompt(event);
			authorized = isConsumingAgent(systemPrompt);
			if (!authorized) return;

			const cwd = getCwd(ctx);
			if (!(await architectureDirExists(cwd))) return;

			const config = await resolvedDeps.loadConfig(cwd);
			const indexRead = await retrieveArchitectureMap({
				projectRoot: cwd,
				resource: undefined,
				deps: resolvedDeps,
			});
			const details = architectureDetails(indexRead.details);
			const text = buildContextMessage({
				index: contentText(renderArchitectureMapResult(indexRead)),
				freshness: details?.freshness ?? { kind: "missing" },
				injectionMaxBytes: config.injectionMaxBytes,
			});

			return {
				message: {
					customType: ARCHITECTURE_CONTEXT_TYPE,
					content: text,
					display: false,
				},
			};
		});

		const onContext = pi.on as unknown as (
			event: "context",
			handler: (event: unknown) => Promise<unknown>,
		) => void;
		onContext("context", async (event) => {
			return {
				messages: getMessages(event).filter((message) => {
					const msg = message as { customType?: string };
					return msg.customType !== ARCHITECTURE_CONTEXT_TYPE;
				}),
			};
		});
	};
}

export default function architectureMemoryExtension(pi: ExtensionAPI): void {
	createArchitectureMemoryExtension()(pi);
}

async function retrieveArchitectureMap(options: {
	readonly projectRoot: string;
	readonly resource: string | undefined;
	readonly deps: ArchitectureMemoryDeps;
}): Promise<MemoryRetrieveResult> {
	return options.deps
		.createStore({
			projectRoot: options.projectRoot,
			loadConfig: options.deps.loadConfig,
			analyzer: options.deps.analyzer,
			checkFreshness: options.deps.checkFreshness,
		})
		.retrieve(
			{
				projectRoot: options.projectRoot,
				scopes: ["project"],
			},
			{
				resource: options.resource,
				recordTypes: ["code-structure-index", "code-structure-module"],
				limit: 1,
			},
		);
}

function unauthorizedResult(): ReturnType<typeof textResult> {
	return textResult("architecture_map_read is not available for this agent.", {
		kind: "architecture-map",
		status: "scope-ineligible",
		freshness: { kind: "missing" },
		reason: "architecture_map_read is not available for this agent.",
	});
}

function renderArchitectureMapResult(
	result: MemoryRetrieveResult,
): ReturnType<typeof textResult> {
	const details = architectureDetails(result.details);
	const record = result.records[0];
	if (record) {
		return textResult(record.content, normalizeRenderedDetails(details));
	}

	if (!details) {
		return textResult("Architecture map retrieval returned no records.", {});
	}

	switch (details.status) {
		case "missing-index":
			return textResult(
				[
					formatFreshnessBanner(details.freshness),
					"`memory/architecture/index.md` is missing.",
				].join("\n"),
				normalizeRenderedDetails(details),
			);
		case "unknown-module": {
			const availableModules = details.availableModules ?? [];
			return textResult(
				[
					`Unknown architecture map module: ${details.resource ?? ""}`,
					availableModules.length > 0
						? `Available modules: ${availableModules.join(", ")}`
						: "Available modules: none",
				].join("\n"),
				normalizeRenderedDetails(details),
			);
		}
		case "unsafe-resource":
			return textResult(
				`Rejected unsafe architecture map resource: ${
					details.resource ?? ""
				}. ${details.reason ?? ""}`.trim(),
				normalizeRenderedDetails(details),
			);
		case "scope-ineligible":
			return textResult(
				details.reason ?? "Architecture-map memory is not available.",
				normalizeRenderedDetails(details),
			);
		case "index":
		case "module":
			return textResult("Architecture map retrieval returned no records.", {
				...normalizeRenderedDetailsObject(details),
				emptyMatchedRecords: true,
			});
	}
}

function normalizeRenderedDetails(
	details: ArchitectureMapRetrievalDetails | undefined,
): unknown {
	return normalizeRenderedDetailsObject(details);
}

function normalizeRenderedDetailsObject(
	details: ArchitectureMapRetrievalDetails | undefined,
): Record<string, unknown> {
	if (!details) return {};
	const path = details.path?.includes(`${ARCHITECTURE_DIR}/`)
		? details.path.slice(details.path.indexOf(`${ARCHITECTURE_DIR}/`))
		: details.path;
	return {
		...details,
		path,
	};
}

function buildContextMessage(options: {
	readonly index: string;
	readonly freshness: ArchitectureMapFreshness;
	readonly injectionMaxBytes: number;
}): string {
	const header = [
		"Architecture map index context",
		formatFreshnessBanner(options.freshness),
		"Call `architecture_map_read` with no `module` for the full index, or with a module resource for a shard.",
		"",
	].join("\n");
	const complete = `${header}${options.index}`;
	if (byteLength(complete) <= options.injectionMaxBytes) return complete;

	const originalBytes = byteLength(options.index);
	let budget = Math.max(0, options.injectionMaxBytes - byteLength(header));
	let excerpt = "";
	let footer = "";
	for (let attempt = 0; attempt < 3; attempt += 1) {
		excerpt = truncateBytes(options.index, budget);
		footer = `\n\n[Truncated from ${originalBytes} bytes to ${byteLength(
			excerpt,
		)} bytes. Use \`architecture_map_read\` for the full index or module shards.]`;
		const nextBudget = Math.max(
			0,
			options.injectionMaxBytes - byteLength(header) - byteLength(footer),
		);
		if (nextBudget === budget) break;
		budget = nextBudget;
	}
	return `${header}${excerpt}${footer}`;
}

function formatFreshnessBanner(freshness: ArchitectureMapFreshness): string {
	switch (freshness.kind) {
		case "current":
			return `Architecture map freshness: current (${freshness.hash})`;
		case "stale":
			return `Architecture map freshness: stale (recorded ${freshness.oldHash}, current ${freshness.newHash})`;
		case "missing":
			return "Architecture map freshness: missing";
	}
}

async function architectureDirExists(projectRoot: string): Promise<boolean> {
	try {
		await access(join(projectRoot, ARCHITECTURE_DIR));
		return true;
	} catch {
		return false;
	}
}

function isConsumingAgent(systemPrompt: string): boolean {
	const agentId = extractAgentIdFromSystemPrompt(systemPrompt);
	return agentId !== undefined && CONSUMING_AGENT_IDS.has(agentId);
}

function getSystemPrompt(event: unknown): string {
	return valueFromObject(event, "systemPrompt") ?? "";
}

function getCwd(ctx: unknown): string {
	const cwd = valueFromObject(ctx, "cwd");
	if (!cwd) throw new Error("Architecture memory extension requires ctx.cwd.");
	return cwd;
}

function getMessages(event: unknown): unknown[] {
	if (event && typeof event === "object" && "messages" in event) {
		const messages = (event as { messages?: unknown }).messages;
		if (Array.isArray(messages)) return messages;
	}
	return [];
}

function normalizeRequestedModule(params: unknown): string | undefined {
	return (
		normalizeRequestedResource(valueFromObject(params, "module")) ??
		normalizeRequestedResource(valueFromObject(params, "resource"))
	);
}

function normalizeRequestedResource(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function contentText(result: ReturnType<typeof textResult>): string {
	return result.content.map((entry) => entry.text).join("\n");
}

function architectureDetails(
	details: unknown,
): ArchitectureMapRetrievalDetails | undefined {
	if (!details || typeof details !== "object") return undefined;
	const candidate = details as Partial<ArchitectureMapRetrievalDetails>;
	if (candidate.kind !== "architecture-map") return undefined;
	if (typeof candidate.status !== "string") return undefined;
	if (
		candidate.freshness === undefined ||
		typeof candidate.freshness !== "object"
	) {
		return undefined;
	}
	return candidate as ArchitectureMapRetrievalDetails;
}

function valueFromObject(value: unknown, key: string): string | undefined {
	if (value && typeof value === "object" && key in value) {
		const field = (value as Record<string, unknown>)[key];
		return typeof field === "string" ? field : undefined;
	}
	return undefined;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf-8");
}

function truncateBytes(value: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	const bytes = Buffer.from(value, "utf-8");
	if (bytes.byteLength <= maxBytes) return value;
	return bytes.subarray(0, maxBytes).toString("utf-8");
}
