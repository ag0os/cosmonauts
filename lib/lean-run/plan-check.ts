import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { planPathWarnings } from "./context-pack.ts";
import { type FileGraphRead, readFileGraph } from "./graph-refresh.ts";
import { parsePlan, planBehaviorProblems } from "./plan.ts";
import type { ParsedPlan } from "./types.ts";

/** What `cosmonauts lean check` prints with `--json`; the shape is fixed. */
export interface PlanCheckReport {
	readonly plan: string;
	/** No empty section and no behavior problem; path warnings never clear it. */
	readonly ok: boolean;
	readonly title: string;
	readonly emptySections: readonly string[];
	readonly pathWarnings: readonly string[];
	readonly behaviorProblems: readonly string[];
	readonly graph: "available" | `unavailable: ${string}`;
}

export interface CheckPlanOptions {
	readonly projectRoot: string;
	/** As given; read relative to `projectRoot`. */
	readonly planPath: string;
	/** Test seam; defaults to `readFileGraph`, which writes nothing. */
	readonly readGraph?: (options: {
		readonly projectRoot: string;
	}) => Promise<FileGraphRead>;
}

const SECTIONS: readonly [string, (plan: ParsedPlan) => boolean][] = [
	["Approach", (plan) => plan.approach === ""],
	["Touches", (plan) => plan.touches.length === 0],
	["Reuses", (plan) => plan.reuses.length === 0],
	["Behaviors", (plan) => plan.behaviors.length === 0],
	["Risks", (plan) => plan.risks.length === 0],
	["Diagram", (plan) => !plan.diagram],
];

/**
 * Reads a lean plan.md as the host does: the sections `parsePlan` finds
 * empty, the `Touches`/`Reuses` paths the repo map cannot show, and the
 * behavior lines not in the one-line shape. Throws only when the plan
 * cannot be read.
 */
export async function checkPlan(
	options: CheckPlanOptions,
): Promise<PlanCheckReport> {
	const markdown = await readFile(
		resolve(options.projectRoot, options.planPath),
		"utf-8",
	);
	const plan = parsePlan(markdown);
	const emptySections = SECTIONS.filter(([, empty]) => empty(plan)).map(
		([name]) => name,
	);
	const behaviorProblems = planBehaviorProblems(markdown);
	const read = await (options.readGraph ?? readFileGraph)({
		projectRoot: options.projectRoot,
	});
	const pathWarnings =
		read.outcome === "unavailable"
			? []
			: planPathWarnings({
					touches: plan.touches,
					reuses: plan.reuses,
					graph: read.graph,
					projectRoot: options.projectRoot,
				});
	return {
		plan: options.planPath,
		ok: emptySections.length === 0 && behaviorProblems.length === 0,
		title: plan.title,
		emptySections,
		pathWarnings,
		behaviorProblems,
		graph:
			read.outcome === "unavailable"
				? `unavailable: ${read.reason}`
				: "available",
	};
}
