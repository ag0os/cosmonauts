import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { parseTask } from "../../lib/tasks/task-parser.ts";
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
	it("preserves a three-space-indented notes heading read by the parser on a status update", async () => {
		const notes = "   ## Implementation Notes  \r\nKEEP THIS  \r\n";
		const { manager, task, file } = await fixture(notes);
		expect(parseTask(await readFile(file, "utf8")).implementationNotes).toBe(
			"KEEP THIS",
		);
		await manager.updateTask(task.id, { status: "In Progress" });
		expect(await readFile(file, "utf8")).toContain(notes);
	});
	it("keeps indented notes separate from an earlier description", async () => {
		const notes = "   ## Implementation Notes  \r\nKEEP THIS  \r\n";
		const { manager, task, file } = await fixture(notes);
		await writeFile(
			file,
			(await readFile(file, "utf8")).replace(
				notes,
				`## Description\n\nDescription\n\n${notes}`,
			),
		);
		await manager.updateTask(task.id, { status: "In Progress" });
		const updated = await readFile(file, "utf8");
		expect(updated).toContain(notes);
		expect(updated.split("KEEP THIS")).toHaveLength(2);
	});
	it("keeps description text after an indented heading across a status update", async () => {
		// TASK-811 P1 / review F1 / INV-001
		const manager = new TaskManager(tmp.path);
		const task = await manager.createTask({
			title: "Indented",
			description:
				"Intro line\n\n1. Step one\n   ## Sub heading in list\n   KEEP-ME detail line\n\nTrailing paragraph KEEP-TOO",
		});
		const file = join(
			tmp.path,
			"missions",
			"tasks",
			`${task.id} - Indented.md`,
		);
		const before = parseTask(await readFile(file, "utf8"));
		await manager.updateTask(task.id, { status: "In Progress" });
		const updated = await readFile(file, "utf8");
		const after = parseTask(updated);
		expect(updated).toContain("   KEEP-ME detail line");
		expect(updated).toContain("Trailing paragraph KEEP-TOO");
		expect(after.description).toBe(before.description);
		expect(after.rawContent).toBe(before.rawContent);
	});
	it("ends an appended notes section with a blank line before a following section", async () => {
		// TASK-811 P2 / review F2: an append must not glue onto the next heading.
		const { manager, task, file } = await fixture(
			"## Implementation Notes\n\nOld\n\n## Other\nkept\n",
		);
		await manager.updateTask(task.id, { appendImplementationNotes: "New" });
		const updated = await readFile(file, "utf8");
		expect(updated).toContain("Old\n\nNew\n\n## Other\nkept");
		const parsed = parseTask(updated);
		expect(parsed.implementationNotes).toBe("Old\n\nNew");
		expect(parsed.rawContent).toBe("## Other\nkept");
	});
	it("does not read or edit a four-space-indented code heading as notes", async () => {
		const { manager, task, file } = await fixture(
			"    ## Implementation Notes\nKEEP THIS\n",
		);
		expect(
			parseTask(await readFile(file, "utf8")).implementationNotes,
		).toBeUndefined();
		await manager.updateTask(task.id, {
			appendImplementationNotes: "Real note",
		});
		const updated = await readFile(file, "utf8");
		expect(updated).toContain("    ## Implementation Notes\nKEEP THIS");
		expect(updated).toContain("## Implementation Notes\n\nReal note");
	});
	it("preserves lower-case implementation notes byte for byte on status-only update", async () => {
		const notes = "## implementation notes  \r\n\r\nKEEP THIS  \r\n";
		const { manager, task, file } = await fixture(notes);
		await manager.updateTask(task.id, { status: "In Progress" });
		expect(await readFile(file, "utf8")).toContain(notes);
	});
	it("rejects duplicate headings regardless of case", async () => {
		const { manager, task, file } = await fixture(
			"## implementation notes\nKEEP THIS\n## Implementation Notes\nagain\n",
		);
		const before = await readFile(file, "utf8");
		await expect(
			manager.updateTask(task.id, { status: "Done" }),
		).rejects.toThrow(/Duplicate/);
		expect(await readFile(file, "utf8")).toBe(before);
	});
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
