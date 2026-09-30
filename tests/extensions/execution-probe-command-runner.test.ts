import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProbeCommand } from "../../bundled/coding/extensions/execution-probe/command-runner.ts";

// TASK-811 P3 / review F3 / B-008: a descendant that leaves the process group
// while holding stdout and stderr must not keep the probe from settling.
const SETTLE_GUARD_MS = 8_000;

let dir: string;
let pidFile: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "probe-runner-"));
	pidFile = join(dir, "escaped.pid");
	await writeFile(
		join(dir, "escape.cjs"),
		[
			'const { spawn } = require("node:child_process");',
			`const body = 'require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 20000)';`,
			'spawn(process.execPath, ["-e", body], { detached: true, stdio: "inherit" }).unref();',
			'if (process.argv[2] === "linger") setTimeout(() => {}, 30000);',
		].join("\n"),
	);
});

afterEach(async () => {
	const pid = Number(await readFile(pidFile, "utf8").catch(() => ""));
	if (pid > 0) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	await rm(dir, { recursive: true, force: true });
});

function command(mode: "exit" | "linger"): string {
	return `${JSON.stringify(process.execPath)} escape.cjs ${mode}`;
}

async function settleWithin(
	run: ReturnType<typeof runProbeCommand>,
): Promise<Awaited<typeof run> | "unsettled"> {
	return Promise.race([
		run,
		delay(SETTLE_GUARD_MS).then(() => "unsettled" as const),
	]);
}

describe("runProbeCommand with an escaped descendant", () => {
	it.each([
		"exit",
		"linger",
	] as const)("settles with termination-error after the timeout when the command %ss", async (mode) => {
		const started = Date.now();
		const outcome = await settleWithin(
			runProbeCommand(command(mode), dir, new AbortController().signal, 500),
		);
		expect(outcome).not.toBe("unsettled");
		expect(outcome).toMatchObject({ kind: "termination-error" });
		expect(Date.now() - started).toBeLessThan(SETTLE_GUARD_MS);
	});

	it("settles with termination-error after an abort", async () => {
		const controller = new AbortController();
		const run = runProbeCommand(
			command("linger"),
			dir,
			controller.signal,
			60_000,
		);
		setTimeout(() => controller.abort(), 300);
		const outcome = await settleWithin(run);
		expect(outcome).not.toBe("unsettled");
		expect(outcome).toMatchObject({ kind: "termination-error" });
	});
});
