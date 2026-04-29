import { describe, expect, it, vi } from "vitest";
import type {
	CliOutputMode,
	CliParseResult,
	CliTableColumn,
} from "../../../cli/shared/output.ts";
import {
	getOutputMode,
	printJson,
	printLines,
	renderTable,
} from "../../../cli/shared/output.ts";

function mockStreamWrites() {
	return {
		stdout: vi.spyOn(process.stdout, "write").mockImplementation(() => true),
		stderr: vi.spyOn(process.stderr, "write").mockImplementation(() => true),
	};
}

describe("CLI output helpers", () => {
	it("resolves human output by default", () => {
		expect(getOutputMode({})).toBe("human");
	});

	it("resolves plain output when requested", () => {
		expect(getOutputMode({ plain: true })).toBe("plain");
	});

	it("prioritizes json output over plain output", () => {
		expect(getOutputMode({ json: true, plain: true })).toBe("json");
	});

	it("pretty-prints JSON to stdout", () => {
		const streams = mockStreamWrites();

		printJson({ ok: true, count: 2 });

		expect(streams.stdout).toHaveBeenCalledWith(
			'{\n  "ok": true,\n  "count": 2\n}\n',
		);
		expect(streams.stderr).not.toHaveBeenCalled();
	});

	it("prints lines to stdout by default", () => {
		const streams = mockStreamWrites();

		printLines(["first", "second"]);

		expect(streams.stdout).toHaveBeenCalledWith("first\nsecond\n");
		expect(streams.stderr).not.toHaveBeenCalled();
	});

	it("prints lines to stderr when requested", () => {
		const streams = mockStreamWrites();

		printLines(["bad"], "stderr");

		expect(streams.stderr).toHaveBeenCalledWith("bad\n");
		expect(streams.stdout).not.toHaveBeenCalled();
	});

	it("renders padded table columns", () => {
		const rows = [
			{ name: "alpha", count: 2 },
			{ name: "b", count: 10 },
		];

		const columns: CliTableColumn<(typeof rows)[number]>[] = [
			{
				header: "NAME",
				width: (items) => Math.max(...items.map((item) => item.name.length)),
				render: (item) => item.name,
			},
			{
				header: "COUNT",
				width: (items) =>
					Math.max(...items.map((item) => String(item.count).length)),
				render: (item) => String(item.count),
			},
		];

		expect(renderTable(rows, columns)).toEqual([
			"NAME   COUNT",
			"alpha  2",
			"b      10",
		]);
	});

	it("exports a reusable CLI parse result type", () => {
		const result: CliParseResult<string> = { ok: true, value: "parsed" };
		const mode: CliOutputMode = "human";

		expect(result.value).toBe("parsed");
		expect(mode).toBe("human");
	});
});
