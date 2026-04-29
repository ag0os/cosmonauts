import type { CliGlobalOptions } from "./output.ts";
import { printLines } from "./output.ts";

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
