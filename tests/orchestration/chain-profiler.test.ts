/**
 * Tests for lib/orchestration/chain-profiler.ts
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	buildSummary,
	ChainProfiler,
	type ProfileTraceEntry,
	type ToolSpan,
} from "../../lib/orchestration/chain-profiler.ts";
import type {
	ChainEvent,
	ChainStage,
	ParallelGroupStep,
} from "../../lib/orchestration/types.ts";

// ============================================================================
// Helpers
// ============================================================================

function makeStage(name: string): ChainStage {
	return { name, loop: false };
}

function makeParallelStep(roles: string[]): ParallelGroupStep {
	const stages = roles.map(makeStage) as [ChainStage, ...ChainStage[]];
	return { kind: "parallel", stages, syntax: { kind: "group" } };
}

function feed(profiler: ChainProfiler, events: ChainEvent[]): void {
	for (const e of events) profiler.handleEvent(e);
}

interface SpawnedAgent {
	role: string;
	sessionId: string;
}

interface ToolEventOptions {
	role?: string;
	sessionId?: string;
	toolName: string;
	toolCallId: string;
	isError?: boolean;
}

function toolStartEvent({
	role = "worker",
	sessionId = "sess-1",
	toolName,
	toolCallId,
}: ToolEventOptions): ChainEvent {
	return {
		type: "agent_tool_use",
		role,
		sessionId,
		event: {
			type: "tool_execution_start",
			sessionId,
			toolName,
			toolCallId,
		},
	};
}

function toolEndEvent({
	role = "worker",
	sessionId = "sess-1",
	toolName,
	toolCallId,
	isError = false,
}: ToolEventOptions): ChainEvent {
	return {
		type: "agent_tool_use",
		role,
		sessionId,
		event: {
			type: "tool_execution_end",
			sessionId,
			toolName,
			toolCallId,
			isError,
		},
	};
}

function getEntries(profiler: ChainProfiler): ProfileTraceEntry[] {
	return (profiler as unknown as { entries: ProfileTraceEntry[] }).entries;
}

function getSpans(profiler: ChainProfiler): ToolSpan[] {
	return (profiler as unknown as { spans: ToolSpan[] }).spans;
}

function getPendingTools(
	profiler: ChainProfiler,
): Parameters<typeof buildSummary>[2] {
	return (
		profiler as unknown as { pendingTools: Parameters<typeof buildSummary>[2] }
	).pendingTools;
}

function buildProfilerSummary(profiler: ChainProfiler): string {
	return buildSummary(
		getEntries(profiler),
		getSpans(profiler),
		getPendingTools(profiler),
	);
}

function expectSpawnedScopes(
	profiler: ChainProfiler,
	expectedScopes: readonly (string | undefined)[],
): void {
	const spawned = getEntries(profiler).filter(
		(e) => e.name === "agent_spawned",
	);
	expect(spawned.map((entry) => entry.scope)).toEqual(expectedScopes);
}

function startParallelGroup(
	profiler: ChainProfiler,
	roles: string[],
	spawned: readonly SpawnedAgent[],
	options: { end?: boolean } = {},
): ParallelGroupStep {
	const step = makeParallelStep(roles);
	const events: ChainEvent[] = [
		{ type: "chain_start", steps: [step] },
		{ type: "parallel_start", step, stepIndex: 0 },
		...spawned.map(
			(agent) => ({ type: "agent_spawned", ...agent }) as ChainEvent,
		),
	];
	if (options.end) {
		events.push({
			type: "parallel_end",
			step,
			stepIndex: 0,
			results: [],
			success: true,
		});
	}
	feed(profiler, events);
	return step;
}

async function writeStartedProfile(outputDir: string): Promise<{
	tracePath: string;
	summaryPath: string;
}> {
	const profiler = new ChainProfiler({ outputDir });
	profiler.handleEvent({ type: "chain_start", steps: [] });
	return profiler.writeOutput();
}

function getSummarySection(summary: string, heading: string): string[] {
	const lines = summary.split("\n");
	const headingIndex = lines.indexOf(heading);
	expect(headingIndex).toBeGreaterThanOrEqual(0);
	const nextHeadingIndex = lines.findIndex(
		(line, index) => index > headingIndex && line.startsWith("==="),
	);
	return lines
		.slice(
			headingIndex + 1,
			nextHeadingIndex === -1 ? undefined : nextHeadingIndex - 1,
		)
		.filter((line) => line.length > 0);
}

// ============================================================================
// Basic event collection
// ============================================================================

describe("chain-profiler: basic event collection", () => {
	test("records chain_start as Begin entry", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });

		const entries = getEntries(profiler);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			cat: "chain",
			name: "chain_start",
			ph: "B",
		});
	});

	test("chain_start ts is 0 (relative to itself)", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });
		const entries = getEntries(profiler);
		expect(entries[0]?.ts).toBe(0);
	});

	test("stage_start/stage_end produce B/E entries", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		const stage = makeStage("coordinator");
		feed(profiler, [
			{ type: "chain_start", steps: [stage] },
			{ type: "stage_start", stage, stageIndex: 0 },
			{
				type: "stage_end",
				stage,
				result: { stage, success: true, iterations: 1, durationMs: 100 },
			},
		]);
		const entries = getEntries(profiler);
		const stageEntries = entries.filter((e) => e.cat === "stage");
		expect(stageEntries).toHaveLength(2);
		expect(stageEntries[0]).toMatchObject({ ph: "B", name: "coordinator" });
		expect(stageEntries[1]).toMatchObject({ ph: "E", name: "coordinator" });
	});

	test("error event produces instant entry", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		feed(profiler, [
			{ type: "chain_start", steps: [] },
			{ type: "error", message: "boom" },
		]);
		const entries = getEntries(profiler);
		const errorEntry = entries.find((e) => e.cat === "error");
		expect(errorEntry).toMatchObject({
			ph: "I",
			name: "error",
			data: { message: "boom" },
		});
	});
});

// ============================================================================
// Tool pairing (AC #3)
// ============================================================================

describe("chain-profiler: tool pairing", () => {
	test("paired tool_execution_start/end produce a ToolSpan with correct durationMs", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });

		// Manually inject chain start to initialize ts baseline
		profiler.handleEvent({ type: "chain_start", steps: [] });

		// Feed events and trust that durationMs = endTs - startTs
		profiler.handleEvent(
			toolStartEvent({ toolName: "Read", toolCallId: "call-abc" }),
		);
		profiler.handleEvent(
			toolEndEvent({ toolName: "Read", toolCallId: "call-abc" }),
		);

		const spans = getSpans(profiler);
		expect(spans).toHaveLength(1);
		expect(spans[0]?.toolName).toBe("Read");
		expect(spans[0]?.toolCallId).toBe("call-abc");
		expect(spans[0]?.role).toBe("worker");
		expect(spans[0]?.sessionId).toBe("sess-1");
		expect(spans[0]?.isError).toBe(false);
		const span0 = spans[0];
		expect(span0).toBeDefined();
		if (span0) expect(span0.durationMs).toBe(span0.endTs - span0.startTs);
	});

	test("durationMs equals endTs minus startTs", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });

		profiler.handleEvent(
			toolStartEvent({ toolName: "Bash", toolCallId: "c1" }),
		);
		profiler.handleEvent(toolEndEvent({ toolName: "Bash", toolCallId: "c1" }));

		const spans = getSpans(profiler);
		const s0 = spans[0];
		expect(s0).toBeDefined();
		if (s0) expect(s0.durationMs).toBe(s0.endTs - s0.startTs);
	});

	test("multiple tools are paired independently", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });

		const toolIds = ["call-1", "call-2", "call-3"];
		for (const id of toolIds) {
			profiler.handleEvent(
				toolStartEvent({ toolName: "Read", toolCallId: id }),
			);
		}
		for (const id of toolIds) {
			profiler.handleEvent(toolEndEvent({ toolName: "Read", toolCallId: id }));
		}

		const spans = getSpans(profiler);
		expect(spans).toHaveLength(3);
		for (const span of spans) {
			expect(span.durationMs).toBe(span.endTs - span.startTs);
		}
	});
});

// ============================================================================
// Orphaned tools (AC #4)
// ============================================================================

describe("chain-profiler: orphaned tool calls", () => {
	test("tool_execution_start without matching end remains in pendingTools", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });

		profiler.handleEvent(
			toolStartEvent({
				sessionId: "sess-x",
				toolName: "Bash",
				toolCallId: "orphan-1",
			}),
		);

		const pending = getPendingTools(profiler);
		expect(pending.size).toBe(1);
		expect(pending.has("orphan-1")).toBe(true);
	});

	test("orphaned tools appear in buildSummary output", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });
		profiler.handleEvent(
			toolStartEvent({
				sessionId: "sess-x",
				toolName: "Write",
				toolCallId: "orphan-2",
			}),
		);

		const summary = buildProfilerSummary(profiler);
		expect(summary).toContain("orphan-2");
		expect(summary).toContain("Write");
	});

	test("completed tool calls do not remain in pendingTools", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		profiler.handleEvent({ type: "chain_start", steps: [] });
		profiler.handleEvent(
			toolStartEvent({ toolName: "Read", toolCallId: "done-1" }),
		);
		profiler.handleEvent(
			toolEndEvent({ toolName: "Read", toolCallId: "done-1" }),
		);

		const pending = getPendingTools(profiler);
		expect(pending.size).toBe(0);
	});
});

// ============================================================================
// Parallel scope disambiguation (AC #5)
// ============================================================================

describe("chain-profiler: parallel fan-out scope tags", () => {
	test("parallel members with same role get sequential scope tags", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		startParallelGroup(
			profiler,
			["reviewer", "reviewer", "reviewer"],
			[
				{ role: "reviewer", sessionId: "sess-r0" },
				{ role: "reviewer", sessionId: "sess-r1" },
				{ role: "reviewer", sessionId: "sess-r2" },
			],
			{ end: true },
		);

		expectSpawnedScopes(profiler, ["reviewer.0", "reviewer.1", "reviewer.2"]);
	});

	test("different roles in a group each get their own indexing", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		startParallelGroup(
			profiler,
			["reviewer", "fixer"],
			[
				{ role: "reviewer", sessionId: "sess-r0" },
				{ role: "fixer", sessionId: "sess-f0" },
			],
			{ end: true },
		);

		expectSpawnedScopes(profiler, ["reviewer.0", "fixer.0"]);
	});

	test("agent_spawned outside parallel group has no scope", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		const stage = makeStage("coordinator");

		feed(profiler, [
			{ type: "chain_start", steps: [stage] },
			{ type: "agent_spawned", role: "coordinator", sessionId: "sess-c1" },
		]);

		const spawned = getEntries(profiler).find(
			(e) => e.name === "agent_spawned",
		);
		expect(spawned?.scope).toBeUndefined();
	});

	test("parallel fan-out with two reviewers produces reviewer.0 and reviewer.1 in trace and summary", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		startParallelGroup(
			profiler,
			["reviewer", "reviewer"],
			[
				{ role: "reviewer", sessionId: "sess-r0" },
				{ role: "reviewer", sessionId: "sess-r1" },
			],
			{ end: true },
		);

		expectSpawnedScopes(profiler, ["reviewer.0", "reviewer.1"]);

		const summary = buildProfilerSummary(profiler);
		expect(summary).toContain("reviewer.0");
		expect(summary).toContain("reviewer.1");
		expect(summary).toContain("Parallel Group Breakdown");
	});

	test("tool events from parallel same-role sessions carry distinct scope tags", () => {
		const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
		startParallelGroup(
			profiler,
			["reviewer", "reviewer"],
			[{ role: "reviewer", sessionId: "sess-r0" }],
		);

		feed(profiler, [
			toolStartEvent({
				role: "reviewer",
				sessionId: "sess-r0",
				toolName: "Read",
				toolCallId: "t0",
			}),
			{ type: "agent_spawned", role: "reviewer", sessionId: "sess-r1" },
			toolStartEvent({
				role: "reviewer",
				sessionId: "sess-r1",
				toolName: "Read",
				toolCallId: "t1",
			}),
		]);

		const toolBegins = getEntries(profiler).filter(
			(e) => e.cat === "tool" && e.ph === "B",
		);
		expect(toolBegins).toHaveLength(2);
		expect(toolBegins[0]?.scope).toBe("reviewer.0");
		expect(toolBegins[1]?.scope).toBe("reviewer.1");
	});

	test("parallel summary reports member durations from real execution windows", () => {
		const originalNow = Date.now;
		let now = new Date("2026-01-01T00:00:00.000Z").getTime();
		Date.now = () => now;
		try {
			const profiler = new ChainProfiler({ outputDir: "/tmp/test" });
			const step = startParallelGroup(
				profiler,
				["reviewer", "reviewer"],
				[{ role: "reviewer", sessionId: "sess-r0" }],
			);
			now += 100;
			profiler.handleEvent({
				type: "agent_spawned",
				role: "reviewer",
				sessionId: "sess-r1",
			});
			now += 200;
			profiler.handleEvent({
				type: "agent_completed",
				role: "reviewer",
				sessionId: "sess-r0",
			});
			now += 100;
			feed(profiler, [
				{ type: "agent_completed", role: "reviewer", sessionId: "sess-r1" },
				{
					type: "parallel_end",
					step,
					stepIndex: 0,
					results: [],
					success: true,
				},
			]);

			const summary = buildProfilerSummary(profiler);

			expect(summary).toContain("reviewer.0: 300ms");
			expect(summary).toContain("reviewer.1: 300ms");
			expect(summary).toContain(
				"Overlap ratio (sum-of-members / group wall-clock): 1.50x",
			);
		} finally {
			Date.now = originalNow;
		}
	});
});

// ============================================================================
// writeOutput (AC #6)
// ============================================================================

describe("chain-profiler: writeOutput", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "chain-profiler-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("writeOutput creates both trace.jsonl and summary.txt files", async () => {
		const outputDir = join(tmpDir, "profiles");
		const { tracePath, summaryPath } = await writeStartedProfile(outputDir);

		expect(tracePath).toContain(".trace.jsonl");
		expect(summaryPath).toContain(".summary.txt");

		const traceContent = await readFile(tracePath, "utf8");
		const summaryContent = await readFile(summaryPath, "utf8");

		expect(traceContent.length).toBeGreaterThan(0);
		expect(summaryContent.length).toBeGreaterThan(0);
	});

	test("writeOutput creates outputDir with mkdir recursive", async () => {
		const outputDir = join(tmpDir, "deep", "nested", "dir");
		await expect(writeStartedProfile(outputDir)).resolves.toMatchObject({
			tracePath: expect.any(String),
			summaryPath: expect.any(String),
		});
	});

	test("each trace line is valid JSON conforming to ProfileTraceEntry schema", async () => {
		const outputDir = join(tmpDir, "profiles");
		const profiler = new ChainProfiler({ outputDir });
		const stage = makeStage("worker");

		feed(profiler, [
			{ type: "chain_start", steps: [stage] },
			{ type: "stage_start", stage, stageIndex: 0 },
			{
				type: "stage_end",
				stage,
				result: { stage, success: true, iterations: 1, durationMs: 50 },
			},
		]);

		const { tracePath } = await profiler.writeOutput();
		const content = await readFile(tracePath, "utf8");
		const lines = content.trim().split("\n").filter(Boolean);

		for (const line of lines) {
			const entry = JSON.parse(line) as ProfileTraceEntry;
			expect(typeof entry.ts).toBe("number");
			expect(typeof entry.cat).toBe("string");
			expect(typeof entry.name).toBe("string");
			expect(["B", "E", "I"]).toContain(entry.ph);
		}
	});

	test("writeOutput returns correct paths and filename pattern", async () => {
		const outputDir = join(tmpDir, "profiles");
		const { tracePath, summaryPath } = await writeStartedProfile(outputDir);

		expect(tracePath).toMatch(/profile-\d{8}-\d{6}\.trace\.jsonl$/);
		expect(summaryPath).toMatch(/profile-\d{8}-\d{6}\.summary\.txt$/);
	});

	test("writeOutput is safe to call when chain was aborted (partial data)", async () => {
		const outputDir = join(tmpDir, "profiles");
		const profiler = new ChainProfiler({ outputDir });

		// Only chain_start, no chain_end — simulates abort
		profiler.handleEvent({ type: "chain_start", steps: [] });
		profiler.handleEvent({ type: "error", message: "aborted" });

		const { tracePath, summaryPath } = await profiler.writeOutput();
		const trace = await readFile(tracePath, "utf8");
		const summary = await readFile(summaryPath, "utf8");

		// Should still produce valid output
		expect(trace).toContain("chain_start");
		expect(summary).toContain("(chain did not complete)");
	});
});

// ============================================================================
// buildSummary content
// ============================================================================

describe("chain-profiler: buildSummary content sections", () => {
	test("includes all required sections", () => {
		const summary = buildSummary([], [], new Map());
		expect(summary).toContain("Chain Overview");
		expect(summary).toContain("Stage Breakdown");
		expect(summary).toContain("Slowest Tools");
		expect(summary).toContain("Per-Agent Tool Breakdown");
		expect(summary).toContain("Orphaned / Incomplete Tool Calls");
	});

	test("shows stage rows with stage names and computed durations", () => {
		const entries: ProfileTraceEntry[] = [
			{ ts: 0, cat: "chain", name: "chain_start", ph: "B" },
			{
				ts: 100,
				cat: "stage",
				name: "planner",
				ph: "B",
				data: { stageIndex: 0 },
			},
			{
				ts: 350,
				cat: "stage",
				name: "planner",
				ph: "E",
				data: { success: true, durationMs: 250 },
			},
			{
				ts: 400,
				cat: "stage",
				name: "worker",
				ph: "B",
				data: { stageIndex: 1 },
			},
			{
				ts: 1500,
				cat: "stage",
				name: "worker",
				ph: "E",
				data: { success: true, durationMs: 1100 },
			},
		];

		const summary = buildSummary(entries, [], new Map());

		expect(getSummarySection(summary, "=== Stage Breakdown ===")).toEqual([
			"  planner: 250ms",
			"  worker: 1.10s",
		]);
	});

	test("shows no-stage placeholder when no stage entries exist", () => {
		const summary = buildSummary([], [], new Map());

		expect(getSummarySection(summary, "=== Stage Breakdown ===")).toEqual([
			"  (no stages recorded)",
		]);
	});

	test("shows total wall-clock when chain_end is present", () => {
		const entries: ProfileTraceEntry[] = [
			{ ts: 0, cat: "chain", name: "chain_start", ph: "B" },
			{ ts: 5000, cat: "chain", name: "chain_end", ph: "E" },
		];
		const summary = buildSummary(entries, [], new Map());
		expect(summary).toContain("5.00s");
	});

	test("shows incomplete message when chain_end missing", () => {
		const entries: ProfileTraceEntry[] = [
			{ ts: 0, cat: "chain", name: "chain_start", ph: "B" },
		];
		const summary = buildSummary(entries, [], new Map());
		expect(summary).toContain("(chain did not complete)");
	});

	test("shows top 20 slowest tools sorted by durationMs", () => {
		const spans: ToolSpan[] = Array.from({ length: 25 }, (_, i) => ({
			toolName: `Tool${i}`,
			toolCallId: `c${i}`,
			role: "worker",
			sessionId: "sess-1",
			startTs: 0,
			endTs: i * 100,
			durationMs: i * 100,
			isError: false,
		}));

		const summary = buildSummary([], spans, new Map());
		// Top tool should be Tool24 (2400ms)
		expect(summary).toContain("Tool24");
		// Tool0 (0ms) should NOT appear — only top 20
		expect(summary).not.toContain("Tool0");
		expect(summary).not.toContain("Tool4");
	});

	test("marks errored tool spans in slowest tools", () => {
		const spans: ToolSpan[] = [
			{
				toolName: "Read",
				toolCallId: "c1",
				role: "worker",
				sessionId: "sess-1",
				startTs: 0,
				endTs: 100,
				durationMs: 100,
				isError: false,
			},
			{
				toolName: "Bash",
				toolCallId: "c2",
				role: "worker",
				sessionId: "sess-1",
				startTs: 0,
				endTs: 250,
				durationMs: 250,
				isError: true,
			},
		];

		const summary = buildSummary([], spans, new Map());

		expect(
			getSummarySection(summary, "=== Slowest Tools (top 20) ==="),
		).toEqual([
			"  Bash [error]  250ms  (worker, sess-1)",
			"  Read  100ms  (worker, sess-1)",
		]);
	});

	test("shows empty tool placeholders in slowest and per-agent sections", () => {
		const summary = buildSummary([], [], new Map());

		expect(
			getSummarySection(summary, "=== Slowest Tools (top 20) ==="),
		).toEqual(["  (no tool calls recorded)"]);
		expect(
			getSummarySection(summary, "=== Per-Agent Tool Breakdown ==="),
		).toEqual(["  (no tool calls recorded)"]);
	});

	test("orphaned tools section lists incomplete calls", () => {
		const pending = new Map([
			[
				"call-orphan",
				{ startTs: 500, toolName: "Bash", role: "worker", sessionId: "sess-1" },
			],
		]);
		const summary = buildSummary([], [], pending);
		expect(summary).toContain("call-orphan");
		expect(summary).toContain("Bash");
	});

	test("pending tool lines include call id, role, session id, and start timestamp", () => {
		const pending = new Map([
			[
				"call-pending",
				{
					startTs: 750,
					toolName: "Write",
					role: "coordinator",
					sessionId: "sess-c1",
				},
			],
		]);

		const summary = buildSummary([], [], pending);

		expect(
			getSummarySection(summary, "=== Orphaned / Incomplete Tool Calls ==="),
		).toEqual([
			"  Write  callId=call-pending  role=coordinator  sessionId=sess-c1  startTs=750ms",
		]);
	});

	test("per-agent breakdown aggregates by role", () => {
		const spans: ToolSpan[] = [
			{
				toolName: "Read",
				toolCallId: "c1",
				role: "worker",
				sessionId: "s1",
				startTs: 0,
				endTs: 100,
				durationMs: 100,
				isError: false,
			},
			{
				toolName: "Write",
				toolCallId: "c2",
				role: "worker",
				sessionId: "s1",
				startTs: 100,
				endTs: 300,
				durationMs: 200,
				isError: false,
			},
			{
				toolName: "Read",
				toolCallId: "c3",
				role: "coordinator",
				sessionId: "s2",
				startTs: 0,
				endTs: 50,
				durationMs: 50,
				isError: false,
			},
		];
		const summary = buildSummary([], spans, new Map());
		expect(summary).toContain("worker");
		expect(summary).toContain("coordinator");
		expect(summary).toContain("2 calls");
		expect(summary).toContain("1 calls");
	});
});

// ============================================================================
// Import constraint verification (AC #7)
// ============================================================================

describe("chain-profiler: import constraints", () => {
	test("module only imports from lib/orchestration/types.ts and node:*", async () => {
		// Read the source file and verify no forbidden imports
		const src = await readFile(
			new URL("../../lib/orchestration/chain-profiler.ts", import.meta.url),
			"utf8",
		);
		const importLines = src.split("\n").filter((l) => l.startsWith("import"));

		const forbidden = [
			"chain-runner",
			"session-store",
			"agent-spawner",
			"cli/",
			"cli\\",
		];
		for (const line of importLines) {
			for (const f of forbidden) {
				expect(line).not.toContain(f);
			}
		}
	});
});
