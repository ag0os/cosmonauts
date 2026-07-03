import { access, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	type ArchitectureMapConfig,
	type ArchitectureMapFreshness,
	checkArchitectureMapStatFreshness,
	loadArchitectureMapConfig,
	type SourceAnalyzer,
	typescriptSourceAnalyzer,
} from "../../../../lib/architecture-map/index.ts";

const ARCHITECTURE_CONTEXT_TYPE = "architecture-map-context";
const ARCHITECTURE_DIR = "memory/architecture";
const INDEX_PATH = "index.md";
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
}

interface ToolTextContent {
	type: "text";
	text: string;
}

function textResult(
	text: string,
	details: unknown,
): {
	content: ToolTextContent[];
	details: unknown;
} {
	return {
		content: [{ type: "text", text }],
		details,
	};
}

export function createArchitectureMemoryExtension(
	deps: ArchitectureMemoryDeps = {
		loadConfig: loadArchitectureMapConfig,
		analyzer: typescriptSourceAnalyzer,
		checkFreshness: checkArchitectureMapStatFreshness,
	},
): (pi: ExtensionAPI) => void {
	return function architectureMemoryExtension(pi: ExtensionAPI): void {
		let toolRegistered = false;

		function ensureToolRegistered(): void {
			if (toolRegistered) return;
			toolRegistered = true;
			pi.registerTool({
				name: "architecture_map_read",
				label: "Read Architecture Map",
				description:
					"Read the generated architecture-map index or a module shard by module resource.",
				promptSnippet:
					"Read `memory/architecture/index.md` or module shards from the generated architecture map.",
				parameters: Type.Object({
					resource: Type.Optional(
						Type.String({
							description:
								"Module resource from the architecture-map index, for example `lib/agents`. Omit to read the full index.",
						}),
					),
				}),
				execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
					const cwd = getCwd(ctx);
					const config = await deps.loadConfig(cwd);
					const freshness = await deps.checkFreshness({
						projectRoot: cwd,
						config,
						analyzer: deps.analyzer,
					});
					return readArchitectureMap({
						projectRoot: cwd,
						resource: normalizeRequestedResource(params.resource),
						freshness,
					});
				},
			});
		}

		pi.on("before_agent_start", async (event, ctx) => {
			const systemPrompt = getSystemPrompt(event);
			if (!isConsumingAgent(systemPrompt)) return;

			const cwd = getCwd(ctx);
			if (!(await architectureDirExists(cwd))) return;

			ensureToolRegistered();
			const config = await deps.loadConfig(cwd);
			const freshness = await deps.checkFreshness({
				projectRoot: cwd,
				config,
				analyzer: deps.analyzer,
			});
			const indexRead = await readArchitectureMap({
				projectRoot: cwd,
				resource: undefined,
				freshness,
			});
			const text = buildContextMessage({
				index: contentText(indexRead),
				freshness,
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

async function readArchitectureMap(options: {
	readonly projectRoot: string;
	readonly resource: string | undefined;
	readonly freshness: ArchitectureMapFreshness;
}): Promise<ReturnType<typeof textResult>> {
	const indexPath = architecturePath(options.projectRoot, INDEX_PATH);
	if (!options.resource) {
		const index = await readMapFile(indexPath);
		if (index === undefined) {
			return textResult(
				[
					formatFreshnessBanner(options.freshness),
					"`memory/architecture/index.md` is missing.",
				].join("\n"),
				{ freshness: options.freshness, resource: undefined },
			);
		}
		return textResult(
			[formatFreshnessBanner(options.freshness), index].join("\n\n"),
			{
				freshness: options.freshness,
				resource: "memory/architecture/index.md",
			},
		);
	}

	const safety = validateResource(options.resource);
	if (!safety.ok) {
		return textResult(
			`Rejected unsafe architecture map resource: ${options.resource}. Module resources must be relative names inside \`memory/architecture/modules/\`.`,
			{ freshness: options.freshness, resource: options.resource },
		);
	}

	const index = await readMapFile(indexPath);
	const availableModules = parseAvailableModules(index ?? "");
	if (!availableModules.includes(options.resource)) {
		return textResult(
			[
				`Unknown architecture map module: ${options.resource}`,
				availableModules.length > 0
					? `Available modules: ${availableModules.join(", ")}`
					: "Available modules: none",
			].join("\n"),
			{
				freshness: options.freshness,
				resource: options.resource,
				availableModules,
			},
		);
	}

	const shardPath = resourceToShardPath(options.resource);
	const absoluteShardPath = safeArchitecturePath(
		options.projectRoot,
		shardPath,
	);
	if (!absoluteShardPath) {
		return textResult(
			`Rejected unsafe architecture map resource: ${options.resource}.`,
			{ freshness: options.freshness, resource: options.resource },
		);
	}

	const shard = await readMapFile(absoluteShardPath);
	if (shard === undefined) {
		return textResult(
			[
				`Architecture map module shard is missing: ${options.resource}`,
				`Expected: memory/architecture/${shardPath}`,
			].join("\n"),
			{
				freshness: options.freshness,
				resource: options.resource,
				path: `${ARCHITECTURE_DIR}/${shardPath}`,
			},
		);
	}

	return textResult(
		[formatFreshnessBanner(options.freshness), shard].join("\n\n"),
		{
			freshness: options.freshness,
			resource: options.resource,
			path: `${ARCHITECTURE_DIR}/${shardPath}`,
		},
	);
}

function buildContextMessage(options: {
	readonly index: string;
	readonly freshness: ArchitectureMapFreshness;
	readonly injectionMaxBytes: number;
}): string {
	const header = [
		"Architecture map index context",
		formatFreshnessBanner(options.freshness),
		"Call `architecture_map_read` with no `resource` for the full index, or with a module `resource` for a shard.",
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

function parseAvailableModules(index: string): string[] {
	const modules = new Set<string>();
	for (const line of index.split(/\r?\n/u)) {
		const match = line.match(/^\s*-\s+`([^`]+)`\s+-/u);
		if (match?.[1]) modules.add(match[1]);
	}
	return [...modules].sort();
}

function resourceToShardPath(resource: string): string {
	const normalizedResource = resource === "." ? "root" : resource;
	return `modules/${normalizedResource}.md`;
}

function validateResource(
	resource: string,
): { readonly ok: true } | { readonly ok: false } {
	if (
		resource.length === 0 ||
		resource.includes("\\") ||
		isAbsolute(resource)
	) {
		return { ok: false };
	}
	const segments = resource.split("/");
	if (segments.some((segment) => segment === "" || segment === "..")) {
		return { ok: false };
	}
	return { ok: true };
}

function safeArchitecturePath(
	projectRoot: string,
	pathInArchitectureDir: string,
): string | undefined {
	const root = resolve(projectRoot, ARCHITECTURE_DIR);
	const absolute = resolve(root, pathInArchitectureDir);
	const rel = relative(root, absolute);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
	return absolute;
}

function architecturePath(
	projectRoot: string,
	pathInArchitectureDir: string,
): string {
	return join(projectRoot, ARCHITECTURE_DIR, pathInArchitectureDir);
}

async function architectureDirExists(projectRoot: string): Promise<boolean> {
	try {
		await access(join(projectRoot, ARCHITECTURE_DIR));
		return true;
	} catch {
		return false;
	}
}

async function readMapFile(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return undefined;
		}
		throw error;
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

function normalizeRequestedResource(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function contentText(
	result: Awaited<ReturnType<typeof readArchitectureMap>>,
): string {
	return result.content.map((entry) => entry.text).join("\n");
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
