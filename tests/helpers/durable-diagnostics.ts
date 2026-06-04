import { vi } from "vitest";

interface CapturedDurableDiagnostic {
	type?: string;
	code?: string;
	details?: { error?: unknown };
}

export function captureDurableDiagnostics(): {
	records(): CapturedDurableDiagnostic[];
	restore(): void;
} {
	const records: CapturedDurableDiagnostic[] = [];
	const spy = vi.spyOn(console, "error").mockImplementation((value) => {
		if (typeof value !== "string") {
			return;
		}
		try {
			const parsed = JSON.parse(value) as CapturedDurableDiagnostic;
			if (parsed.type === "drive_durable_event_diagnostic") {
				records.push(parsed);
			}
		} catch {
			return;
		}
	});
	return {
		records: () => records,
		restore: () => spy.mockRestore(),
	};
}
