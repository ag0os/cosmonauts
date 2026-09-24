import { spawn } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("standalone Quality Manager CLI", () => {
	it.each([
		1, 2,
	])("leaves %i existing plan directories byte-identical without explicit context", async (planCount) => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-cli-planless-"));
		try {
			const planRoot = join(projectRoot, "missions", "plans");
			await mkdir(planRoot, { recursive: true });
			for (let index = 0; index < planCount; index++) {
				const directory = join(planRoot, `plan-${index}`);
				await mkdir(directory);
				await writeFile(join(directory, "plan.md"), `plan ${index}\n`);
			}
			const before = await snapshot(planRoot);
			const result = await runCli(projectRoot);
			expect(result.code).toBe(1);
			expect(result.stdout).toMatch(
				/^qm-[a-f0-9-]+: Private workspace preparation refused: ENOENT: no such file or directory, lstat /,
			);
			const runId = result.stdout.match(/^(qm-[a-f0-9-]+):/)?.[1];
			const lifecycle = await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					runId ?? "",
					"artifacts",
					"qm",
					"lifecycle.jsonl",
				),
				"utf8",
			);
			const reserved = lifecycle
				.trim()
				.split("\n")
				.map(
					(line) => JSON.parse(line) as { phase: string; workspace?: string },
				)
				.find((event) => event.phase === "workspace-reserved")?.workspace;
			expect(reserved).toBeTruthy();
			expect((await import("node:fs")).existsSync(reserved ?? "")).toBe(false);
			expect(await snapshot(planRoot)).toEqual(before);
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	}, 20_000);
});

async function snapshot(root: string): Promise<Record<string, string>> {
	const bytes: Record<string, string> = {};
	for (const directory of await readdir(root)) {
		for (const file of await readdir(join(root, directory))) {
			bytes[`${directory}/${file}`] = (
				await readFile(join(root, directory, file))
			).toString("hex");
		}
	}
	return bytes;
}

async function runCli(
	cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			"bun",
			[
				join(repoRoot, "bin", "cosmonauts"),
				"--plugin-dir",
				join(repoRoot, "bundled", "coding"),
				"--print",
				"-a",
				"coding/quality-manager",
				"Review only.",
			],
			{ cwd, stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.once("error", reject);
		child.once("exit", (code) => resolve({ code, stdout, stderr }));
	});
}
