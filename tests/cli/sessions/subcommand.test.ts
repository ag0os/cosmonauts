import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

// ============================================================================
// Fixture helpers — write real Pi-format JSONL files into temp directories
// so we exercise SessionManager.list end-to-end. These fixtures are what the
// reviewer-flagged bugs (--all skipping nested cosmonauts sessions,
// --session-dir treating the base as a leaf) would slip past mock-only tests.
// ============================================================================

interface FixtureSession {
	id: string;
	modifiedAt?: Date;
	cwd?: string;
	messageCount?: number;
	firstMessage?: string;
}

async function writeFixtureSession(
	dir: string,
	opts: FixtureSession,
): Promise<string> {
	await mkdir(dir, { recursive: true });
	const modifiedAt = opts.modifiedAt ?? new Date("2026-01-01T00:00:00.000Z");
	const filename = `${modifiedAt.toISOString().replace(/[:.]/g, "-")}_${opts.id}.jsonl`;
	const path = join(dir, filename);
	const messageCount = opts.messageCount ?? 1;
	const firstMessage = opts.firstMessage ?? "hello";
	const cwd = opts.cwd ?? "/test/cwd";

	const lines: string[] = [
		JSON.stringify({
			type: "session",
			version: 3,
			id: opts.id,
			timestamp: modifiedAt.toISOString(),
			cwd,
		}),
	];
	for (let i = 0; i < messageCount; i += 1) {
		lines.push(
			JSON.stringify({
				type: "message",
				id: `msg-${opts.id}-${i}`,
				parentId: i === 0 ? null : `msg-${opts.id}-${i - 1}`,
				timestamp: modifiedAt.toISOString(),
				message: {
					role: i % 2 === 0 ? "user" : "assistant",
					content: [
						{
							type: "text",
							text: i === 0 ? firstMessage : `reply ${i}`,
						},
					],
					timestamp: modifiedAt.getTime(),
				},
			}),
		);
	}
	await writeFile(path, `${lines.join("\n")}\n`);
	await utimes(path, modifiedAt, modifiedAt);
	return path;
}

// Use distinct uuids so id-prefix lookups remain unambiguous across fixtures.
const ID_FLAT_A = "11111111-1111-1111-1111-111111111111";
const ID_CODING = "22222222-2222-2222-2222-222222222222";
const ID_PLANNER = "33333333-3333-3333-3333-333333333333";
const ID_OTHER_PROJECT = "44444444-4444-4444-4444-444444444444";
const ID_AMBIG_A = "ABCDEFGH-aaaa-aaaa-aaaa-aaaaaaaaaaaa".toLowerCase();
const ID_AMBIG_B = "ABCDEFGH-bbbb-bbbb-bbbb-bbbbbbbbbbbb".toLowerCase();

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

// ============================================================================
// Pure helpers
// ============================================================================

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

// ============================================================================
// Data collection — real fixture directories
// ============================================================================

describe("collectProjectSessions — dual layout walk", () => {
	let context: CommandTestContext;
	let base: string;

	beforeEach(async () => {
		context = await createCommandTestContext("collect-project-");
		base = join(context.tempDir, "sessions-base");
	});

	afterEach(async () => {
		await context.restore();
	});

	it("returns an empty array when the base dir does not exist yet", async () => {
		const rows = await collectProjectSessions({
			cwd: "/p",
			explicitSessionDir: join(context.tempDir, "never-created"),
		});
		expect(rows).toEqual([]);
	});

	it("walks both flat .jsonl files AND nested agent subdirs (regression for the --session-dir-as-base bug)", async () => {
		await writeFixtureSession(base, {
			id: ID_FLAT_A,
			modifiedAt: new Date("2026-01-01T00:00:00Z"),
			firstMessage: "flat one",
		});
		await writeFixtureSession(join(base, "coding"), {
			id: ID_CODING,
			modifiedAt: new Date("2026-02-01T00:00:00Z"),
			firstMessage: "nested coding",
		});
		await writeFixtureSession(join(base, "planner"), {
			id: ID_PLANNER,
			modifiedAt: new Date("2026-03-01T00:00:00Z"),
			firstMessage: "nested planner",
		});

		const rows = await collectProjectSessions({
			cwd: "/test/cwd",
			explicitSessionDir: base,
		});

		// All three layouts surface, each tagged with the correct agent label.
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(rows).toHaveLength(3);
		expect(byId.get(ID_FLAT_A)?.agent).toBeNull();
		expect(byId.get(ID_CODING)?.agent).toBe("coding");
		expect(byId.get(ID_PLANNER)?.agent).toBe("planner");
	});

	it("--agent filter scopes to one subdir and skips flat-base files", async () => {
		await writeFixtureSession(base, { id: ID_FLAT_A });
		await writeFixtureSession(join(base, "coding"), { id: ID_CODING });
		await writeFixtureSession(join(base, "planner"), { id: ID_PLANNER });

		const rows = await collectProjectSessions({
			cwd: "/test/cwd",
			explicitSessionDir: base,
			agentFilter: "coding",
		});

		expect(rows.map((r) => r.id)).toEqual([ID_CODING]);
		expect(rows[0]?.agent).toBe("coding");
	});

	it("--agent filter that matches nothing returns an empty list", async () => {
		await writeFixtureSession(join(base, "coding"), { id: ID_CODING });

		const rows = await collectProjectSessions({
			cwd: "/test/cwd",
			explicitSessionDir: base,
			agentFilter: "never-existed",
		});

		expect(rows).toEqual([]);
	});
});

describe("session list command — end to end (real fixtures)", () => {
	let context: CommandTestContext;
	let base: string;
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

	beforeEach(async () => {
		context = await createCommandTestContext("session-list-cmd-");
		base = join(context.tempDir, "sessions-base");
	});

	afterEach(async () => {
		await context.restore();
		if (originalAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		}
	});

	it("--session-dir <base> walks subdirs and emits a sorted JSON array", async () => {
		await writeFixtureSession(base, {
			id: ID_FLAT_A,
			modifiedAt: new Date("2026-01-01T00:00:00Z"),
		});
		await writeFixtureSession(join(base, "coding"), {
			id: ID_CODING,
			modifiedAt: new Date("2026-05-01T00:00:00Z"),
		});

		await createSessionsProgram().parseAsync([
			"node",
			"test",
			"--json",
			"list",
			"--session-dir",
			base,
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionListItem[];
		// Newest first.
		expect(parsed.map((r) => r.id)).toEqual([ID_CODING, ID_FLAT_A]);
		// Nested file is tagged with its agent subdir, flat file is null.
		expect(parsed[0]?.agent).toBe("coding");
		expect(parsed[1]?.agent).toBeNull();
		expect(context.exit.calls()).toEqual([]);
	});

	it("--limit caps the row count after sort", async () => {
		await writeFixtureSession(join(base, "coding"), {
			id: ID_CODING,
			modifiedAt: new Date("2026-03-01T00:00:00Z"),
		});
		await writeFixtureSession(join(base, "planner"), {
			id: ID_PLANNER,
			modifiedAt: new Date("2026-04-01T00:00:00Z"),
		});
		await writeFixtureSession(base, {
			id: ID_FLAT_A,
			modifiedAt: new Date("2026-01-01T00:00:00Z"),
		});

		await createSessionsProgram().parseAsync([
			"node",
			"test",
			"--json",
			"list",
			"--session-dir",
			base,
			"--limit",
			"2",
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionListItem[];
		expect(parsed.map((r) => r.id)).toEqual([ID_PLANNER, ID_CODING]);
	});

	it("rejects --all combined with --agent", async () => {
		await expect(
			createSessionsProgram().parseAsync([
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

	it("rejects --all combined with --session-dir", async () => {
		await expect(
			createSessionsProgram().parseAsync([
				"node",
				"test",
				"list",
				"--all",
				"--session-dir",
				base,
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain(
			"--all and --session-dir are mutually exclusive",
		);
		expect(context.exit.calls()).toEqual([1]);
	});

	it("rejects a non-positive --limit", async () => {
		await expect(
			createSessionsProgram().parseAsync([
				"node",
				"test",
				"list",
				"--session-dir",
				base,
				"--limit",
				"0",
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain("Invalid --limit");
		expect(context.exit.calls()).toEqual([1]);
	});

	it("--all walks every cwd's nested agent subdirs (regression for the listAll-bypass bug)", async () => {
		// Point Pi (and our --all walker) at an isolated agent dir.
		const agentDir = join(context.tempDir, "agent-root");
		process.env.PI_CODING_AGENT_DIR = agentDir;
		const sessionsRoot = join(agentDir, "sessions");

		// Two cwds, each laid out the way cosmonauts writes:
		//   <sessionsRoot>/<encoded-cwd>/<agent>/<file>.jsonl
		await writeFixtureSession(
			join(sessionsRoot, "--Users-cosmos-Projects-a--", "coding"),
			{ id: ID_CODING, cwd: "/Users/cosmos/Projects/a" },
		);
		await writeFixtureSession(
			join(sessionsRoot, "--Users-cosmos-Projects-b--", "planner"),
			{ id: ID_PLANNER, cwd: "/Users/cosmos/Projects/b" },
		);
		// And one flat (Pi-direct) session in a third cwd — also expected to surface.
		await writeFixtureSession(
			join(sessionsRoot, "--Users-cosmos-Projects-c--"),
			{ id: ID_OTHER_PROJECT, cwd: "/Users/cosmos/Projects/c" },
		);

		await createSessionsProgram().parseAsync([
			"node",
			"test",
			"--json",
			"list",
			"--all",
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionListItem[];
		const ids = parsed.map((r) => r.id).sort();
		expect(ids).toEqual([ID_CODING, ID_PLANNER, ID_OTHER_PROJECT].sort());

		const byId = new Map(parsed.map((r) => [r.id, r]));
		expect(byId.get(ID_CODING)?.agent).toBe("coding");
		expect(byId.get(ID_PLANNER)?.agent).toBe("planner");
		expect(byId.get(ID_OTHER_PROJECT)?.agent).toBeNull();
		// Real cwd comes from each session file's header, not the encoded dir name.
		expect(byId.get(ID_CODING)?.cwd).toBe("/Users/cosmos/Projects/a");
	});
});

describe("session info command — end to end (real fixtures)", () => {
	let context: CommandTestContext;
	let base: string;

	beforeEach(async () => {
		context = await createCommandTestContext("session-info-cmd-");
		base = join(context.tempDir, "sessions-base");
	});

	afterEach(async () => {
		await context.restore();
	});

	it("resolves an id prefix against a nested agent subdir", async () => {
		await writeFixtureSession(join(base, "coding"), {
			id: ID_CODING,
			modifiedAt: new Date("2026-05-12T14:49:53Z"),
			firstMessage: "hello",
		});

		await createSessionsProgram().parseAsync([
			"node",
			"test",
			"--json",
			"info",
			ID_CODING.slice(0, 8),
			"--session-dir",
			base,
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionInfoOutput;
		expect(parsed.id).toBe(ID_CODING);
		expect(parsed.agent).toBe("coding");
		expect(parsed.allMessagesText).toBeUndefined();
	});

	it("appends allMessagesText when --include-text is set", async () => {
		await writeFixtureSession(join(base, "coding"), {
			id: ID_CODING,
			firstMessage: "transcript opener",
		});

		await createSessionsProgram().parseAsync([
			"node",
			"test",
			"--json",
			"info",
			ID_CODING.slice(0, 8),
			"--include-text",
			"--session-dir",
			base,
		]);

		const parsed = JSON.parse(context.output.stdout()) as SessionInfoOutput;
		expect(parsed.allMessagesText).toContain("transcript opener");
	});

	it("exits 1 with stderr diagnostics when the id prefix matches nothing", async () => {
		await writeFixtureSession(join(base, "coding"), { id: ID_CODING });

		await expect(
			createSessionsProgram().parseAsync([
				"node",
				"test",
				"info",
				"deadbeef",
				"--session-dir",
				base,
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain('no session matches "deadbeef"');
		expect(context.exit.calls()).toEqual([1]);
	});

	it("exits 1 listing candidates when the id prefix is ambiguous across layouts", async () => {
		// Two sessions whose IDs share a prefix, one flat at base, one nested.
		await writeFixtureSession(base, { id: ID_AMBIG_A });
		await writeFixtureSession(join(base, "coding"), { id: ID_AMBIG_B });
		const ambiguousPrefix = ID_AMBIG_A.slice(0, 6);

		await expect(
			createSessionsProgram().parseAsync([
				"node",
				"test",
				"info",
				ambiguousPrefix,
				"--session-dir",
				base,
			]),
		).rejects.toThrow(ProcessExitError);

		expect(context.output.stderr()).toContain("is ambiguous");
		expect(context.output.stderr()).toContain(ID_AMBIG_A);
		expect(context.output.stderr()).toContain(ID_AMBIG_B);
		expect(context.exit.calls()).toEqual([1]);
	});
});

// ============================================================================
// Commander program structure
// ============================================================================

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
