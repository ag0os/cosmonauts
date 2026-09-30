import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendDriveAttemptRecord } from "../../lib/driver/runtime-helpers.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { sectionHeadings } from "../../lib/tasks/task-note-editor.ts";
import { parseTask } from "../../lib/tasks/task-parser.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("drive-attempt-record-");

async function taskWithNotes() {
	const taskManager = new TaskManager(tmp.path);
	const task = await taskManager.createTask({ title: "Record" });
	await taskManager.updateTask(task.id, {
		implementationNotes: "worker sentinel",
	});
	const file = join(tmp.path, "missions", "tasks", `${task.id} - Record.md`);
	return { taskManager, taskId: task.id, file };
}

function record(
	options: Awaited<ReturnType<typeof taskWithNotes>>,
	attemptNumber: number,
	body: string,
) {
	return appendDriveAttemptRecord({
		taskManager: options.taskManager,
		taskId: options.taskId,
		runId: "run-811",
		outcome: "unknown",
		attemptNumber,
		body,
	});
}

// TASK-811 P2 / review F2 / AC-004 / INV-001: raw worker text stays verbatim and inert.
describe("appendDriveAttemptRecord", () => {
	it("records raw text containing a notes heading verbatim", async () => {
		const fixture = await taskWithNotes();
		const raw =
			"Done.\n\n## Implementation Notes\nI changed the parser.\n```ts\ncode\n```";
		await record(fixture, 1, raw);
		const task = parseTask(await readFile(fixture.file, "utf8"));
		expect(task.implementationNotes).toContain("worker sentinel");
		expect(task.implementationNotes).toContain(raw);
		expect(task.rawContent).toBeUndefined();
	});

	it("keeps later records and headings intact after raw text with a section heading", async () => {
		const fixture = await taskWithNotes();
		const raw =
			"Worker final text\n\n## Summary\nDid the thing\n\n## Tests\nall green";
		await record(fixture, 1, raw);
		await record(fixture, 2, "second attempt record");
		const content = await readFile(fixture.file, "utf8");
		const task = parseTask(content);
		expect(task.implementationNotes).toContain(raw);
		expect(task.implementationNotes).toContain("second attempt record");
		expect(
			task.implementationNotes?.match(/### Drive — outcome /g),
		).toHaveLength(2);
		expect(task.rawContent).toBeUndefined();
		expect(content).not.toMatch(/record(?:\n```)?## /);
	});

	it("records a blocked reason verbatim after worker notes that end inside an open fence", async () => {
		// TASK-812 Q2 / review R2-2 / AC-004 / INV-002
		const fixture = await taskWithNotes();
		await fixture.taskManager.updateTask(fixture.taskId, {
			appendImplementationNotes: "see:\n```ts\nfoo()",
		});
		const reason =
			"Blocked because:\n```\n## Implementation Notes\nreason text";
		await appendDriveAttemptRecord({
			taskManager: fixture.taskManager,
			taskId: fixture.taskId,
			runId: "run-812",
			outcome: "blocked",
			attemptNumber: 1,
			body: reason,
		});
		const content = await readFile(fixture.file, "utf8");
		const notesHeadings = sectionHeadings(content).filter(
			(heading) =>
				heading.title.trim().toLowerCase() === "implementation notes",
		);
		expect(notesHeadings).toHaveLength(1);
		expect(parseTask(content).implementationNotes).toContain(reason);
	});
});
