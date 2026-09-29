import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
	type ConsolidationSource,
	ConsolidationSourceContractError,
	type ConsolidationSourceSnapshot,
	collectConsolidationSources,
} from "../../lib/memory/consolidation-sources.ts";

const LIMITS = {
	maxCorpusRecords: 10,
	maxCorpusRecordBytes: 1024,
	maxCorpusBytes: 2048,
	maxEpisodeRecords: 10,
	maxEpisodeRecordBytes: 1024,
	maxEpisodeBytes: 2048,
};
const content = "# Admitted record\n";
const admitted = {
	id: "knowledge/admitted.md",
	sourceId: "incomplete",
	scope: "project",
	path: "knowledge/admitted.md",
	kind: "knowledge",
	digest: createHash("sha256").update(content).digest("hex"),
	content,
	metadata: {},
} as const;
const { content: _content, ...admittedInventory } = admitted;

function source(
	id: string,
	snapshot: ConsolidationSourceSnapshot,
): ConsolidationSource {
	return {
		id,
		async collect() {
			return snapshot;
		},
	};
}

describe("consolidation source contracts through collection", () => {
	test("rejects a complete inventory that lists the admitted record but not the omitted one without exposing a partial result", async () => {
		const previous = source("previous", {
			records: [],
			inventory: [],
			inventoryComplete: true,
			omitted: 0,
			deferred: 0,
		});
		const incomplete = source("incomplete", {
			records: [admitted],
			inventory: [admittedInventory],
			inventoryComplete: true,
			omitted: 1,
			deferred: 0,
		});
		let result:
			| Awaited<ReturnType<typeof collectConsolidationSources>>
			| undefined;
		let failure: unknown;
		try {
			result = await collectConsolidationSources({
				sources: [previous, incomplete],
				...LIMITS,
			});
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(ConsolidationSourceContractError);
		expect((failure as Error).message).toBe(
			"Source incomplete claimed complete inventory without inventorying omitted records.",
		);
		expect(result).toBeUndefined();
	});

	test("rejects duplicate source ids before collecting the second source", async () => {
		const empty = source("repeated", {
			records: [],
			inventory: [],
			inventoryComplete: true,
			omitted: 0,
			deferred: 0,
		});
		await expect(
			collectConsolidationSources({ sources: [empty, empty], ...LIMITS }),
		).rejects.toThrow("Duplicate source ids are not supported: repeated.");
	});

	test("rejects a source that does not declare inventory completeness", async () => {
		const invalid = source("undeclared", {
			records: [],
			inventory: [],
			omitted: 0,
			deferred: 0,
		} as unknown as ConsolidationSourceSnapshot);
		await expect(
			collectConsolidationSources({ sources: [invalid], ...LIMITS }),
		).rejects.toThrow("Source undeclared must declare inventory completeness.");
	});

	test("rejects an invalid omitted count", async () => {
		const invalid = source("bad-count", {
			records: [],
			inventory: [],
			inventoryComplete: true,
			omitted: -1,
			deferred: 0,
		});
		await expect(
			collectConsolidationSources({ sources: [invalid], ...LIMITS }),
		).rejects.toThrow("Source bad-count returned an invalid omitted count.");
	});
});
