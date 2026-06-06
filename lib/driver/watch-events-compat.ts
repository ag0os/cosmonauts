import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	FileRunStore,
	type RuntimeDiagnostic,
} from "../durable-runtime/index.ts";
import { tailEvents } from "./event-stream.ts";
import type { DriverEvent } from "./types.ts";

export const WATCH_EVENTS_COMPAT_DEGRADED_MARKER = "compat-degraded.json";

export interface WatchEventsCompatResult {
	events: DriverEvent[];
	cursor: number;
	source: "normalized" | "legacy_fallback";
	diagnostics: RuntimeDiagnostic[];
}

export interface WatchEventsCompatOptions {
	rootDir: string;
	scope: string;
	runId: string;
	since?: number;
}

interface LegacyCountResult {
	count: number;
	found: boolean;
}

export async function watchDriverEventsCompat({
	rootDir,
	scope,
	runId,
	since = 0,
}: WatchEventsCompatOptions): Promise<WatchEventsCompatResult> {
	const runDir = join(rootDir, scope, "runs", runId);
	const legacyPath = join(runDir, "events.jsonl");
	const markerPath = join(runDir, WATCH_EVENTS_COMPAT_DEGRADED_MARKER);
	const [legacyCount, degradedMarker] = await Promise.all([
		countJsonlLines(legacyPath),
		readCompatDegradedMarker(markerPath),
	]);

	if (degradedMarker) {
		return legacyFallback(legacyPath, since, [
			compatDiagnostic(
				"watch_events_compat_degraded",
				"Normalized Drive compatibility events are marked degraded; using legacy events.jsonl fallback.",
				{ markerPath, marker: degradedMarker },
			),
		]);
	}

	const store = new FileRunStore({ rootDir });
	const ref = { scope, runId };
	const record = await store.loadRun(ref);
	if (!record) {
		if (legacyCount.found) {
			return legacyFallback(legacyPath, since, [
				compatDiagnostic(
					"watch_events_normalized_run_missing",
					"Normalized run record is missing; using legacy events.jsonl fallback for watch_events.",
					{ legacyPath },
				),
			]);
		}

		await tailEvents(legacyPath, since);
	}

	const normalized = await store.readEvents(ref);
	const reconstructed = normalized.events
		.map((envelope) => legacyDriverEventFromRunActivity(envelope.event))
		.filter((event): event is DriverEvent => event !== undefined);

	if (legacyCount.found && reconstructed.length < legacyCount.count) {
		return legacyFallback(legacyPath, since, [
			...normalized.diagnostics,
			compatDiagnostic(
				"watch_events_compat_incomplete",
				"Normalized Drive compatibility event count is below legacy events.jsonl count; using legacy fallback.",
				{
					normalizedLegacyEventCount: reconstructed.length,
					legacyJsonlLineCount: legacyCount.count,
					legacyPath,
				},
			),
		]);
	}

	return {
		events: sliceLegacyCursor(reconstructed, since),
		cursor: cursorForLegacyCount(reconstructed.length, since),
		source: "normalized",
		diagnostics: normalized.diagnostics,
	};
}

function legacyDriverEventFromRunActivity(event: {
	type: string;
	details?: unknown;
}): DriverEvent | undefined {
	if (event.type !== "run_activity") {
		return undefined;
	}
	if (typeof event.details !== "object" || event.details === null) {
		return undefined;
	}

	const details = event.details as Record<string, unknown>;
	if (details.kind !== "legacy_driver_event") {
		return undefined;
	}

	return isDriverEvent(details.event) ? details.event : undefined;
}

function sliceLegacyCursor(
	events: readonly DriverEvent[],
	since: number,
): DriverEvent[] {
	if (since >= events.length) {
		return [];
	}

	return events.slice(Math.max(0, since));
}

function cursorForLegacyCount(total: number, since: number): number {
	return since >= total ? since : total;
}

async function legacyFallback(
	path: string,
	since: number,
	diagnostics: RuntimeDiagnostic[],
): Promise<WatchEventsCompatResult> {
	const legacy = await tailEvents(path, since);
	return {
		...legacy,
		source: "legacy_fallback",
		diagnostics,
	};
}

async function countJsonlLines(path: string): Promise<LegacyCountResult> {
	try {
		const content = await readFile(path, "utf-8");
		return { count: splitJsonLines(content).length, found: true };
	} catch (error) {
		if (isNotFoundError(error)) {
			return { count: 0, found: false };
		}
		throw error;
	}
}

async function readCompatDegradedMarker(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf-8")) as unknown;
	} catch (error) {
		if (isNotFoundError(error)) {
			return undefined;
		}
		return { unreadable: true, error: formatJsonError(error) };
	}
}

function splitJsonLines(content: string): string[] {
	const lines = content.split("\n");
	if (content.endsWith("\n")) {
		lines.pop();
	}
	return lines.map((line) => line.replace(/\r$/, ""));
}

function isDriverEvent(value: unknown): value is DriverEvent {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { runId?: unknown }).runId === "string" &&
		typeof (value as { parentSessionId?: unknown }).parentSessionId ===
			"string" &&
		typeof (value as { timestamp?: unknown }).timestamp === "string"
	);
}

function compatDiagnostic(
	code: string,
	message: string,
	details: Record<string, unknown>,
): RuntimeDiagnostic {
	return { code, message, details };
}

function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function formatJsonError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
