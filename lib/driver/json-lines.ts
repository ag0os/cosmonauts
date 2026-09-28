export function splitJsonLines(content: string): string[] {
	const lines = content.split("\n");
	if (content.endsWith("\n")) lines.pop();
	return lines.map((line) => line.replace(/\r$/, ""));
}
