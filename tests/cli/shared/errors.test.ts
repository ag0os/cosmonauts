import { describe, expect, it, vi } from "vitest";
import type { CliErrorPrintOptions } from "../../../cli/shared/errors.ts";
import { printCliError } from "../../../cli/shared/errors.ts";

function captureCliStreams() {
	const stdout = vi
		.spyOn(process.stdout, "write")
		.mockImplementation(() => true);
	const stderr = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);

	return { stdout, stderr };
}

describe("CLI error helpers", () => {
	it("prints a JSON error payload to stdout by default", () => {
		const streams = captureCliStreams();

		printCliError("Disk full", { json: true });

		expect(streams.stdout).toHaveBeenCalledWith(
			'{\n  "error": "Disk full"\n}\n',
		);
		expect(streams.stderr).not.toHaveBeenCalled();
	});

	it("uses a custom JSON error message when provided", () => {
		const streams = captureCliStreams();

		printCliError("Disk full", { json: true }, { jsonMessage: "write failed" });

		expect(streams.stdout).toHaveBeenCalledWith(
			'{\n  "error": "write failed"\n}\n',
		);
		expect(streams.stderr).not.toHaveBeenCalled();
	});

	it("prints human error text to stderr with an optional prefix", () => {
		const streams = captureCliStreams();
		const options: CliErrorPrintOptions = { prefix: "cosmonauts plan" };

		printCliError("missing plan", {}, options);

		expect(streams.stderr).toHaveBeenCalledWith(
			"cosmonauts plan: missing plan\n",
		);
		expect(streams.stdout).not.toHaveBeenCalled();
	});

	it("prints plain error text to the requested stream", () => {
		const streams = captureCliStreams();

		printCliError("not found", { plain: true }, { stream: "stdout" });

		expect(streams.stdout).toHaveBeenCalledWith("not found\n");
		expect(streams.stderr).not.toHaveBeenCalled();
	});
});
