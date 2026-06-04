import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import "./orchestration-mocks.ts";

import orchestrationExtension from "../../domains/shared/extensions/orchestration/index.ts";
import {
	FileRunStore,
	type RunStatusSummary,
	type RunWatchSummary,
	runStatus,
	runWatch,
} from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const temp = useTempDir("orchestration-run-control-");

interface ToolResult<T> {
	content: { type: "text"; text: string }[];
	details: T;
}

type FilesystemSnapshot = Record<
	string,
	| { kind: "directory" }
	| { kind: "file"; content: string; mtimeMs: number; size: number }
>;

describe("orchestration run control tools", () => {
	// @cosmo-behavior plan:durable-run-store-events#B-014
	test("registers only read-only normalized run observation tools", async () => {
		const rootDir = join(temp.path, "missions", "sessions");
		const store = new FileRunStore({ rootDir });
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-observe",
			status: "running",
			eventsPath: "orchestration-events.jsonl",
		});
		await store.appendEvent(ref(record), {
			type: "run_started",
			runId: record.runId,
		});
		await store.appendEvent(ref(record), {
			type: "step_output",
			runId: record.runId,
			stepId: "TASK-1",
			chunk: "worker output",
		});
		await store.appendEvent(ref(record), {
			type: "run_completed",
			runId: record.runId,
			result: { outcome: "completed" },
		});
		const diagnosticsOnly = await store.createRun({
			scope: "plan-a",
			runId: "run-diagnostics-only",
			eventsPath: "orchestration-events.jsonl",
		});
		await store.appendDiagnostic(ref(diagnosticsOnly), {
			code: "malformed_event_json",
			message: "Normalized event line is not valid JSON.",
		});

		const directStatus = await runStatus(store, ref(record));
		const directWatch = await runWatch(store, ref(record), {
			sinceSeq: 1,
			limit: 2,
		});
		const before = await snapshotFilesystem(rootDir);

		const pi = createMockPi(temp.path);
		orchestrationExtension(pi as never);

		expect(pi.getTool("run_status")).toBeDefined();
		expect(pi.getTool("run_watch")).toBeDefined();
		for (const mutatingTool of [
			"run_pause",
			"run_resume",
			"run_cancel",
			"run_intervene",
		]) {
			expect(pi.getTool(mutatingTool)).toBeUndefined();
		}

		const status = (await pi.callTool("run_status", {
			scope: record.scope,
			runId: record.runId,
		})) as ToolResult<RunStatusSummary | undefined>;
		const watch = (await pi.callTool("run_watch", {
			scope: record.scope,
			runId: record.runId,
			sinceSeq: 1,
			limit: 2,
		})) as ToolResult<RunWatchSummary>;
		const diagnosticsWatch = (await pi.callTool("run_watch", {
			scope: diagnosticsOnly.scope,
			runId: diagnosticsOnly.runId,
		})) as ToolResult<RunWatchSummary>;
		const missingWatch = (await pi.callTool("run_watch", {
			scope: "plan-a",
			runId: "missing-run",
		})) as ToolResult<RunWatchSummary>;

		expect(status.details).toEqual(directStatus);
		expect(status.content[0]?.text).toContain("run-observe: completed");
		expect(watch.details).toEqual(directWatch);
		expect(watch.content[0]?.text).toContain(
			"2 step_output TASK-1: worker output",
		);
		expect(watch.content[0]?.text).toContain("cursor 3");
		expect(diagnosticsWatch.details.events).toEqual([]);
		expect(diagnosticsWatch.content[0]?.text).toContain(
			"No new normalized run events; cursor 0; diagnostics 1",
		);
		expect(missingWatch.details).toMatchObject({
			found: false,
			events: [],
			diagnostics: [{ code: "run_not_found" }],
		});
		expect(missingWatch.content[0]?.text).toContain(
			"plan-a/missing-run: not found; no normalized run events",
		);
		await expect(snapshotFilesystem(rootDir)).resolves.toEqual(before);
	});
});

function ref(record: { scope: string; runId: string }) {
	return { scope: record.scope, runId: record.runId };
}

async function snapshotFilesystem(root: string): Promise<FilesystemSnapshot> {
	const entries: FilesystemSnapshot = {};

	async function visit(path: string, relativePath: string): Promise<void> {
		const stats = await stat(path);
		if (stats.isDirectory()) {
			if (relativePath !== "") {
				entries[relativePath] = { kind: "directory" };
			}
			const children = await readdir(path, { withFileTypes: true });
			for (const child of children) {
				await visit(
					join(path, child.name),
					relativePath === "" ? child.name : join(relativePath, child.name),
				);
			}
			return;
		}

		entries[relativePath] = {
			kind: "file",
			content: await readFile(path, "utf-8"),
			mtimeMs: stats.mtimeMs,
			size: stats.size,
		};
	}

	await visit(root, "");
	return entries;
}
