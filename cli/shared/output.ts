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

const PLAIN_ROW_SEPARATOR = "\t";

/**
 * Renders one `--plain` row: fields separated by a single tab, one row per
 * line. A field may contain a pipe or any other punctuation; any control
 * character (Unicode `Cc`: tab, VT, FF, CR, LF, NEL, DEL, the C0 and C1
 * ranges) or Unicode line/paragraph separator (U+2028, U+2029) inside a field
 * (a title, typically) is replaced by a space, so the row always splits back
 * into exactly the emitted fields and never spans two lines under any
 * line-splitting convention.
 */
export function renderPlainRow(fields: readonly string[]): string {
	return fields
		.map((field) => field.replace(/[\p{Cc}\u2028\u2029]+/gu, " "))
		.join(PLAIN_ROW_SEPARATOR);
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
