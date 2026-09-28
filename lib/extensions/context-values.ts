export function getSystemPrompt(event: unknown): string {
	return valueFromObject(event, "systemPrompt") ?? "";
}

export function getMessages(event: unknown): unknown[] {
	if (event && typeof event === "object" && "messages" in event) {
		const messages = (event as { messages?: unknown }).messages;
		if (Array.isArray(messages)) return messages;
	}
	return [];
}

export function valueFromObject(
	value: unknown,
	key: string,
): string | undefined {
	if (value && typeof value === "object" && key in value) {
		const field = (value as Record<string, unknown>)[key];
		return typeof field === "string" ? field : undefined;
	}
	return undefined;
}

export function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf-8");
}
