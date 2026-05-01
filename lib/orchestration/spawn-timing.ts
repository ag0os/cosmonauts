/**
 * Lightweight env-gated timing instrumentation for the sub-agent spawn path.
 *
 * Enable by setting `COSMONAUTS_SPAWN_TIMING=1`. When enabled, callsites that
 * invoke `markSpawnStage` emit one stderr line per stage with the elapsed
 * milliseconds since the first stage logged for that key. Useful for
 * pinpointing where the latency between `spawn_agent` returning "Accepted"
 * and the first child activity comes from.
 */

const ENABLED = process.env.COSMONAUTS_SPAWN_TIMING === "1";

const startTimes = new Map<string, number>();
const lastTimes = new Map<string, number>();

function formatExtra(extra: Record<string, unknown> | undefined): string {
	if (!extra) return "";
	const parts: string[] = [];
	for (const [k, v] of Object.entries(extra)) {
		if (v === undefined) continue;
		const s =
			typeof v === "string" || typeof v === "number" || typeof v === "boolean"
				? String(v)
				: JSON.stringify(v);
		parts.push(`${k}=${s}`);
	}
	return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export function markSpawnStage(
	key: string | undefined,
	stage: string,
	extra?: Record<string, unknown>,
): void {
	if (!ENABLED || !key) return;
	const now = Date.now();
	let start = startTimes.get(key);
	if (start === undefined) {
		start = now;
		startTimes.set(key, start);
	}
	const last = lastTimes.get(key) ?? start;
	lastTimes.set(key, now);
	const total = now - start;
	const delta = now - last;
	process.stderr.write(
		`[spawn-timing] +${total}ms (Δ${delta}ms) key=${key} stage=${stage}${formatExtra(extra)}\n`,
	);
}

export function clearSpawnTiming(key: string | undefined): void {
	if (!key) return;
	startTimes.delete(key);
	lastTimes.delete(key);
}
