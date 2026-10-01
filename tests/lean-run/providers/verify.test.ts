import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { ProviderProcessOutcome } from "../../../domains/shared/extensions/project-tools/process-runner.ts";
import {
	createVerifyProvider,
	type VerifyCommand,
	type VerifyData,
} from "../../../lib/lean-run/providers/verify.ts";
import type { SignalContext } from "../../../lib/lean-run/types.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("lean-verify-provider-");

interface CommandData {
	command: string;
	exitCode: number | null;
	outcome: string;
	durationMs: number;
	outputTail: string;
}

function context(overrides: Partial<SignalContext> = {}): SignalContext {
	return {
		worktree: tmp.path,
		baseSha: "base123",
		plan: {
			title: "Plan",
			approach: "",
			touches: [],
			reuses: [],
			behaviors: [],
			risks: [],
			raw: "",
		},
		envelope: {} as SignalContext["envelope"],
		changedFiles: [],
		budget: { tokens: 0, timeMs: 30_000 },
		runDir: join(tmp.path, "run"),
		...overrides,
	};
}

async function writeScripts(scripts: Record<string, string>): Promise<void> {
	await writeFile(
		join(tmp.path, "package.json"),
		JSON.stringify({ name: "fixture", scripts }),
	);
}

function sh(script: string): VerifyCommand {
	return { executable: "sh", args: ["-c", script] };
}

async function writeChecks(
	checks: { id: string; command: string; args: string[] }[],
): Promise<void> {
	await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
	await writeFile(
		join(tmp.path, ".cosmonauts", "config.json"),
		JSON.stringify({ qualityReview: { checks } }),
	);
}

function verifyData(data: unknown): VerifyData {
	return data as VerifyData;
}

function commandData(data: unknown): readonly CommandData[] {
	return verifyData(data).commands;
}

describe("verify provider", { timeout: 30_000 }, () => {
	test("passes when every package.json verification script exits 0", async () => {
		await writeScripts({
			typecheck: "echo typed",
			lint: "exit 0",
			test: "exit 0",
			build: "exit 1",
		});

		const signal = await createVerifyProvider().run(context());

		expect(signal.status).toBe("pass");
		expect(signal.reenter).toBe(false);
		const data = commandData(signal.data);
		expect(data.map((entry) => entry.command)).toEqual([
			"bun run typecheck",
			"bun run lint",
			"bun run test",
		]);
		expect(data.map((entry) => entry.exitCode)).toEqual([0, 0, 0]);
		expect(data[0]?.outputTail).toContain("typed");
	});

	test("fails and re-enters when a script exits non-zero", async () => {
		await writeScripts({
			typecheck: "exit 0",
			lint: "echo 'lint broke' >&2; exit 1",
			test: "exit 0",
		});

		const signal = await createVerifyProvider().run(context());

		expect(signal.kind).toBe("verify");
		expect(signal.status).toBe("fail");
		expect(signal.reenter).toBe(true);
		expect(signal.summary).toBe("1 of 3 failed: bun run lint (exit 1)");
		const lint = commandData(signal.data)[1];
		expect(lint?.exitCode).toBe(1);
		expect(lint?.outputTail).toContain("lint broke");
		expect(lint?.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("passes when a failed command passes on its one re-run, recording both runs", async () => {
		const marker = join(tmp.path, "ran-once");
		const flaky = sh(
			`if [ -f '${marker}' ]; then echo second; exit 0; fi; touch '${marker}'; echo first; exit 1`,
		);

		const signal = await createVerifyProvider({
			commands: [sh("exit 0"), flaky],
		}).run(context());

		expect(signal).toMatchObject({ status: "pass", reenter: false });
		expect(signal.summary).toBe(
			`2 passed; passed on a second run after failing once: ${flaky.executable} ${flaky.args.join(" ")}`,
		);
		const [steady, retried] = commandData(signal.data);
		expect(steady).not.toHaveProperty("attempts");
		expect(retried).toMatchObject({
			exitCode: 0,
			verdict: "passed",
			attempts: [
				{ exitCode: 1, verdict: "failed", outputTail: "first\n" },
				{ exitCode: 0, verdict: "passed", outputTail: "second\n" },
			],
		});
	});

	test("fails and re-enters only when a command fails on both runs", async () => {
		const signal = await createVerifyProvider({
			commands: [sh("echo broke; exit 2")],
		}).run(context());

		expect(signal).toMatchObject({ status: "fail", reenter: true });
		expect(commandData(signal.data)[0]).toMatchObject({
			exitCode: 2,
			attempts: [
				{ exitCode: 2, verdict: "failed" },
				{ exitCode: 2, verdict: "failed" },
			],
		});
	});

	test("re-runs only the failed commands", async () => {
		const runs: string[] = [];
		const runProcess = vi.fn(async (request: { args: readonly string[] }) => {
			const script = request.args.at(-1) ?? "";
			runs.push(script);
			return {
				kind: "code-exit",
				code: script === "fail" ? 1 : 0,
				stdout: "",
				stderr: "",
			} as ProviderProcessOutcome;
		});

		await createVerifyProvider({
			commands: [sh("pass"), sh("fail"), sh("pass too")],
			runProcess,
		}).run(context());

		expect(runs).toEqual(["pass", "fail", "pass too", "fail"]);
	});

	test("runs the project's configured quality checks before package.json scripts", async () => {
		await writeScripts({ typecheck: "exit 1" });
		await writeChecks([
			{ id: "base", command: "sh", args: ["-c", 'echo "at $0"', "{base}"] },
			{ id: "lint", command: "sh", args: ["-c", "exit 0"] },
		]);

		const signal = await createVerifyProvider().run(context());

		expect(signal.status).toBe("pass");
		const data = commandData(signal.data);
		expect(data.map((entry) => entry.command)).toEqual([
			'sh -c echo "at $0" base123',
			"sh -c exit 0",
		]);
		expect(data[0]?.outputTail).toContain("at base123");
	});

	test("reports itself unavailable without re-entry when the project has no checks", async () => {
		const signal = await createVerifyProvider().run(context());

		expect(signal).toMatchObject({
			status: "info",
			reenter: false,
			data: {
				commands: [],
				unverified: true,
				unavailable: true,
				reason: "no verification commands configured",
			},
		});
	});

	test("marks the run unverified when a command's executable is missing", async () => {
		const signal = await createVerifyProvider({
			commands: [
				{ executable: "lean-verify-missing-executable", args: [] },
				sh("exit 0"),
			],
		}).run(context());

		expect(signal.status).toBe("info");
		expect(signal.reenter).toBe(false);
		const data = verifyData(signal.data);
		expect(data.unverified).toBe(true);
		expect(data.unavailable).toBe(true);
		expect(data.reason).toContain("lean-verify-missing-executable");
		expect(commandData(signal.data)[0]?.outcome).toBe("spawn-error");
	});

	test("fails and re-enters when cleanup errors after a command timed out", async () => {
		const outcome: ProviderProcessOutcome = {
			kind: "termination-error",
			initiated: { kind: "timeout", reason: "budget", timeoutMs: 10 },
			error: Object.assign(new Error("cleanup failed"), {
				code: "PROCESS_TREE_CLEANUP_FAILED",
			}),
			stdout: "",
			stderr: "",
		};
		const runProcess = vi.fn(async () => outcome);

		const signal = await createVerifyProvider({
			commands: [sh("sleep 5")],
			runProcess,
		}).run(context());

		expect(signal.status).toBe("fail");
		expect(signal.reenter).toBe(true);
		expect(verifyData(signal.data).unverified).toBeUndefined();
	});

	test("times out a command at the run's time budget and skips the rest", async () => {
		const signal = await createVerifyProvider({
			commands: [sh("sleep 5"), sh("exit 0")],
		}).run(context({ budget: { tokens: 0, timeMs: 300 } }));

		const data = commandData(signal.data);
		expect(data.map((entry) => entry.outcome)).toEqual(["timeout", "skipped"]);
		expect(data[0]?.durationMs).toBeLessThan(4_000);
		expect(verifyData(signal.data).commands[0]?.attempts).toMatchObject([
			{ outcome: "timeout", verdict: "failed" },
			{ outcome: "skipped", verdict: "not-run" },
		]);
		expect(signal.status).toBe("fail");
		expect(signal.reenter).toBe(true);
	});

	test("runs nothing and does not re-enter once the run is aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const signal = await createVerifyProvider({
			commands: [sh("exit 1")],
		}).run(context({ signal: controller.signal }));

		expect(commandData(signal.data)[0]?.outcome).toBe("skipped");
		expect(signal.status).toBe("info");
		expect(signal.reenter).toBe(false);
		expect(verifyData(signal.data).unverified).toBe(true);
	});

	test("stops a running command when the run is aborted", async () => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 200);

		const signal = await createVerifyProvider({
			commands: [sh("sleep 5")],
		}).run(context({ signal: controller.signal }));

		const [entry] = commandData(signal.data);
		expect(entry?.outcome).toBe("aborted");
		expect(entry?.durationMs).toBeLessThan(4_000);
		expect(signal.status).toBe("info");
		expect(signal.reenter).toBe(false);
	});
});
