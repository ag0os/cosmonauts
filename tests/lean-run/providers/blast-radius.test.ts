/**
 * Tests for createBlastRadiusProvider.
 * Missing and unreadable graph.json become info signals, a present graph is
 * walked, staleness is reported in the summary, and nothing re-enters.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	ARCHITECTURE_MAP_OUTPUT_DIR,
	FILE_GRAPH_PATH,
} from "../../../lib/architecture-map/index.ts";
import { createBlastRadiusProvider } from "../../../lib/lean-run/providers/blast-radius.ts";
import { LAYERED_GRAPH } from "../graph/fixtures.ts";
import { stubContext } from "./context.ts";

const CURRENT = async () => ({ kind: "current", hash: "h" }) as const;

describe("createBlastRadiusProvider", () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await mkdtemp(join(tmpdir(), "lean-blast-radius-"));
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	test("reports a missing graph.json as unavailable info without throwing", async () => {
		const signal = await createBlastRadiusProvider().run(
			stubContext({ worktree: projectRoot, changedFiles: ["lib/a.ts"] }),
		);
		expect(signal).toEqual({
			kind: "blast-radius",
			status: "info",
			summary:
				"graph.json is missing; run `cosmonauts architecture generate --file-graph` to compute the blast radius.",
			data: {
				graph: "missing",
				unavailable: true,
				reason: "graph.json is missing",
			},
			reenter: false,
		});
	});

	test("reports an unreadable graph.json as unavailable info without throwing", async () => {
		const dir = join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR);
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, FILE_GRAPH_PATH),
			'{"schemaVersion":99}',
			"utf-8",
		);
		const signal = await createBlastRadiusProvider().run(
			stubContext({ worktree: projectRoot }),
		);
		expect(signal).toMatchObject({
			status: "info",
			reenter: false,
			data: { graph: "unreadable", unavailable: true },
		});
		expect(signal.summary).toMatch(/^graph\.json is unreadable: /);
	});

	test("walks a current graph and reports the counts", async () => {
		const provider = createBlastRadiusProvider({
			loadGraph: async () => LAYERED_GRAPH,
			checkFreshness: CURRENT,
		});
		const signal = await provider.run(
			stubContext({ worktree: projectRoot, changedFiles: ["lib/a.ts"] }),
		);
		expect(signal).toEqual({
			kind: "blast-radius",
			status: "info",
			summary: "Blast radius: 1 changed, 2 dependents, 3 tests.",
			data: {
				graph: "current",
				radius: {
					changed: ["lib/a.ts"],
					dependents: ["lib/b.ts", "lib/c.ts"],
					tests: ["tests/a.test.ts", "tests/b.test.ts", "tests/c.test.ts"],
					hubs: [],
					truncated: false,
				},
			},
			reenter: false,
		});
	});

	test("says the graph is stale and still walks it", async () => {
		const provider = createBlastRadiusProvider({
			loadGraph: async () => LAYERED_GRAPH,
			checkFreshness: async () => ({
				kind: "stale",
				oldHash: "a",
				newHash: "b",
			}),
		});
		const signal = await provider.run(
			stubContext({ worktree: projectRoot, changedFiles: ["lib/a.ts"] }),
		);
		expect(signal.summary).toBe(
			"graph.json is stale; imports added since it was generated are missing. Blast radius: 1 changed, 2 dependents, 3 tests.",
		);
		expect(signal.data).toMatchObject({ graph: "stale" });
	});

	test("reports unknown freshness when the check throws", async () => {
		const provider = createBlastRadiusProvider({
			loadGraph: async () => LAYERED_GRAPH,
			checkFreshness: async () => {
				throw new Error("no config");
			},
		});
		const signal = await provider.run(stubContext({ worktree: projectRoot }));
		expect(signal.data).toMatchObject({ graph: "unknown" });
		expect(signal.reenter).toBe(false);
	});

	test("names hubs and truncation in the summary", async () => {
		const provider = createBlastRadiusProvider({
			loadGraph: async () => LAYERED_GRAPH,
			checkFreshness: CURRENT,
			hubThreshold: 1,
		});
		const signal = await provider.run(
			stubContext({ worktree: projectRoot, changedFiles: ["lib/a.ts"] }),
		);
		expect(signal.summary).toBe(
			"Blast radius: 1 changed, 1 dependents, 2 tests (truncated); hubs not expanded transitively: lib/a.ts.",
		);
	});
});
