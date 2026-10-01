import {
	compareStrings,
	normalizeRepoPath,
	normalizeRepoPaths,
} from "./paths.ts";

export const CHANGE_CLASSES = [
	"added",
	"modified",
	"removed",
	"impacted",
] as const;
export type ChangeClass = (typeof CHANGE_CLASSES)[number];
export type FileChangeClass = Exclude<ChangeClass, "impacted">;

export interface DiagramEdge {
	readonly from: string;
	readonly to: string;
}

export interface ChangeDiagramOptions {
	/** The plan's `## Diagram`, fenced or bare; used when it is a flowchart. */
	readonly planDiagram?: string;
	readonly planned: readonly string[];
	readonly unplanned: readonly string[];
	readonly untouched: readonly string[];
	/** Blast-radius dependents. */
	readonly impacted: readonly string[];
	readonly tests: readonly string[];
	/** Diff status per changed file; a changed file absent here is `modified`. */
	readonly classes?: Readonly<Record<string, FileChangeClass>>;
	/** Import edges (`from` imports `to`), drawn in a synthesized diagram when both ends appear. */
	readonly edges?: readonly DiagramEdge[];
}

const CLASS_DEFS: Readonly<Record<ChangeClass, string>> = {
	added: "fill:#dafbe1,stroke:#1a7f37,color:#1f2328",
	modified: "fill:#fff8c5,stroke:#9a6700,color:#1f2328",
	removed: "fill:#ffebe9,stroke:#cf222e,color:#1f2328,stroke-dasharray:4 3",
	impacted: "fill:#ddf4ff,stroke:#0969da,color:#1f2328",
};

const INDENT = "  ";
const FLOWCHART_HEADER = /^(graph|flowchart)\b/i;
const NODE_DECLARATION =
	/\b([A-Za-z_][A-Za-z0-9_]*)\s*[[({>]+[/\\]?\s*(?:"([^"]*)"|([^\])}"\n]*))\s*[/\\]?[\])}]/g;
const LABEL_SEPARATORS = /[\s"'`*()[\]{}<>,;|]+/;
const OUR_CLASS_LINE = new RegExp(
	`^(classDef\\s+(${CHANGE_CLASSES.join("|")})\\b|class\\s+\\S+\\s+(${CHANGE_CLASSES.join("|")})\\s*;?$)`,
);

interface DiagramFile {
	readonly path: string;
	readonly label: string;
	readonly changeClass?: ChangeClass;
}

interface DiagramGroup {
	readonly id: string;
	readonly title: string;
	readonly files: readonly DiagramFile[];
}

interface ChangeSets {
	readonly changed: string[];
	readonly unplanned: ReadonlySet<string>;
	readonly impacted: string[];
	readonly tests: string[];
	readonly untouched: string[];
	readonly classOf: ReadonlyMap<string, ChangeClass>;
}

/**
 * A Mermaid flowchart of a change. With a flowchart plan diagram, its nodes
 * and edges are kept and restyled: a node whose label contains a changed or
 * impacted file, or a directory above one, gets that class; files no node
 * names are appended in their own subgraphs. Without one, the diagram is
 * synthesized from the file sets.
 */
export function renderChangeDiagram(options: ChangeDiagramOptions): string {
	const sets = changeSets(options);
	const plan = flowchartSource(options.planDiagram);
	const lines =
		plan === undefined
			? synthesize(sets, options.edges ?? [])
			: restyle(plan, sets);
	return lines.join("\n");
}

function changeSets(options: ChangeDiagramOptions): ChangeSets {
	const unplanned = normalizeRepoPaths(options.unplanned);
	const changed = normalizeRepoPaths([...options.planned, ...unplanned]);
	const changedSet = new Set(changed);
	const notChanged = (path: string) => !changedSet.has(path);
	const impacted = normalizeRepoPaths(options.impacted).filter(notChanged);
	const tests = normalizeRepoPaths(options.tests).filter(notChanged);
	const classOf = new Map<string, ChangeClass>();
	for (const path of [...impacted, ...tests]) classOf.set(path, "impacted");
	const classes = normalizedClasses(options.classes ?? {});
	for (const path of changed)
		classOf.set(path, classes.get(path) ?? "modified");
	return {
		changed,
		unplanned: new Set(unplanned),
		impacted,
		tests: tests.filter((path) => !impacted.includes(path)),
		untouched: normalizeRepoPaths(options.untouched).filter(notChanged),
		classOf,
	};
}

function normalizedClasses(
	classes: Readonly<Record<string, FileChangeClass>>,
): Map<string, FileChangeClass> {
	return new Map(
		Object.entries(classes).map(([path, kind]) => [
			normalizeRepoPath(path),
			kind,
		]),
	);
}

function synthesize(sets: ChangeSets, edges: readonly DiagramEdge[]): string[] {
	const ids = new IdAllocator(new Set(GROUP_IDS));
	const groups = buildGroups(sets, sets.changed, true);
	allocateIds(ids, groups);
	return [
		"graph LR",
		...groups.flatMap((group) => renderGroup(group, ids)),
		...renderEdges(edges, ids),
		...renderClasses(groups, ids),
	];
}

function restyle(plan: PlanSource, sets: ChangeSets): string[] {
	const planLines = plan.body.filter(
		(line) => !OUR_CLASS_LINE.test(line.trim()),
	);
	const nodes = planNodes(planLines);
	const nodeClasses = classifyPlanNodes(nodes, sets.classOf);
	const named = new Set(
		[...sets.classOf.keys()].filter((path) =>
			nodes.some((node) => nodeCovers(node, path)),
		),
	);
	const unnamed = (path: string) => !named.has(path);
	const ids = new IdAllocator(
		new Set([...GROUP_IDS, ...nodes.map((node) => node.id)]),
	);
	const groups = buildGroups(
		{
			...sets,
			impacted: sets.impacted.filter(unnamed),
			tests: sets.tests.filter(unnamed),
			untouched: [],
		},
		sets.changed.filter(unnamed),
		false,
	);
	allocateIds(ids, groups);
	return [
		...[...plan.frontMatter, ...planLines].map((line) => line.trimEnd()),
		...groups.flatMap((group) => renderGroup(group, ids)),
		...renderClassLines(
			mergeAssignments(nodeClasses, groupAssignments(groups, ids)),
		),
	];
}

const GROUP_IDS = [
	"sg_changed",
	"sg_impacted",
	"sg_tests",
	"sg_untouched",
] as const;

function buildGroups(
	sets: ChangeSets,
	changed: readonly string[],
	synthesized: boolean,
): DiagramGroup[] {
	const file = (path: string, suffix = ""): DiagramFile => ({
		path,
		label: `${path}${suffix}`,
		changeClass: sets.classOf.get(path),
	});
	const changedTitle = synthesized ? "Changed" : "Changed, not in plan diagram";
	const groups: DiagramGroup[] = [
		{
			id: "sg_changed",
			title: changedTitle,
			files: changed.map((path) =>
				file(path, sets.unplanned.has(path) ? " (unplanned)" : ""),
			),
		},
		{
			id: "sg_impacted",
			title: "Impacted",
			files: sets.impacted.map((path) => file(path)),
		},
		{
			id: "sg_tests",
			title: "Tests",
			files: sets.tests.map((path) => file(path)),
		},
		{
			id: "sg_untouched",
			title: "Planned, not touched",
			files: sets.untouched.map((path) => ({ path, label: path })),
		},
	];
	return groups.filter((group) => group.files.length > 0);
}

function allocateIds(ids: IdAllocator, groups: readonly DiagramGroup[]): void {
	const paths = groups.flatMap((group) => group.files.map((file) => file.path));
	for (const path of [...paths].sort(compareStrings)) ids.idFor(path);
}

function renderGroup(group: DiagramGroup, ids: IdAllocator): string[] {
	return [
		`${INDENT}subgraph ${group.id}["${escapeLabel(group.title)}"]`,
		...group.files.map(
			(file) =>
				`${INDENT}${INDENT}${ids.idFor(file.path)}["${escapeLabel(file.label)}"]`,
		),
		`${INDENT}end`,
	];
}

function renderEdges(
	edges: readonly DiagramEdge[],
	ids: IdAllocator,
): string[] {
	const rendered = new Set<string>();
	for (const edge of edges) {
		const from = ids.existing(normalizeRepoPath(edge.from));
		const to = ids.existing(normalizeRepoPath(edge.to));
		if (from === undefined || to === undefined || from === to) continue;
		rendered.add(`${INDENT}${from} --> ${to}`);
	}
	return [...rendered].sort(compareStrings);
}

function renderClasses(
	groups: readonly DiagramGroup[],
	ids: IdAllocator,
): string[] {
	return renderClassLines(groupAssignments(groups, ids));
}

function groupAssignments(
	groups: readonly DiagramGroup[],
	ids: IdAllocator,
): Map<string, ChangeClass> {
	const assignments = new Map<string, ChangeClass>();
	for (const file of groups.flatMap((group) => group.files)) {
		if (file.changeClass !== undefined) {
			assignments.set(ids.idFor(file.path), file.changeClass);
		}
	}
	return assignments;
}

function mergeAssignments(
	first: ReadonlyMap<string, ChangeClass>,
	second: ReadonlyMap<string, ChangeClass>,
): Map<string, ChangeClass> {
	return new Map([...first, ...second]);
}

function renderClassLines(
	assignments: ReadonlyMap<string, ChangeClass>,
): string[] {
	const lines = CHANGE_CLASSES.map(
		(changeClass) =>
			`${INDENT}classDef ${changeClass} ${CLASS_DEFS[changeClass]}`,
	);
	for (const changeClass of CHANGE_CLASSES) {
		const members = [...assignments]
			.filter(([, assigned]) => assigned === changeClass)
			.map(([id]) => id)
			.sort(compareStrings);
		if (members.length > 0)
			lines.push(`${INDENT}class ${members.join(",")} ${changeClass}`);
	}
	return lines;
}

interface PlanNode {
	readonly id: string;
	readonly paths: readonly string[];
}

interface PlanSource {
	/** A leading YAML `---` block, kept verbatim. */
	readonly frontMatter: readonly string[];
	readonly body: readonly string[];
}

/** The flowchart lines of a plan diagram, or undefined when it is not a flowchart. */
function flowchartSource(diagram: string | undefined): PlanSource | undefined {
	if (diagram === undefined) return undefined;
	const fenced = /```mermaid[^\n]*\n([\s\S]*?)```/.exec(diagram);
	const source = splitFrontMatter(
		(fenced ? (fenced[1] as string) : diagram).trim().split("\n"),
	);
	const header = source.body
		.map((line) => line.trim())
		.find((line) => line !== "" && !isComment(line));
	return header !== undefined && FLOWCHART_HEADER.test(header)
		? source
		: undefined;
}

function splitFrontMatter(lines: readonly string[]): PlanSource {
	const isFence = (line: string | undefined) => line?.trim() === "---";
	if (!isFence(lines[0])) return { frontMatter: [], body: lines };
	const close = lines.findIndex((line, index) => index > 0 && isFence(line));
	if (close === -1) return { frontMatter: [], body: lines };
	return {
		frontMatter: lines.slice(0, close + 1),
		body: lines.slice(close + 1),
	};
}

function isComment(line: string): boolean {
	return line.trim().startsWith("%%");
}

/** Every declared node with the paths its labels mention; a node declared twice keeps both. */
function planNodes(lines: readonly string[]): PlanNode[] {
	const source = lines.filter((line) => !isComment(line)).join("\n");
	const nodes = new Map<string, Set<string>>();
	for (const match of source.matchAll(NODE_DECLARATION)) {
		const id = match[1] as string;
		const paths = nodes.get(id) ?? new Set<string>();
		for (const path of labelPaths(match[2] ?? match[3] ?? "")) paths.add(path);
		nodes.set(id, paths);
	}
	return [...nodes]
		.filter(([, paths]) => paths.size > 0)
		.map(([id, paths]) => ({ id, paths: [...paths] }));
}

/**
 * The path-like tokens of a label once HTML tags, entities and markdown
 * markers are removed. A label of a single token is taken whole, so a bare
 * directory such as `lib` still names one. Tokens are judged path-like as
 * written, before normalizing drops a trailing `/` or turns `\` into `/`.
 */
function labelPaths(label: string): string[] {
	const text = label.replace(/<[^>]*>/g, " ").replace(/#\w+;/g, " ");
	const tokens = text.split(LABEL_SEPARATORS).map(stripTokenPunctuation);
	const named = normalizeRepoPaths(tokens);
	return named.length === 1
		? named
		: normalizeRepoPaths(tokens.filter(isPathLike));
}

function stripTokenPunctuation(token: string): string {
	return token.replace(/^_(.+)_$/, "$1").replace(/[.:!?]+$/, "");
}

function isPathLike(token: string): boolean {
	return /[/\\.]/.test(token);
}

/** One class per node: the single change class of what it covers, `modified` when mixed. */
function classifyPlanNodes(
	nodes: readonly PlanNode[],
	classOf: ReadonlyMap<string, ChangeClass>,
): Map<string, ChangeClass> {
	const assignments = new Map<string, ChangeClass>();
	for (const node of nodes) {
		const covered = [...classOf].filter(([path]) => nodeCovers(node, path));
		const changeClass = nodeClass(covered.map(([, assigned]) => assigned));
		if (changeClass !== undefined) assignments.set(node.id, changeClass);
	}
	return assignments;
}

function nodeClass(classes: readonly ChangeClass[]): ChangeClass | undefined {
	const changed = new Set(
		classes.filter((assigned) => assigned !== "impacted"),
	);
	if (changed.size === 1) return [...changed][0];
	if (changed.size > 1) return "modified";
	return classes.length > 0 ? "impacted" : undefined;
}

function nodeCovers(node: PlanNode, path: string): boolean {
	return node.paths.some((entry) => covers(entry, path));
}

function covers(entry: string, path: string): boolean {
	return path === entry || path.startsWith(`${entry}/`);
}

function escapeLabel(label: string): string {
	return label.replaceAll('"', "#quot;");
}

/** Mermaid-safe ids derived from paths; collisions get a numeric suffix in allocation order. */
class IdAllocator {
	private readonly byPath = new Map<string, string>();

	constructor(private readonly taken: Set<string>) {}

	idFor(path: string): string {
		const known = this.byPath.get(path);
		if (known !== undefined) return known;
		const base = `f_${path.replace(/[^A-Za-z0-9]/g, "_")}`;
		let id = base;
		for (let suffix = 2; this.taken.has(id); suffix += 1)
			id = `${base}_${suffix}`;
		this.taken.add(id);
		this.byPath.set(path, id);
		return id;
	}

	existing(path: string): string | undefined {
		return this.byPath.get(path);
	}
}
