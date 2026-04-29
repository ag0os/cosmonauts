export type CliOutputMode = "json" | "plain" | "human";

export interface CliGlobalOptions {
	json?: boolean;
	plain?: boolean;
}

export interface CliTableColumn<T> {
	header: string;
	width: (rows: readonly T[]) => number;
	render: (row: T) => string;
}

export type CliParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

export function getOutputMode(options: CliGlobalOptions): CliOutputMode {
	if (options.json) {
		return "json";
	}

	if (options.plain) {
		return "plain";
	}

	return "human";
}

export function printJson(value: unknown): void {
	process.stdout.write(`${String(JSON.stringify(value, null, 2))}\n`);
}

export function printLines(
	lines: readonly string[],
	stream: "stdout" | "stderr" = "stdout",
): void {
	if (lines.length === 0) {
		return;
	}

	process[stream].write(`${lines.join("\n")}\n`);
}

export function renderTable<T>(
	rows: readonly T[],
	columns: readonly CliTableColumn<T>[],
): string[] {
	if (columns.length === 0) {
		return [];
	}

	const widths = columns.map((column) =>
		Math.max(column.header.length, column.width(rows)),
	);

	return [
		renderTableLine(
			columns.map((column) => column.header),
			widths,
		),
		...rows.map((row) =>
			renderTableLine(
				columns.map((column) => column.render(row)),
				widths,
			),
		),
	];
}

function renderTableLine(
	values: readonly string[],
	widths: readonly number[],
): string {
	return values
		.map((value, index) =>
			index === values.length - 1 ? value : value.padEnd(widths[index] ?? 0),
		)
		.join("  ");
}
