import type { CliGlobalOptions } from "./output.ts";
import { printLines } from "./output.ts";

/**
 * Thrown for benign user-initiated aborts (cancel resume, decline fork).
 * The top-level error handler checks for this to exit with status 0
 * instead of printing an error and setting status 1.
 */
export class GracefulExitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GracefulExitError";
	}
}

export interface CliErrorPrintOptions {
	prefix?: string;
	jsonMessage?: string;
	stream?: "stdout" | "stderr";
}

export function printCliError(
	message: string,
	globalOptions: CliGlobalOptions,
	options: CliErrorPrintOptions = {},
): void {
	const stream = options.stream ?? (globalOptions.json ? "stdout" : "stderr");

	if (globalOptions.json) {
		printLines(
			[JSON.stringify({ error: options.jsonMessage ?? message }, null, 2)],
			stream,
		);
		return;
	}

	printLines([formatErrorMessage(message, options.prefix)], stream);
}

function formatErrorMessage(
	message: string,
	prefix: string | undefined,
): string {
	return prefix ? `${prefix}: ${message}` : message;
}
