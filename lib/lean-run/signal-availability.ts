import type { Signal, SignalKind, UnavailableSignalData } from "./types.ts";

/** The `data` fields that mark a signal whose provider could not run. */
export function unavailableData(reason: string): UnavailableSignalData {
	return { unavailable: true, reason };
}

/** Why the signal's provider could not run; undefined when it ran. */
export function unavailableReason(signal: Signal): string | undefined {
	const { data } = signal;
	if (!isRecord(data) || data.unavailable !== true) return undefined;
	return typeof data.reason === "string" && data.reason.length > 0
		? data.reason
		: signal.summary;
}

export interface RequiredSignalCheck {
	readonly required: readonly SignalKind[];
	/** The last provider pass. */
	readonly signals: readonly Signal[];
	/**
	 * A build needs every required kind in the pass; a review, whose caller
	 * picks its providers, only checks the required kinds that ran.
	 */
	readonly absentIsGap: boolean;
}

/**
 * `unverified (<kind> unavailable: <reason>)` for the required kinds whose
 * provider could not run or, when absence counts, never ran; several are
 * joined with "; " inside the parentheses. Undefined when there is no gap.
 */
export function requiredSignalGap(
	check: RequiredSignalCheck,
): string | undefined {
	const gaps = check.required.flatMap((kind) => {
		const reason = gapReason(kind, check);
		return reason === undefined ? [] : [`${kind} unavailable: ${reason}`];
	});
	return gaps.length > 0 ? `unverified (${gaps.join("; ")})` : undefined;
}

function gapReason(
	kind: SignalKind,
	check: RequiredSignalCheck,
): string | undefined {
	const signals = check.signals.filter((signal) => signal.kind === kind);
	if (signals.length === 0) return check.absentIsGap ? "never ran" : undefined;
	return signals.map(unavailableReason).find((reason) => reason !== undefined);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
