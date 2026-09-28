export function episodeWarningReason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function clampEpisodeWarning(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}
