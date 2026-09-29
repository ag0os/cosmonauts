import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("task-notes-");
const run = promisify(execFile);

async function fixture(notes = "## Implementation Notes\r\n\r\nOld  \r\n\r\n") {
	const manager = new TaskManager(tmp.path);
	const task = await manager.createTask({
		title: "Original",
		acceptanceCriteria: ["done"],
	});
	const file = join(tmp.path, "missions", "tasks", `${task.id} - Original.md`);
	const original = await readFile(file, "utf8");
	await writeFile(file, `${original.trimEnd()}\r\n\r\n${notes}`);
	return { manager, task, file, notes };
}

describe("source-preserving task edits", () => {
	it("preserves the complete raw CRLF notes section on status, criterion and title edits", async () => {
		const { manager, task, notes } = await fixture();
		await manager.updateTask(task.id, { status: "In Progress" });
		expect(
			await readFile(
				join(tmp.path, "missions", "tasks", `${task.id} - Original.md`),
				"utf8",
			),
		).toContain(notes);
		const current = await manager.getTask(task.id);
		await manager.updateTask(task.id, {
			acceptanceCriteria: (current?.acceptanceCriteria ?? []).map((ac) => ({
				...ac,
				checked: true,
			})),
		});
		expect(
			await readFile(
				join(tmp.path, "missions", "tasks", `${task.id} - Original.md`),
				"utf8",
			),
		).toContain(notes);
		await manager.updateTask(task.id, { title: "Renamed" });
		expect(
			await readFile(
				join(tmp.path, "missions", "tasks", `${task.id} - Renamed.md`),
				"utf8",
			),
		).toContain(notes);
		expect(await readdir(join(tmp.path, "missions", "tasks"))).toEqual([
			`${task.id} - Renamed.md`,
		]);
	});
	it("appends once in the original line ending style without changing prior notes", async () => {
		const { manager, task, file, notes } = await fixture();
		await manager.updateTask(task.id, {
			appendImplementationNotes:
				"### Drive — outcome failure — attempt 1\n\nReason",
		});
		const first = await readFile(file, "utf8");
		expect(first).toContain(
			`${notes}### Drive — outcome failure — attempt 1\r\n\r\nReason`,
		);
		await manager.updateTask(task.id, {
			appendImplementationNotes:
				"### Drive — outcome failure — attempt 1\n\nReason",
		});
		expect(await readFile(file, "utf8")).toBe(first);
	});
	it("inserts into an empty section or a missing section and rejects duplicates", async () => {
		const { manager, task, file } = await fixture(
			"## Implementation Notes\r\n\r\n",
		);
		await manager.updateTask(task.id, { appendImplementationNotes: "First" });
		expect(await readFile(file, "utf8")).toContain(
			"## Implementation Notes\r\n\r\nFirst",
		);
		await writeFile(
			file,
			(await readFile(file, "utf8")).split("## Implementation Notes")[0] ?? "",
		);
		await manager.updateTask(task.id, { appendImplementationNotes: "Second" });
		expect(await readFile(file, "utf8")).toContain(
			"## Implementation Notes\n\nSecond",
		);
		await writeFile(
			file,
			`${await readFile(file, "utf8")}\n## Implementation Notes\nDuplicate`,
		);
		const before = await readFile(file, "utf8");
		await expect(
			manager.updateTask(task.id, { status: "Done" }),
		).rejects.toThrow(/Duplicate/);
		expect(await readFile(file, "utf8")).toBe(before);
	});
	it("rejects both note modes and an empty append without changing the file; replace remains compatible", async () => {
		const { manager, task, file } = await fixture();
		const before = await readFile(file, "utf8");
		await expect(
			manager.updateTask(task.id, {
				implementationNotes: "replace",
				appendImplementationNotes: "append",
			} as never),
		).rejects.toThrow(/replace and append/);
		await expect(
			manager.updateTask(task.id, { appendImplementationNotes: "  " }),
		).rejects.toThrow(/empty/);
		expect(await readFile(file, "utf8")).toBe(before);
		await manager.updateTask(task.id, { implementationNotes: "Replacement" });
		expect(await readFile(file, "utf8")).toContain(
			"## Implementation Notes\n\nReplacement",
		);
		expect(await readFile(file, "utf8")).not.toContain("Old  ");
	});
	it("does not mistake a partial line for an already appended block", async () => {
		const { manager, task, file } = await fixture(
			"## Implementation Notes\n\nabc\n",
		);
		await manager.updateTask(task.id, { appendImplementationNotes: "ab" });
		expect(await readFile(file, "utf8")).toContain("abc\n\nab");
	});
	it("keeps simultaneous separate-process appends", async () => {
		const { file } = await fixture();
		const modulePath = new URL(
			"../../lib/tasks/task-manager.ts",
			import.meta.url,
		).pathname;
		const script = `import {TaskManager} from ${JSON.stringify(modulePath)}; await new TaskManager(process.argv[1]).updateTask("TASK-001", {appendImplementationNotes: process.argv[2]});`;
		await Promise.all(
			["### Drive — first\n\nA", "### Drive — second\n\nB"].map((text) =>
				run("bun", ["-e", script, tmp.path, text]),
			),
		);
		const content = await readFile(file, "utf8");
		expect(content).toContain("Old  \r\n\r\n");
		expect(content).toContain("### Drive — first\r\n\r\nA");
		expect(content).toContain("### Drive — second\r\n\r\nB");
	});
});
