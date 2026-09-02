import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConsolidationSourceRecord } from "../../lib/memory/consolidation-sources.ts";
import { createLivingMemoryRetirementStore } from "../../lib/memory/retirement-store.ts";

const [projectRoot, selectedFailpoint] = process.argv.slice(2);
if (projectRoot === undefined || selectedFailpoint === undefined) {
	process.exit(2);
}

const path = "knowledge/eligible.md";
const content = await readFile(join(projectRoot, ...path.split("/")), "utf-8");
const digest = createHash("sha256").update(content).digest("hex");
const record = {
	id: "eligible",
	sourceId: "corpus",
	scope: "project",
	path,
	digest,
	kind: "knowledge",
	content,
	metadata: { scopeRoot: projectRoot },
} satisfies ConsolidationSourceRecord;

const store = createLivingMemoryRetirementStore({
	projectRoot,
	inspectCitations: async () => ({ healthy: true, entries: [], warnings: [] }),
	failpoint(point) {
		if (point === selectedFailpoint) process.exit(86);
	},
});
const result = await store.apply({
	candidates: [
		{
			record,
			reason: "retire-when-met",
			evidence: [
				{
					id: record.id,
					sourceId: record.sourceId,
					scope: record.scope,
					path: record.path,
					digest: record.digest,
				},
			],
			evidenceReason:
				"The replacement file exists. (path-exists fixed.txt observed true).",
		},
	],
	dryRun: false,
	date: new Date("2026-09-01T12:00:00.000Z"),
	maxRetirements: 5,
	lockOptions: {
		retryMs: 50,
		timeoutMs: 10_000,
		onReleaseUnconfirmed: () => undefined,
	},
});
process.exit(result.kind === "completed" ? 0 : 1);
