import { join, relative } from "node:path";
import { writeFileAtomically } from "../fs/atomic-file.ts";
import { readWorktreeChange, readWorktreeStatus } from "./git.ts";
import type { BlastRadius } from "./graph/blast-radius.ts";
import { renderChangeDiagram } from "./graph/mermaid.ts";
import { normalizeRepoPaths } from "./graph/paths.ts";
import type { PlanVersusActual } from "./graph/plan-vs-actual.ts";
import { type DispositionedFinding, renderPrBody } from "./graph/pr-body.ts";
import {
	type ParsedPlan,
	RUN_RECORD_FILES,
	type RunRecord,
	type RunTier,
	type Signal,
} from "./types.ts";

export interface RunPrBodyOptions {
	readonly record: RunRecord;
	readonly projectRoot: string;
	readonly plan: ParsedPlan;
	/** `plan` when a plan document came with the change, else the run's tier. */
	readonly tier: RunTier;
}

const TITLE_CHARS = 72;

/**
 * Writes `pr-body.md` into the run directory (brief 4.9) from the record:
 * the plan's diagram restyled with each changed file's diff status, the last
 * provider pass's signals, blast radius and plan-versus-actual data, and the
 * last review's findings, each `open`. Records its project-relative path as
 * the manifest's `prBodyPath`; saving the manifest is the caller's.
 */
export async function writeRunPrBody(
	options: RunPrBodyOptions,
): Promise<string> {
	const { record, projectRoot } = options;
	const base = record.manifest.diffBase ?? record.manifest.baseSha;
	const [{ changedFiles }, classes] = await Promise.all([
		readWorktreeChange({ cwd: projectRoot, base }),
		readWorktreeStatus({ cwd: projectRoot, base }),
	]);
	const signals = record.facts.passes.at(-1)?.signals ?? [];
	const radius = radiusOf(signals) ?? emptyRadius(changedFiles);
	const comparison =
		options.tier === "plan" ? planDataOf(signals, changedFiles) : undefined;
	const changed = normalizeRepoPaths(changedFiles);
	const diagram = renderChangeDiagram({
		...(options.plan.diagram ? { planDiagram: options.plan.diagram } : {}),
		planned: comparison?.planned ?? changed,
		unplanned: comparison?.unplanned ?? [],
		untouched: comparison?.untouched ?? [],
		impacted: radius.dependents,
		tests: radius.tests,
		classes,
	});
	const body = renderPrBody({
		title: titleOf(options, base),
		diagram,
		verification: signals,
		blastRadius: radius,
		planVersusActual: comparison ?? {
			planned: [],
			unplanned: [],
			untouched: [],
		},
		...(comparison ? {} : { noPlan: noPlanNote(options.tier, changed) }),
		findings: openFindings(record),
	});
	const path = join(record.dir, RUN_RECORD_FILES.prBody);
	await writeFileAtomically(path, body);
	record.manifest.prBodyPath = relative(projectRoot, path);
	return path;
}

function titleOf(options: RunPrBodyOptions, base: string): string {
	if (options.tier === "plan" && options.plan.title) return options.plan.title;
	const firstLine = options.plan.raw.trim().split("\n")[0]?.trim() ?? "";
	if (firstLine === "") return `Change against ${base.slice(0, 7)}`;
	return firstLine.length <= TITLE_CHARS
		? firstLine
		: `${firstLine.slice(0, TITLE_CHARS - 1).trimEnd()}…`;
}

function noPlanNote(tier: RunTier, changed: readonly string[]): string {
	return `No plan (${tier} tier): nothing to compare the ${changed.length} changed file(s) against.`;
}

/** The last review's findings, none of them settled yet. */
function openFindings(record: RunRecord): DispositionedFinding[] {
	const review = record.envelopes["reviewer-2"] ?? record.envelopes.reviewer;
	return (review?.findings ?? []).map((finding) => ({
		...finding,
		disposition: "open",
	}));
}

function radiusOf(signals: readonly Signal[]): BlastRadius | undefined {
	const data = dataOf(signals, "blast-radius");
	const radius = data?.radius;
	return isRecord(radius) && Array.isArray(radius.tests)
		? (radius as unknown as BlastRadius)
		: undefined;
}

function emptyRadius(changedFiles: readonly string[]): BlastRadius {
	return {
		changed: normalizeRepoPaths(changedFiles),
		dependents: [],
		tests: [],
		hubs: [],
		truncated: false,
	};
}

/** The plan-versus-actual signal's lists; without one, every changed file is unplanned. */
function planDataOf(
	signals: readonly Signal[],
	changedFiles: readonly string[],
): PlanVersusActual {
	const data = dataOf(signals, "plan-vs-actual");
	const list = (key: string): string[] | undefined => {
		const value = data?.[key];
		return Array.isArray(value)
			? value.filter((entry): entry is string => typeof entry === "string")
			: undefined;
	};
	return {
		planned: list("planned") ?? [],
		unplanned: list("unplanned") ?? normalizeRepoPaths(changedFiles),
		untouched: list("untouched") ?? [],
	};
}

function dataOf(
	signals: readonly Signal[],
	kind: Signal["kind"],
): Record<string, unknown> | undefined {
	const data = signals.find((signal) => signal.kind === kind)?.data;
	return isRecord(data) ? data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
