import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileGraph, FileGraphExport } from "./types.ts";

/** Default token budget for a repo-map slice (lean brief, WP3 acceptance). */
export const DEFAULT_SLICE_BUDGET_TOKENS = 1500 as const;

const DAMPING = 0.85;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-6;
const IDENTIFIER_PATTERN = /[A-Za-z_$][\w$]*/gu;

export interface RepoMapSliceOptions {
	readonly graph: FileGraph;
	/** Repo-relative file paths, or directories whose files all join the set. */
	readonly touchSet: readonly string[];
	/**
	 * Existing files the change must use but not edit. They seed the ranking
	 * with the touch set and render as `[reuse]`; their own neighbours are not
	 * required. A path in both sets is a touch file.
	 */
	readonly reuseSet?: readonly string[];
	readonly budgetTokens: number;
	/**
	 * Source text of the touch-set files and their importers, keyed by path.
	 * An export whose name appears in an importer's source ranks first in its
	 * file's list; without sources, exports keep name order.
	 */
	readonly sources?: ReadonlyMap<string, string>;
}

export interface RepoMapSlice {
	readonly text: string;
	/** Rendered files in output order. */
	readonly included: readonly string[];
	/** Ranked files left out whole to stay inside the budget. */
	readonly dropped: readonly string[];
	readonly tokens: number;
	/** Touch-set and reuse-set entries that match no file in the graph. */
	readonly unknown: readonly string[];
}

type SliceRole = "touch" | "reuse" | "dependency" | "dependent" | "related";

const ROLE_ORDER: readonly SliceRole[] = [
	"touch",
	"reuse",
	"dependency",
	"dependent",
	"related",
];

/**
 * Which exports survive a tight budget first: the touch files' own, then
 * names the touch set imports (and every reused export), then the rest of a
 * dependency's exports, then dependents' own exports.
 */
const EXPORT_TIER = { touch: 0, used: 1, unused: 2, dependent: 3 } as const;

type ExportTier = (typeof EXPORT_TIER)[keyof typeof EXPORT_TIER];

interface SliceFile {
	readonly path: string;
	readonly roles: readonly SliceRole[];
	/** Exports in keep order: referenced by a touch-set edge first, then by name. */
	readonly exports: readonly FileGraphExport[];
	/** How many leading `exports` a touch-set edge references. */
	readonly referencedCount: number;
}

interface Placement {
	readonly file: SliceFile;
	readonly cap: number;
}

interface FitResult {
	readonly placements: readonly Placement[];
	readonly dropped: readonly string[];
}

/** chars/4 (ruling G-4); no tokenizer is installed. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Reduces the file graph to the files around a touch set, ranked by
 * personalized PageRank and rendered as paths plus one-line export
 * signatures inside a hard token budget. Direct dependencies and dependents
 * of the touch set, and the reuse set, are kept before any other file. Under
 * a tight budget the touch files keep their signatures longest, then the
 * names the touch set imports; whole files drop lowest rank first.
 */
export function repoMapSlice(options: RepoMapSliceOptions): RepoMapSlice {
	assertBudget(options.budgetTokens);
	const touchSet = resolveTouchSet(options.graph, options.touchSet);
	const reuseSet = resolveTouchSet(options.graph, options.reuseSet ?? []);
	const touch = touchSet.paths;
	const reuse = reuseSet.paths.filter((path) => !touch.includes(path));
	const scores = personalizedPageRank({
		graph: options.graph,
		seeds: [...touch, ...reuse],
	});
	const ranked = rankByScore(scores);
	const files = describeFiles({ ...options, touch, reuse, ranked });
	const fit = fitToBudget({ ...files, budget: options.budgetTokens });
	const text = renderPlacements(fit.placements);
	return {
		text,
		included: fit.placements.map((placement) => placement.file.path),
		dropped: fit.dropped,
		tokens: estimateTokens(text),
		unknown: [...new Set([...touchSet.unknown, ...reuseSet.unknown])].sort(
			compareStrings,
		),
	};
}

/** Reads the sources `repoMapSlice` uses to rank exports: the touch set and its importers. */
export async function loadSliceSources(options: {
	readonly projectRoot: string;
	readonly graph: FileGraph;
	readonly touchSet: readonly string[];
}): Promise<ReadonlyMap<string, string>> {
	const touch = new Set(resolveTouchSet(options.graph, options.touchSet).paths);
	const importers = new Set(touch);
	for (const edge of options.graph.edges) {
		if (touch.has(edge.to)) importers.add(edge.from);
	}
	const sources = new Map<string, string>();
	for (const path of [...importers].sort(compareStrings)) {
		const text = await readOptionalFile(join(options.projectRoot, path));
		if (text !== undefined) sources.set(path, text);
	}
	return sources;
}

/**
 * Personalized PageRank over the file graph with edges taken in both
 * directions and weighted by imported-name count. Restarts land uniformly on
 * the seeds, as does the mass of files with no edges.
 */
export function personalizedPageRank(options: {
	readonly graph: FileGraph;
	readonly seeds: readonly string[];
}): ReadonlyMap<string, number> {
	const paths = options.graph.nodes
		.map((node) => node.path)
		.sort(compareStrings);
	const index = new Map(paths.map((path, position) => [path, position]));
	const seeds = [...new Set(options.seeds)]
		.map((seed) => index.get(seed))
		.filter((position): position is number => position !== undefined);
	if (seeds.length === 0) return new Map();
	const adjacency = buildAdjacency(options.graph, index, paths.length);
	const ranks = iterateRanks(adjacency, seeds);
	return new Map(paths.map((path, position) => [path, ranks[position] ?? 0]));
}

interface Adjacency {
	readonly targets: readonly (readonly number[])[];
	readonly weights: readonly (readonly number[])[];
	readonly totals: readonly number[];
}

function buildAdjacency(
	graph: FileGraph,
	index: ReadonlyMap<string, number>,
	size: number,
): Adjacency {
	const targets: number[][] = Array.from({ length: size }, () => []);
	const weights: number[][] = Array.from({ length: size }, () => []);
	const totals: number[] = new Array<number>(size).fill(0);
	const link = (from: number, to: number, weight: number) => {
		targets[from]?.push(to);
		weights[from]?.push(weight);
		totals[from] = (totals[from] ?? 0) + weight;
	};
	for (const edge of graph.edges) {
		const from = index.get(edge.from);
		const to = index.get(edge.to);
		if (from === undefined || to === undefined || edge.weight <= 0) continue;
		link(from, to, edge.weight);
		link(to, from, edge.weight);
	}
	return { targets, weights, totals };
}

function iterateRanks(
	adjacency: Adjacency,
	seeds: readonly number[],
): readonly number[] {
	const restart = 1 / seeds.length;
	let ranks: readonly number[] = Array.from(
		{ length: adjacency.totals.length },
		(_, position) => (seeds.includes(position) ? restart : 0),
	);
	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		const next = stepRanks(adjacency, ranks, seeds);
		const delta = next.reduce(
			(sum, value, position) => sum + Math.abs(value - (ranks[position] ?? 0)),
			0,
		);
		ranks = next;
		if (delta < TOLERANCE) break;
	}
	return ranks;
}

function stepRanks(
	adjacency: Adjacency,
	ranks: readonly number[],
	seeds: readonly number[],
): readonly number[] {
	const next: number[] = new Array<number>(ranks.length).fill(0);
	let dangling = 0;
	ranks.forEach((rank, from) => {
		const total = adjacency.totals[from] ?? 0;
		if (total === 0) {
			dangling += rank;
			return;
		}
		const targets = adjacency.targets[from] ?? [];
		const weights = adjacency.weights[from] ?? [];
		targets.forEach((to, position) => {
			next[to] =
				(next[to] ?? 0) + (DAMPING * rank * (weights[position] ?? 0)) / total;
		});
	});
	const restart = (1 - DAMPING + DAMPING * dangling) / seeds.length;
	for (const seed of seeds) next[seed] = (next[seed] ?? 0) + restart;
	return next;
}

/** Score descending, path ascending on ties; files with no score are unreachable and omitted. */
function rankByScore(scores: ReadonlyMap<string, number>): readonly string[] {
	return [...scores.entries()]
		.filter(([, score]) => score > 0)
		.sort(
			([leftPath, left], [rightPath, right]) =>
				right - left || compareStrings(leftPath, rightPath),
		)
		.map(([path]) => path);
}

function resolveTouchSet(
	graph: FileGraph,
	touchSet: readonly string[],
): { readonly paths: readonly string[]; readonly unknown: readonly string[] } {
	const known = graph.nodes.map((node) => node.path);
	const paths = new Set<string>();
	const unknown: string[] = [];
	for (const entry of touchSet) {
		const normalized = normalizeTouchEntry(entry);
		if (normalized === "") continue;
		const matches = known.filter(
			(path) =>
				path === normalized ||
				path.startsWith(`${normalized.replace(/\/$/u, "")}/`),
		);
		if (matches.length === 0) unknown.push(normalized);
		for (const match of matches) paths.add(match);
	}
	return {
		paths: [...paths].sort(compareStrings),
		unknown: [...new Set(unknown)].sort(compareStrings),
	};
}

function normalizeTouchEntry(entry: string): string {
	return entry.trim().replace(/^`|`$/gu, "").replace(/^\.\//u, "");
}

function describeFiles(options: {
	readonly graph: FileGraph;
	readonly touch: readonly string[];
	readonly reuse: readonly string[];
	readonly ranked: readonly string[];
	readonly sources?: ReadonlyMap<string, string>;
}): { readonly required: SliceFile[]; readonly optional: SliceFile[] } {
	const roles = assignRoles(options);
	const referenced = referencedNames(
		options.graph,
		options.touch,
		options.sources,
	);
	const exportsByPath = new Map(
		options.graph.nodes.map((node) => [node.path, node.exports]),
	);
	const describe = (path: string): SliceFile => {
		const names = referenced.get(path) ?? new Set<string>();
		const exports = orderExports(exportsByPath.get(path) ?? [], names);
		return {
			path,
			roles: roles.get(path) ?? ["related"],
			exports,
			referencedCount: exports.filter((entry) => names.has(entry.name)).length,
		};
	};
	const touch = new Set(options.touch);
	const touchFiles = options.ranked.filter((path) => touch.has(path));
	const others = options.ranked.filter(
		(path) => !touch.has(path) && roles.has(path),
	);
	return {
		required: [...touchFiles, ...others].map(describe),
		optional: options.ranked.filter((path) => !roles.has(path)).map(describe),
	};
}

function assignRoles(options: {
	readonly graph: FileGraph;
	readonly touch: readonly string[];
	readonly reuse: readonly string[];
}): ReadonlyMap<string, readonly SliceRole[]> {
	const touch = new Set(options.touch);
	const seeds = new Set([...options.touch, ...options.reuse]);
	const roles = new Map<string, Set<SliceRole>>([
		...options.reuse.map(
			(path) => [path, new Set<SliceRole>(["reuse"])] as const,
		),
		...options.touch.map(
			(path) => [path, new Set<SliceRole>(["touch"])] as const,
		),
	]);
	const add = (path: string, role: SliceRole) => {
		if (seeds.has(path)) return;
		roles.set(path, (roles.get(path) ?? new Set<SliceRole>()).add(role));
	};
	for (const edge of options.graph.edges) {
		if (touch.has(edge.from)) add(edge.to, "dependency");
		if (touch.has(edge.to)) add(edge.from, "dependent");
	}
	return new Map(
		[...roles].map(([path, found]) => [
			path,
			ROLE_ORDER.filter((role) => found.has(role)),
		]),
	);
}

/** Names of each file's exports that appear as identifiers in a touch-set edge's importing file. */
function referencedNames(
	graph: FileGraph,
	touch: readonly string[],
	sources: ReadonlyMap<string, string> | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
	const referenced = new Map<string, Set<string>>();
	if (!sources) return referenced;
	const touchSet = new Set(touch);
	const identifiers = new Map<string, ReadonlySet<string>>();
	const exportsByPath = new Map(
		graph.nodes.map((node) => [node.path, node.exports]),
	);
	for (const edge of graph.edges) {
		if (!touchSet.has(edge.from) && !touchSet.has(edge.to)) continue;
		const importer = identifiersOf(edge.from, sources, identifiers);
		const names = referenced.get(edge.to) ?? new Set<string>();
		for (const entry of exportsByPath.get(edge.to) ?? []) {
			if (importer.has(entry.name)) names.add(entry.name);
		}
		referenced.set(edge.to, names);
	}
	return referenced;
}

function identifiersOf(
	path: string,
	sources: ReadonlyMap<string, string>,
	cache: Map<string, ReadonlySet<string>>,
): ReadonlySet<string> {
	const cached = cache.get(path);
	if (cached) return cached;
	const found = new Set(sources.get(path)?.match(IDENTIFIER_PATTERN) ?? []);
	cache.set(path, found);
	return found;
}

function orderExports(
	exports: readonly FileGraphExport[],
	referenced: ReadonlySet<string>,
): readonly FileGraphExport[] {
	return [...exports].sort(
		(left, right) =>
			Number(referenced.has(right.name)) - Number(referenced.has(left.name)) ||
			compareStrings(left.name, right.name) ||
			compareStrings(left.kind, right.kind),
	);
}

/**
 * Fills the budget in priority order: every required path (touch files, then
 * the others by rank), touch-file signatures, then the remaining signatures
 * tier by tier (round-robin across files within a tier). Related files join,
 * whole, only when every required file fits in full.
 */
function fitToBudget(options: {
	readonly required: readonly SliceFile[];
	readonly optional: readonly SliceFile[];
	readonly budget: number;
}): FitResult {
	const { layout, overflowed } = placeRequired(
		options.required,
		options.budget,
	);
	if (!overflowed || touchFilesFull(layout)) growOtherTiers(layout);
	const kept = new Set(
		layout.placements.map((placement) => placement.file.path),
	);
	const droppedRequired = options.required
		.filter((file) => !kept.has(file.path))
		.map((file) => file.path);
	if (droppedRequired.length > 0 || !layout.placements.every(isFull)) {
		const optional = options.optional.map((file) => file.path);
		return {
			placements: layout.placements,
			dropped: [...droppedRequired, ...optional],
		};
	}
	const dropped = options.optional
		.filter((file) => !layout.tryInclude(file, file.exports.length))
		.map((file) => file.path);
	return { placements: layout.placements, dropped };
}

function growOtherTiers(layout: BudgetedLayout): void {
	for (const tier of [
		EXPORT_TIER.used,
		EXPORT_TIER.unused,
		EXPORT_TIER.dependent,
	]) {
		growTier(layout, tier);
	}
}

/**
 * Places the required paths and the touch files' signatures. When the bare
 * paths overflow the budget, each touch file's first signature goes in
 * before the other required paths, which then drop lowest rank first; the
 * rest of the touch signatures grow after them, so a large touch set's
 * export lists never crowd out every neighbour.
 */
function placeRequired(
	required: readonly SliceFile[],
	budget: number,
): { readonly layout: BudgetedLayout; readonly overflowed: boolean } {
	const touch = required.filter(isTouchFile);
	const others = required.filter((file) => !isTouchFile(file));
	const layout = new BudgetedLayout(budget);
	if (includeInOrder(layout, [...touch, ...others])) {
		growTier(layout, EXPORT_TIER.touch);
		return { layout, overflowed: false };
	}
	const overflow = new BudgetedLayout(budget);
	if (includeInOrder(overflow, touch) && growFirstSignatures(overflow))
		includeInOrder(overflow, others);
	growTier(overflow, EXPORT_TIER.touch);
	return { layout: overflow, overflowed: true };
}

function touchFilesFull(layout: BudgetedLayout): boolean {
	return layout.placements.every(
		(placement) => !isTouchFile(placement.file) || isFull(placement),
	);
}

/** Gives every placed file its first signature in order until one does not fit; reports whether all did. */
function growFirstSignatures(layout: BudgetedLayout): boolean {
	return layout.placements.every(
		(placement, position) =>
			placement.cap > 0 || isFull(placement) || layout.tryGrow(position),
	);
}

/** Placements in render order with their rendered size tracked against the budget. */
class BudgetedLayout {
	readonly placements: Placement[] = [];
	private chars = 0;

	constructor(private readonly budget: number) {}

	tryInclude(file: SliceFile, cap = 0): boolean {
		return this.tryPlace(this.placements.length, { file, cap });
	}

	tryGrow(position: number): boolean {
		const placement = this.placements[position];
		if (!placement || isFull(placement)) return false;
		return this.tryPlace(position, {
			file: placement.file,
			cap: placement.cap + 1,
		});
	}

	private tryPlace(position: number, next: Placement): boolean {
		const current = this.placements[position];
		const chars =
			this.chars -
			(current ? placementChars(current) : 0) +
			placementChars(next);
		if (Math.ceil(Math.max(0, chars - 1) / 4) > this.budget) return false;
		this.placements[position] = next;
		this.chars = chars;
		return true;
	}
}

/** Includes files in order until one does not fit; reports whether all did. */
function includeInOrder(
	layout: BudgetedLayout,
	files: readonly SliceFile[],
): boolean {
	return files.every((file) => layout.tryInclude(file));
}

function growTier(layout: BudgetedLayout, tier: ExportTier): void {
	const closed = new Set<number>();
	let grew = true;
	while (grew) {
		grew = false;
		for (let position = 0; position < layout.placements.length; position += 1) {
			const placement = layout.placements[position];
			if (!placement || closed.has(position) || !nextIsTier(placement, tier))
				continue;
			if (layout.tryGrow(position)) grew = true;
			else closed.add(position);
		}
	}
}

function nextIsTier(placement: Placement, tier: ExportTier): boolean {
	return (
		!isFull(placement) && exportTier(placement.file, placement.cap) === tier
	);
}

function exportTier(file: SliceFile, index: number): ExportTier {
	if (file.roles.includes("touch")) return EXPORT_TIER.touch;
	if (file.roles.includes("reuse")) return EXPORT_TIER.used;
	if (!file.roles.includes("dependency")) return EXPORT_TIER.dependent;
	return index < file.referencedCount ? EXPORT_TIER.used : EXPORT_TIER.unused;
}

function isTouchFile(file: SliceFile): boolean {
	return file.roles.includes("touch");
}

function isFull(placement: Placement): boolean {
	return placement.cap >= placement.file.exports.length;
}

/** Rendered length of a placement's lines, one newline each. */
function placementChars(placement: Placement): number {
	return renderPlacement(placement).reduce(
		(sum, line) => sum + line.length + 1,
		0,
	);
}

function renderPlacements(placements: readonly Placement[]): string {
	return placements.flatMap(renderPlacement).join("\n");
}

function renderPlacement(placement: Placement): readonly string[] {
	const { file, cap } = placement;
	const hidden = file.exports.length - cap;
	return [
		`${file.path} [${file.roles.join(", ")}]`,
		...file.exports.slice(0, cap).map((entry) => `  ${entry.signature}`),
		...(hidden > 0 ? [`  … ${hidden} more`] : []),
	];
}

function assertBudget(budget: number): void {
	if (!Number.isFinite(budget) || budget < 0) {
		throw new RangeError(
			`Slice budget must be a non-negative number of tokens: ${budget}`,
		);
	}
}

async function readOptionalFile(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function compareStrings(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
