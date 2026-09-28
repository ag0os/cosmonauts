export function assertTextByteCeiling(options: {
	readonly label: string;
	readonly value: string;
	readonly ceiling: number;
}): void {
	const bytes = Buffer.byteLength(options.value, "utf-8");
	if (bytes > options.ceiling) {
		throw new Error(
			`${options.label} exceeds the serialized byte ceiling (${bytes.toLocaleString("en-US")} > ${formatBytes(options.ceiling)}).`,
		);
	}
}

export function formatBytes(value: number): string {
	return `${value.toLocaleString("en-US")} ${value === 1 ? "byte" : "bytes"}`;
}
