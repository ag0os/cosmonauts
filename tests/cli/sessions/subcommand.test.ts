import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above all imports, so we declare the mock functions
// inside vi.hoisted to make them available to the factory.
const { mockList, mockListAll } = vi.hoisted(() => ({
	mockList: vi.fn(),
	mockListAll: vi.fn(),
}));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		SessionManager: {
			...actual.SessionManager,
			list: mockList,
			listAll: mockListAll,
		},
	};
});

import {
	collectProjectSessions,
	createSessionsProgram,
	findSessionMatches,
	renderSessionInfo,
	renderSessionsList,
	type SessionInfoOutput,
	type SessionListItem,
	sessionInfoToListItem,
	sortByModifiedDesc,
} from "../../../cli/sessions/subcommand.ts";
import {
	type CommandTestContext,
	createCommandTestContext,
	ProcessExitError,
} from "../../helpers/cli.ts";

function row(overrides: Partial<SessionListItem> = {}): SessionListItem {
	return {
		id: "019e1a02-47ab-702b-affa-3dab3ed4ec03",
		agent: "coding",
		cwd: "/Users/x/proj",
		path: "/abs/sessions/coding/2026-05-12T02-26-57Z_019e1a02.jsonl",
		name: null,
		created: "2026-05-12T02:26:57.579Z",
		modified: "2026-05-12T14:49:53.208Z",
		messageCount: 244,
		firstMessage: "Hello world",
		parentSessionPath: null,
		...overrides,
	};
}

describe("sessionInfoToListItem", () => {
	it("converts Pi SessionInfo into our flat shape with ISO timestamps", () => {
		const item = sessionInfoToListItem(
			{
				id: "abc",
				path: "/p",
				cwd: "/c",
				name: "named",
				parentSessionPath: "/parent.jsonl",
				created: new Date("2026-01-01T00:00:00Z"),
				modified: new Date("2026-01-02T00:00:00Z"),
				messageCount: 5,
				firstMessage: "hi",
				allMessagesText: "hi there",
			},
			"cosmo",
		);

		expect(item).toEqual({
			id: "abc",
			agent: "cosmo",
			cwd: "/c",
			path: "/p",
			name: "named",
			created: "2026-01-01T00:00:00.000Z",
			modified: "2026-01-02T00:00:00.000Z",
			messageCount: 5,
			firstMessage: "hi",
			parentSessionPath: "/parent.jsonl",
		});
	});

	it("normalizes missing name and parent to explicit null", () => {
		const item = sessionInfoToListItem(
			{
				id: "x",
				path: "/p",
				cwd: "/c",
				created: new Date(0),
				modified: new Date(0),
				messageCount: 0,
				firstMessage: "",
				allMessagesText: "",
			},
			null,
		);

		expect(item.name).toBeNull();
		expect(item.parentSessionPath).toBeNull();
		expect(item.agent).toBeNull();
	});
});

describe("sortByModifiedDesc", () => {
	it("orders rows from most-recently-modified to least", () => {
		const a = row({ id: "a", modified: "2026-01-01T00:00:00.000Z" });
		const b = row({ id: "b", modified: "2026-05-01T00:00:00.000Z" });
		const c = row({ id: "c", modified: "2026-03-01T00:00:00.000Z" });

		expect(sortByModifiedDesc([a, b, c]).map((r) => r.id)).toEqual([
			"b",
			"c",
			"a",
		]);
	});

	it("does not mutate its input", () => {
		const a = row({ id: "a", modified: "2026-01-01T00:00:00.000Z" });
		const b = row({ id: "b", modified: "2026-05-01T00:00:00.000Z" });
		const input = [a, b];
		sortByModifiedDesc(input);
		expect(input).toEqual([a, b]);
	});
});

describe("findSessionMatches", () => {
	const rows = [
		row({ id: "019e1a02-47ab-702b-affa-3dab3ed4ec03", path: "/a.jsonl" }),
		row({ id: "019e1a01-6a9f-70dc-9373-b2d611acec25", path: "/b.jsonl" }),
		row({ id: "019e199a-fa6f-713d-a4e7-e901a19e536b", path: "/c.jsonl" }),
	];

	it("matches a unique 8-char id prefix", () => {
		const matches = findSessionMatches(rows, "019e1a02");
		expect(matches.map((m) => m.path)).toEqual(["/a.jsonl"]);
	});

	it("returns multiple matches when the prefix is ambiguous", () => {
		const matches = findSessionMatches(rows, "019e1a");
		expect(matches.map((m) => m.path)).toEqual(["/a.jsonl", "/b.jsonl"]);
	});

	it("rejects prefixes shorter than 4 chars to avoid accidental matches", () => {
		expect(findSessionMatches(rows, "019")).toEqual([]);
	});

	it("matches by full .jsonl path", () => {
		const matches = findSessionMatches(rows, "/b.jsonl");
		expect(matches.map((m) => m.path)).toEqual(["/b.jsonl"]);
	});

	it("returns no matches for a path-shaped string that doesn't exist", () => {
		expect(findSessionMatches(rows, "/missing.jsonl")).toEqual([]);
	});
});

describe("renderSessionsList", () => {
	const rows = [
		row({ id: "019e1a02-47ab-702b-affa-3dab3ed4ec03", agent: "coding" }),
		row({
			id: "019e199a-fa6f-713d-a4e7-e901a19e536b",
			agent: "planner",
			modified: "2026-05-11T00:00:00.000Z",
			messageCount: 83,
			firstMessage: "Implement the\napproved plan",
		}),
	];

	it("JSON mode emits the structured rows verbatim", () => {
		expect(renderSessionsList(rows, "json")).toEqual({
			kind: "json",
			value: rows,
		});
	});

	it("plain mode emits tab-separated id, agent, modified, msgCount, firstMessage", () => {
		const rendered = renderSessionsList(rows, "plain");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines[0]).toBe(
				"019e1a02-47ab-702b-affa-3dab3ed4ec03\tcoding\t2026-05-12T14:49:53.208Z\t244\tHello world",
			);
			expect(rendered.lines[1]).toBe(
				"019e199a-fa6f-713d-a4e7-e901a19e536b\tplanner\t2026-05-11T00:00:00.000Z\t83\tImplement the approved plan",
			);
		}
	});

	it("plain mode collapses newlines and caps firstMessage at 80 chars", () => {
		const longRow = row({
			id: "019e1a01-6a9f-70dc-9373-b2d611acec25",
			firstMessage: "a".repeat(200),
		});
		const rendered = renderSessionsList([longRow], "plain");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			const parts = rendered.lines[0]?.split("\t") ?? [];
			expect(parts[4]?.length).toBe(80);
		}
	});

	it("human mode emits header, separator, and short id column", () => {
		const rendered = renderSessionsList(rows, "human");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines[0]).toMatch(
				/^ID\s+AGENT\s+MODIFIED\s+MSGS\s+FIRST MESSAGE$/,
			);
			expect(rendered.lines[1]).toMatch(/^-+\s+-+\s+-+\s+----\s+-+$/);
			// 8-char short id, agent shown verbatim, message count right-padded
			expect(rendered.lines[2]).toContain("019e1a02");
			expect(rendered.lines[2]).toContain("coding");
		}
	});

	it("human mode emits 'No sessions found.' on empty input", () => {
		expect(renderSessionsList([], "human")).toEqual({
			kind: "lines",
			lines: ["No sessions found."],
		});
	});

	it("JSON mode on empty input emits an empty array", () => {
		expect(renderSessionsList([], "json")).toEqual({
			kind: "json",
			value: [],
		});
	});
});

describe("renderSessionInfo", () => {
	const sample: SessionInfoOutput = row({
		name: "auth flow",
		parentSessionPath: "/abs/coding/parent.jsonl",
	});

	it("JSON mode emits the structured payload verbatim", () => {
		expect(renderSessionInfo(sample, "json")).toEqual({
			kind: "json",
			value: sample,
		});
	});

	it("plain mode emits one key/value pair per line", () => {
		const rendered = renderSessionInfo(sample, "plain");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines).toContain(`id\t${sample.id}`);
			expect(rendered.lines).toContain(`agent\t${sample.agent}`);
			expect(rendered.lines).toContain(`path\t${sample.path}`);
			expect(rendered.lines).toContain(`name\t${sample.name}`);
			expect(rendered.lines).toContain(`parent\t${sample.parentSessionPath}`);
		}
	});

	it("plain mode omits the text row when allMessagesText is undefined", () => {
		const rendered = renderSessionInfo(sample, "plain");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines.some((line) => line.startsWith("text\t"))).toBe(
				false,
			);
		}
	});

	it("plain mode emits the text row when allMessagesText is provided", () => {
		const rendered = renderSessionInfo(
			{ ...sample, allMessagesText: "transcript body" },
			"plain",
		);
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines).toContain("text\ttranscript body");
		}
	});

	it("human mode renders an indented summary block", () => {
		const rendered = renderSessionInfo(sample, "human");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines[0]).toBe(`Session ${sample.id}`);
			expect(rendered.lines).toContain(`  agent:    ${sample.agent}`);
			expect(rendered.lines).toContain(`  name:     ${sample.name}`);
			expect(rendered.lines).toContain(
				`  parent:   ${sample.parentSessionPath}`,
			);
		}
	});

	it("human mode appends transcript block when --include-text was set", () => {
		const rendered = renderSessionInfo(
			{ ...sample, allMessagesText: "BODY" },
			"human",
		);
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines).toContain("--- transcript ---");
			expect(rendered.lines).toContain("BODY");
		}
	});
});

describe("collectProjectSessions — with explicit --session-dir", () => {
	beforeEach(() => {
		mockList.mockReset();
		mockListAll.mockReset();
	});

	it("calls SessionManager.list once and labels rows with the dir basename", async () => {
		mockList.mockResolvedValueOnce([
			{
				id: "abc",
				path: "/explicit/abc.jsonl",
				cwd: "/p",
				created: new Date("2026-01-01"),
				modified: new Date("2026-01-02"),
				messageCount: 3,
				firstMessage: "hi",
				allMessagesText: "",
			},
		]);

		const rows = await collectProjectSessions({
			cwd: "/p",
			explicitSessionDir: "/explicit",
		});

		expect(mockList).toHaveBeenCalledExactlyOnceWith("/p", "/explicit");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.agent).toBe("explicit");
		expect(rows[0]?.id).toBe("abc");
	});
});

describe("createSessionsProgram", () => {
	it("registers list and info subcommands", () => {
		const program = createSessionsProgram();
		const names = program.commands.map((c) => c.name());
		expect(names).toContain("list");
		expect(names).toContain("info");
	});

	it("exposes --json and --plain at the program level", () => {
		const program = createSessionsProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--json");
		expect(optionNames).toContain("--plain");
	});

	it("`list` has --agent, --all, --limit, --session-dir options", () => {
		const program = createSessionsProgram();
		const list = program.commands.find((c) => c.name() === "list");
		const optionNames = list?.options.map((o) => o.long) ?? [];
		expect(optionNames).toContain("--agent");
		expect(optionNames).toContain("--all");
		expect(optionNames).toContain("--limit");
		expect(optionNames).toContain("--session-dir");
	});

	it("`info` has --include-text and --session-dir options", () => {
		const program = createSessionsProgram();
		const info = program.commands.find((c) => c.name() === "info");
		const optionNames = info?.options.map((o) => o.long) ?? [];
		expect(optionNames).toContain("--include-text");
		expect(optionNames).toContain("--session-dir");
	});
});

describe("session list command — end to end", () => {
	let context: CommandTestContext;

	beforeEach(async () => {
		mockList.mockReset();
		mockListAll.mockReset();
		context = await createCommandTestContext("session-list-cmd-");
	});

	afterEach(async () => {
		await context.restore();
	});

	it("emits a JSON array of rows sorted by modified desc when --json is set", async () => {
		mockList.mockResolvedValueOnce([
			{
				id: "old",
				path: "/old.jsonl",
				cwd: context.tempDir,
				created: new Date("2026-01-01"),
				modified: new Date("2026-01-01"),
				messageCount: 1,
				firstMessage: "old",
				allMessagesText: "",
			},
			{
				id: "new",
				path: "/new.jsonl",
				cwd: context.tempDir,
				created: new Date("2026-05-01"),
				modified: new Date("2026-05-01"),
				messageCount: 2,
				firstMessage: "new",
				allMessagesText: "",
			},
		]);

		const program = createSessionsProgram();
		await program.parseAsync([
			"node",
			"test",
			"--json",
			"list",
			"--session-dir",
			"/abs/explicit",
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionListItem[];
		expect(parsed.map((r) => r.id)).toEqual(["new", "old"]);
		expect(context.exit.calls()).toEqual([]);
	});

	it("--limit caps the row count after sort", async () => {
		mockList.mockResolvedValueOnce([
			{
				id: "a",
				path: "/a.jsonl",
				cwd: context.tempDir,
				created: new Date("2026-01-01"),
				modified: new Date("2026-01-01"),
				messageCount: 1,
				firstMessage: "",
				allMessagesText: "",
			},
			{
				id: "b",
				path: "/b.jsonl",
				cwd: context.tempDir,
				created: new Date("2026-02-01"),
				modified: new Date("2026-02-01"),
				messageCount: 1,
				firstMessage: "",
				allMessagesText: "",
			},
			{
				id: "c",
				path: "/c.jsonl",
				cwd: context.tempDir,
				created: new Date("2026-03-01"),
				modified: new Date("2026-03-01"),
				messageCount: 1,
				firstMessage: "",
				allMessagesText: "",
			},
		]);

		const program = createSessionsProgram();
		await program.parseAsync([
			"node",
			"test",
			"--json",
			"list",
			"--session-dir",
			"/abs/explicit",
			"--limit",
			"2",
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionListItem[];
		expect(parsed.map((r) => r.id)).toEqual(["c", "b"]);
	});

	it("rejects --all combined with --agent", async () => {
		const program = createSessionsProgram();
		await expect(
			program.parseAsync([
				"node",
				"test",
				"list",
				"--all",
				"--agent",
				"coding",
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain(
			"--all and --agent are mutually exclusive",
		);
		expect(context.exit.calls()).toEqual([1]);
	});

	it("rejects a non-positive --limit", async () => {
		const program = createSessionsProgram();
		await expect(
			program.parseAsync([
				"node",
				"test",
				"list",
				"--session-dir",
				"/abs/explicit",
				"--limit",
				"0",
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain("Invalid --limit");
		expect(context.exit.calls()).toEqual([1]);
	});

	it("falls back to SessionManager.listAll when --all is set", async () => {
		mockListAll.mockResolvedValueOnce([
			{
				id: "x",
				path: "/x.jsonl",
				cwd: "/some/other/project",
				created: new Date("2026-04-01"),
				modified: new Date("2026-04-01"),
				messageCount: 1,
				firstMessage: "",
				allMessagesText: "",
			},
		]);

		const program = createSessionsProgram();
		await program.parseAsync(["node", "test", "--json", "list", "--all"]);

		expect(mockListAll).toHaveBeenCalledTimes(1);
		const parsed = JSON.parse(context.output.stdout()) as SessionListItem[];
		expect(parsed[0]?.agent).toBeNull();
		expect(parsed[0]?.cwd).toBe("/some/other/project");
	});
});

describe("session info command — end to end", () => {
	let context: CommandTestContext;

	beforeEach(async () => {
		mockList.mockReset();
		mockListAll.mockReset();
		context = await createCommandTestContext("session-info-cmd-");
	});

	afterEach(async () => {
		await context.restore();
	});

	it("resolves an id prefix and emits a JSON payload", async () => {
		mockList.mockResolvedValueOnce([
			{
				id: "019e1a02-47ab-702b-affa-3dab3ed4ec03",
				path: "/abs/coding/sess.jsonl",
				cwd: context.tempDir,
				created: new Date("2026-05-12"),
				modified: new Date("2026-05-12T14:49:53Z"),
				messageCount: 244,
				firstMessage: "hello",
				allMessagesText: "full transcript",
			},
		]);

		const program = createSessionsProgram();
		await program.parseAsync([
			"node",
			"test",
			"--json",
			"info",
			"019e1a02",
			"--session-dir",
			"/abs/coding",
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionInfoOutput;
		expect(parsed.id).toBe("019e1a02-47ab-702b-affa-3dab3ed4ec03");
		expect(parsed.allMessagesText).toBeUndefined();
	});

	it("appends allMessagesText when --include-text is set", async () => {
		const info = {
			id: "019e1a02-47ab-702b-affa-3dab3ed4ec03",
			path: "/abs/coding/sess.jsonl",
			cwd: context.tempDir,
			created: new Date("2026-05-12"),
			modified: new Date("2026-05-12T14:49:53Z"),
			messageCount: 1,
			firstMessage: "hello",
			allMessagesText: "full transcript",
		};
		mockList.mockResolvedValueOnce([info]).mockResolvedValueOnce([info]);

		const program = createSessionsProgram();
		await program.parseAsync([
			"node",
			"test",
			"--json",
			"info",
			"019e1a02",
			"--include-text",
			"--session-dir",
			"/abs/coding",
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionInfoOutput;
		expect(parsed.allMessagesText).toBe("full transcript");
	});

	it("exits 1 with stderr diagnostics when the id prefix matches nothing", async () => {
		mockList.mockResolvedValueOnce([]);

		const program = createSessionsProgram();
		await expect(
			program.parseAsync([
				"node",
				"test",
				"info",
				"deadbeef",
				"--session-dir",
				"/abs/coding",
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain('no session matches "deadbeef"');
		expect(context.exit.calls()).toEqual([1]);
	});

	it("exits 1 listing candidates when the id prefix is ambiguous", async () => {
		mockList.mockResolvedValueOnce([
			{
				id: "019e1a02-aaaa",
				path: "/a.jsonl",
				cwd: context.tempDir,
				created: new Date(),
				modified: new Date(),
				messageCount: 0,
				firstMessage: "",
				allMessagesText: "",
			},
			{
				id: "019e1a02-bbbb",
				path: "/b.jsonl",
				cwd: context.tempDir,
				created: new Date(),
				modified: new Date(),
				messageCount: 0,
				firstMessage: "",
				allMessagesText: "",
			},
		]);

		const program = createSessionsProgram();
		await expect(
			program.parseAsync([
				"node",
				"test",
				"info",
				"019e1a02",
				"--session-dir",
				"/abs/coding",
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain("is ambiguous");
		expect(context.output.stderr()).toContain("/a.jsonl");
		expect(context.output.stderr()).toContain("/b.jsonl");
		expect(context.exit.calls()).toEqual([1]);
	});
});
