interface RequiredOkfFields {
	readonly type: string;
	readonly title: string;
	readonly description: string;
	readonly resource: string;
	readonly tags: readonly string[];
	readonly timestamp: string;
}

export function hasRequiredOkfFields(
	value: Record<string, unknown>,
): value is Record<string, unknown> & RequiredOkfFields {
	return (
		typeof value.type === "string" &&
		typeof value.title === "string" &&
		typeof value.description === "string" &&
		typeof value.resource === "string" &&
		Array.isArray(value.tags) &&
		value.tags.every((tag: unknown) => typeof tag === "string") &&
		typeof value.timestamp === "string"
	);
}
