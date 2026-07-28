import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import {
	type ArchitectureMapFreshness,
	checkArchitectureMapStatFreshness,
	loadArchitectureMapConfig,
	typescriptSourceAnalyzer,
} from "../architecture-map/index.ts";
import { type Plan, PlanManager, validateSlug } from "../plans/index.ts";
import {
	type ArtifactDocument,
	loadArchitectureIndexArtifact,
	loadArchitectureModuleArtifact,
	loadPlanPageData,
	type PlanViewerData,
	validateArchitectureResource,
} from "./loaders.ts";
import { escapeHtml } from "./renderer.ts";

export interface ArtifactViewerResponse {
	readonly statusCode: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

export interface ArtifactViewerServerOptions {
	readonly projectRoot: string;
	readonly dependencies?: Partial<ArtifactViewerDependencies>;
}

export interface ArtifactViewerDependencies {
	readonly loadArchitectureIndex: (options: {
		readonly projectRoot: string;
	}) => Promise<ArtifactDocument | null>;
	readonly loadArchitectureModule: (options: {
		readonly projectRoot: string;
		readonly resource: string;
	}) => Promise<ArtifactDocument | null>;
	readonly listPlans: (options: {
		readonly projectRoot: string;
	}) => Promise<readonly Plan[]>;
	readonly loadPlanPage: (options: {
		readonly projectRoot: string;
		readonly slug: string;
	}) => Promise<PlanViewerData | null>;
	readonly checkArchitectureFreshness: (options: {
		readonly projectRoot: string;
	}) => Promise<ArchitectureMapFreshness>;
}

interface RoutePath {
	readonly rawPath: string;
	readonly decodedPath: string;
}

interface GraphModule {
	readonly resource: string;
	readonly dependencies: readonly string[];
}

const TEXT_HTML = { "content-type": "text/html; charset=utf-8" } as const;
const PROTECTED_ROUTE_PREFIXES = ["/plans/", "/architecture/modules/"] as const;

export function createArtifactViewerServer(
	options: ArtifactViewerServerOptions,
): Server {
	return createServer((request, response) => {
		void writeResponse(
			response,
			handleArtifactViewerRequest({
				projectRoot: options.projectRoot,
				url: request.url ?? "/",
				method: request.method ?? "GET",
				dependencies: options.dependencies,
			}),
			request.method === "HEAD",
		);
	});
}

export async function handleArtifactViewerRequest(options: {
	readonly projectRoot: string;
	readonly url: string;
	readonly method?: string;
	readonly dependencies?: Partial<ArtifactViewerDependencies>;
}): Promise<ArtifactViewerResponse> {
	const method = options.method ?? "GET";
	if (method !== "GET" && method !== "HEAD") {
		return htmlResponse(
			405,
			"Method Not Allowed",
			"<p>Method not allowed.</p>",
		);
	}

	const routePath = decodeRoutePath(options.url);
	if (!routePath) {
		return htmlResponse(400, "Bad Request", "<p>Invalid request path.</p>");
	}
	if (hasProtectedTraversal(routePath)) {
		return htmlResponse(400, "Bad Request", "<p>Invalid route path.</p>");
	}

	const dependencies = artifactViewerDependencies(options.dependencies);
	const path = withoutTrailingSlash(routePath.decodedPath);

	try {
		if (path === "" || path === "/") {
			return htmlResponse(200, "Cosmonauts Viewer", renderHome());
		}
		if (path === "/architecture") {
			return await renderArchitectureIndexRoute(
				options.projectRoot,
				dependencies,
			);
		}
		if (path.startsWith("/architecture/modules/")) {
			const resource = path.slice("/architecture/modules/".length);
			validateArchitectureResource(resource);
			return await renderArchitectureModuleRoute({
				projectRoot: options.projectRoot,
				resource,
				dependencies,
			});
		}
		if (path === "/plans") {
			return await renderPlanListRoute(options.projectRoot, dependencies);
		}
		if (path.startsWith("/plans/")) {
			const slug = path.slice("/plans/".length);
			validateSlug(slug);
			return await renderPlanPageRoute({
				projectRoot: options.projectRoot,
				slug,
				dependencies,
			});
		}
	} catch (error) {
		if (error instanceof Error && isClientRouteError(error)) {
			return htmlResponse(400, "Bad Request", "<p>Invalid route path.</p>");
		}
		throw error;
	}

	return htmlResponse(404, "Not Found", "<p>Route not found.</p>");
}

function artifactViewerDependencies(
	overrides: Partial<ArtifactViewerDependencies> | undefined,
): ArtifactViewerDependencies {
	return {
		loadArchitectureIndex: loadArchitectureIndexArtifact,
		loadArchitectureModule: loadArchitectureModuleArtifact,
		listPlans: async ({ projectRoot }) =>
			await new PlanManager(projectRoot).listPlans(),
		loadPlanPage: loadPlanPageData,
		checkArchitectureFreshness: async ({ projectRoot }) => {
			const config = await loadArchitectureMapConfig(projectRoot);
			return await checkArchitectureMapStatFreshness({
				projectRoot,
				config,
				analyzer: typescriptSourceAnalyzer,
			});
		},
		...overrides,
	};
}

async function renderArchitectureIndexRoute(
	projectRoot: string,
	dependencies: ArtifactViewerDependencies,
): Promise<ArtifactViewerResponse> {
	const document = await dependencies.loadArchitectureIndex({ projectRoot });
	if (!document) {
		return htmlResponse(
			200,
			"Architecture Map",
			[
				renderNav("architecture"),
				'<section class="empty-state">',
				"<h1>No architecture map found</h1>",
				"<p>Generate one with <code>cosmonauts architecture generate</code>.</p>",
				"</section>",
			].join("\n"),
		);
	}

	const freshness = await dependencies.checkArchitectureFreshness({
		projectRoot,
	});
	const modules = parseModuleGraph(document.markdown);

	return htmlResponse(
		200,
		"Architecture Map",
		[
			renderNav("architecture"),
			renderFreshnessBanner(freshness),
			"<section>",
			"<h2>Module Graph</h2>",
			renderModuleGraph(modules),
			"</section>",
			"<section>",
			"<h2>Modules</h2>",
			renderModuleLinks(modules),
			"</section>",
			'<section class="markdown">',
			document.html,
			"</section>",
		].join("\n"),
	);
}

async function renderArchitectureModuleRoute(options: {
	readonly projectRoot: string;
	readonly resource: string;
	readonly dependencies: ArtifactViewerDependencies;
}): Promise<ArtifactViewerResponse> {
	const document = await options.dependencies.loadArchitectureModule({
		projectRoot: options.projectRoot,
		resource: options.resource,
	});
	if (!document) {
		return htmlResponse(404, "Architecture Module", "<p>Module not found.</p>");
	}

	const freshness = await options.dependencies.checkArchitectureFreshness({
		projectRoot: options.projectRoot,
	});

	return htmlResponse(
		200,
		document.title,
		[
			renderNav("architecture"),
			renderFreshnessBanner(freshness),
			`<p><a href="/architecture/">Back to architecture map</a></p>`,
			`<section class="markdown">${document.html}</section>`,
		].join("\n"),
	);
}

async function renderPlanListRoute(
	projectRoot: string,
	dependencies: ArtifactViewerDependencies,
): Promise<ArtifactViewerResponse> {
	const plans = await dependencies.listPlans({ projectRoot });
	const body =
		plans.length === 0
			? [
					renderNav("plans"),
					'<section class="empty-state">',
					"<h1>No plans found</h1>",
					"<p>No markdown plans exist under <code>missions/plans/</code>.</p>",
					"</section>",
				].join("\n")
			: [
					renderNav("plans"),
					"<h1>Plans</h1>",
					'<ul class="item-list">',
					...plans.map(
						(plan) =>
							`<li><a href="/plans/${encodeURIComponent(plan.slug)}">${escapeHtml(plan.title || plan.slug)}</a> <span>${escapeHtml(plan.status)}</span></li>`,
					),
					"</ul>",
				].join("\n");

	return htmlResponse(200, "Plans", body);
}

async function renderPlanPageRoute(options: {
	readonly projectRoot: string;
	readonly slug: string;
	readonly dependencies: ArtifactViewerDependencies;
}): Promise<ArtifactViewerResponse> {
	const data = await options.dependencies.loadPlanPage({
		projectRoot: options.projectRoot,
		slug: options.slug,
	});
	if (!data) {
		return htmlResponse(404, "Plan Not Found", "<p>Plan not found.</p>");
	}

	return htmlResponse(
		200,
		data.plan.title || data.plan.slug,
		[
			renderNav("plans"),
			`<p><a href="/plans/">Back to plans</a></p>`,
			`<h1>${escapeHtml(data.plan.title || data.plan.slug)}</h1>`,
			`<p class="meta">${escapeHtml(data.plan.status)} plan - ${escapeHtml(data.plan.slug)}</p>`,
			renderDocumentSection("Plan", data.planDocument),
			renderDocumentSection("Spec", data.specDocument),
			renderDocumentSection("Review", data.reviewDocument),
			renderTaskStatusSection(data),
		].join("\n"),
	);
}

function renderHome(): string {
	return [
		renderNav(),
		"<h1>Cosmonauts Viewer</h1>",
		'<ul class="item-list">',
		'<li><a href="/architecture/">Architecture map</a></li>',
		'<li><a href="/plans/">Plans</a></li>',
		"</ul>",
	].join("\n");
}

function renderNav(active?: "architecture" | "plans"): string {
	return [
		"<nav>",
		`<a${active === "architecture" ? ' aria-current="page"' : ""} href="/architecture/">Architecture</a>`,
		`<a${active === "plans" ? ' aria-current="page"' : ""} href="/plans/">Plans</a>`,
		"</nav>",
	].join("\n");
}

function renderFreshnessBanner(freshness: ArchitectureMapFreshness): string {
	if (freshness.kind === "current") {
		return `<p class="banner current">Freshness: current (${escapeHtml(shortHash(freshness.hash))})</p>`;
	}
	if (freshness.kind === "stale") {
		return `<p class="banner stale">Freshness: stale (${escapeHtml(shortHash(freshness.oldHash))} to ${escapeHtml(shortHash(freshness.newHash))})</p>`;
	}
	return '<p class="banner missing">Freshness: missing stat fingerprint. Run <code>cosmonauts architecture generate</code>.</p>';
}

function renderModuleLinks(modules: readonly GraphModule[]): string {
	if (modules.length === 0) return "<p>No modules discovered.</p>";
	return [
		'<ul class="item-list">',
		...modules.map(
			(module) =>
				`<li><a href="${escapeHtml(moduleHref(module.resource))}"><code>${escapeHtml(module.resource)}</code></a></li>`,
		),
		"</ul>",
	].join("\n");
}

function renderModuleGraph(modules: readonly GraphModule[]): string {
	if (modules.length === 0) return "<p>No module dependencies discovered.</p>";

	const depths = moduleDepths(modules);
	const columns = groupModulesByDepth(modules, depths);
	const maxRows = Math.max(
		...[...columns.values()].map((items) => items.length),
		1,
	);
	const width = Math.max((columns.size || 1) * 220 + 40, 420);
	const height = Math.max(maxRows * 96 + 40, 140);
	const positions = new Map<string, { x: number; y: number }>();
	for (const [depth, depthModules] of columns) {
		depthModules.forEach((module, index) => {
			positions.set(module.resource, {
				x: 20 + depth * 220,
				y: 20 + index * 96,
			});
		});
	}

	const edges = modules.flatMap((module) =>
		module.dependencies
			.filter((dependency) => positions.has(dependency))
			.map((dependency) => ({ from: module.resource, to: dependency })),
	);

	return [
		`<svg class="module-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Module dependency graph">`,
		'<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"></path></marker></defs>',
		...edges.map((edge) => renderGraphEdge(edge, positions)),
		...modules.map((module) => renderGraphNode(module, positions)),
		"</svg>",
	].join("\n");
}

function renderGraphEdge(
	edge: { readonly from: string; readonly to: string },
	positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): string {
	const from = positions.get(edge.from);
	const to = positions.get(edge.to);
	if (!from || !to) return "";
	const x1 = from.x + 170;
	const y1 = from.y + 24;
	const x2 = to.x;
	const y2 = to.y + 24;
	return `<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arrow)"></line>`;
}

function renderGraphNode(
	module: GraphModule,
	positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): string {
	const position = positions.get(module.resource);
	if (!position) return "";
	return [
		`<a href="${escapeHtml(moduleHref(module.resource))}">`,
		`<rect class="node" x="${position.x}" y="${position.y}" width="170" height="48" rx="6"></rect>`,
		`<text x="${position.x + 12}" y="${position.y + 29}">${escapeHtml(truncateMiddle(module.resource, 24))}</text>`,
		"</a>",
	].join("\n");
}

function renderDocumentSection(
	title: string,
	document: ArtifactDocument | undefined,
): string {
	if (!document) {
		return [
			'<section class="empty-state">',
			`<h2>${escapeHtml(title)}</h2>`,
			`<p>No ${escapeHtml(title.toLowerCase())} markdown found.</p>`,
			"</section>",
		].join("\n");
	}

	return [
		'<section class="markdown">',
		`<h2>${escapeHtml(title)}</h2>`,
		document.html,
		"</section>",
	].join("\n");
}

function renderTaskStatusSection(data: PlanViewerData): string {
	const tasks = data.taskStatus.tasks;
	if (tasks.length === 0) {
		const message = data.taskConfigExists
			? "No tasks are labeled for this plan."
			: "No tasks are labeled for this plan, and missions/tasks/config.json was not found. The viewer did not create task scaffolding.";
		return [
			'<section class="empty-state">',
			"<h2>Read-only Task Status</h2>",
			`<p>${escapeHtml(message)}</p>`,
			"</section>",
		].join("\n");
	}

	return [
		"<section>",
		"<h2>Read-only Task Status</h2>",
		'<dl class="counts">',
		...Object.entries(data.taskStatus.counts).map(
			([status, count]) =>
				`<dt>${escapeHtml(status)}</dt><dd>${escapeHtml(String(count))}</dd>`,
		),
		"</dl>",
		"<table>",
		"<thead><tr><th>ID</th><th>Title</th><th>Status</th></tr></thead>",
		"<tbody>",
		...tasks.map(
			(task) =>
				`<tr><td>${escapeHtml(task.id)}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.status)}</td></tr>`,
		),
		"</tbody>",
		"</table>",
		"</section>",
	].join("\n");
}

function parseModuleGraph(markdown: string): readonly GraphModule[] {
	const dependencyLines = markdownSection(markdown, "## Dependency Overview");
	const modules = new Map<string, string[]>();

	if (dependencyLines) {
		for (const line of dependencyLines.split("\n")) {
			const parsed = parseDependencyLine(line);
			if (parsed) modules.set(parsed.resource, parsed.dependencies);
		}
	}

	if (modules.size === 0) {
		for (const match of markdown.matchAll(/^- `([^`]+)`(?: - .*)?$/gmu)) {
			if (match[1]) modules.set(match[1], []);
		}
	}

	return [...modules.entries()]
		.map(([resource, dependencies]) => ({ resource, dependencies }))
		.sort((left, right) => left.resource.localeCompare(right.resource));
}

function parseDependencyLine(
	line: string,
): { readonly resource: string; readonly dependencies: string[] } | undefined {
	const match = line.match(/^- `([^`]+)` -> (.+)$/u);
	if (!match?.[1] || !match[2]) return undefined;
	const dependencies =
		match[2] === "none"
			? []
			: [...match[2].matchAll(/`([^`]+)`/gu)].map((m) => m[1] ?? "");
	return {
		resource: match[1],
		dependencies: dependencies.filter(Boolean).sort(),
	};
}

function markdownSection(
	markdown: string,
	heading: string,
): string | undefined {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((line) => line.trim() === heading);
	if (start === -1) return undefined;
	const body: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) break;
		body.push(line);
	}
	return body.join("\n").trim();
}

function moduleDepths(
	modules: readonly GraphModule[],
): ReadonlyMap<string, number> {
	const moduleMap = new Map(modules.map((module) => [module.resource, module]));
	const depths = new Map<string, number>();
	const visiting = new Set<string>();

	const depthFor = (resource: string): number => {
		const existing = depths.get(resource);
		if (existing !== undefined) return existing;
		if (visiting.has(resource)) return 0;
		visiting.add(resource);
		const module = moduleMap.get(resource);
		const depth = module
			? Math.max(
					0,
					...module.dependencies
						.filter((dependency) => moduleMap.has(dependency))
						.map((dependency) => depthFor(dependency) + 1),
				)
			: 0;
		visiting.delete(resource);
		depths.set(resource, depth);
		return depth;
	};

	for (const module of modules) {
		depthFor(module.resource);
	}
	return depths;
}

function groupModulesByDepth(
	modules: readonly GraphModule[],
	depths: ReadonlyMap<string, number>,
): ReadonlyMap<number, readonly GraphModule[]> {
	const groups = new Map<number, GraphModule[]>();
	for (const module of modules) {
		const depth = depths.get(module.resource) ?? 0;
		groups.set(depth, [...(groups.get(depth) ?? []), module]);
	}
	return new Map(
		[...groups.entries()]
			.sort(([left], [right]) => left - right)
			.map(([depth, depthModules]) => [
				depth,
				depthModules.sort((left, right) =>
					left.resource.localeCompare(right.resource),
				),
			]),
	);
}

function moduleHref(resource: string): string {
	return `/architecture/modules/${resource
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/")}`;
}

function htmlResponse(
	statusCode: number,
	title: string,
	body: string,
): ArtifactViewerResponse {
	return {
		statusCode,
		headers: TEXT_HTML,
		body: renderShell(title, body),
	};
}

function renderShell(title: string, body: string): string {
	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(title)}</title>`,
		"<style>",
		'body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;margin:0;color:#202124;background:#fafafa}',
		"main{max-width:1040px;margin:0 auto;padding:24px}",
		"nav{display:flex;gap:16px;border-bottom:1px solid #d9dee3;padding:14px 24px;background:white}",
		"a{color:#0b57d0;text-decoration:none}a:hover{text-decoration:underline}",
		"h1,h2,h3{line-height:1.2}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}",
		"pre{overflow:auto;background:#f1f3f4;padding:12px;border-radius:6px}",
		".banner{border:1px solid #d9dee3;border-radius:6px;padding:10px 12px;background:white}.current{border-color:#188038}.stale{border-color:#b06000}.missing{border-color:#b3261e}",
		".empty-state{border:1px solid #d9dee3;border-radius:6px;background:white;padding:16px;margin:16px 0}",
		".item-list{display:grid;gap:8px;padding-left:20px}.meta{color:#5f6368}",
		".module-graph{width:100%;max-height:560px;background:white;border:1px solid #d9dee3;border-radius:6px}.node{fill:#eef4ff;stroke:#8ab4f8}.edge{stroke:#5f6368;stroke-width:1.5}marker path{fill:#5f6368}text{font-size:13px;fill:#202124}",
		"table{width:100%;border-collapse:collapse;background:white}th,td{border:1px solid #d9dee3;padding:8px;text-align:left}.counts{display:grid;grid-template-columns:max-content max-content;gap:4px 12px}",
		"</style>",
		"</head>",
		"<body>",
		"<main>",
		body,
		"</main>",
		"</body>",
		"</html>",
	].join("\n");
}

function decodeRoutePath(url: string): RoutePath | undefined {
	const rawPath = rawPathFromUrl(url);
	try {
		return {
			rawPath,
			decodedPath: decodeURIComponent(rawPath),
		};
	} catch {
		return undefined;
	}
}

function rawPathFromUrl(url: string): string {
	const originForm = url.match(
		/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(?<path>[^?#]*)/iu,
	)?.groups?.path;
	const path = originForm ?? url.split(/[?#]/u, 1)[0] ?? "/";
	return path === "" ? "/" : path;
}

function hasProtectedTraversal(routePath: RoutePath): boolean {
	return PROTECTED_ROUTE_PREFIXES.some(
		(prefix) =>
			(routePath.rawPath.startsWith(prefix) ||
				routePath.decodedPath.startsWith(prefix)) &&
			(hasTraversalSegment(routePath.rawPath) ||
				hasTraversalSegment(routePath.decodedPath)),
	);
}

function hasTraversalSegment(path: string): boolean {
	return path.split("/").some((segment) => segment === "..");
}

function withoutTrailingSlash(path: string): string {
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function isClientRouteError(error: Error): boolean {
	return (
		error.message.startsWith("Invalid plan slug") ||
		error.message.startsWith("Plan slug cannot be empty") ||
		error.message.startsWith("Invalid architecture resource") ||
		error.message.startsWith("Architecture resource cannot be empty")
	);
}

function shortHash(hash: string): string {
	return hash.slice(0, 12);
}

function truncateMiddle(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	const prefixLength = Math.ceil((maxLength - 3) / 2);
	const suffixLength = Math.floor((maxLength - 3) / 2);
	return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
}

async function writeResponse(
	response: ServerResponse<IncomingMessage>,
	pending: Promise<ArtifactViewerResponse>,
	headOnly: boolean,
): Promise<void> {
	try {
		const result = await pending;
		response.writeHead(result.statusCode, {
			...result.headers,
			"content-length": Buffer.byteLength(headOnly ? "" : result.body),
		});
		response.end(headOnly ? "" : result.body);
	} catch (error) {
		const body = renderShell(
			"Internal Server Error",
			`<p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>`,
		);
		response.writeHead(500, {
			...TEXT_HTML,
			"content-length": Buffer.byteLength(body),
		});
		response.end(body);
	}
}
