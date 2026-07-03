import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	createServeProgram,
	runServeCommand,
	type ServeStartupResult,
} from "../../../cli/serve/subcommand.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("serve-command-");

describe("cosmonauts serve command", () => {
	test("starts the read-only artifact viewer server and prints the local URL", async () => {
		const output: string[] = [];
		let started: ServeStartupResult | undefined;
		const program = createServeProgram({
			projectRoot: tmp.path,
			writeOutput: (line) => output.push(line),
			onStarted: (result) => {
				started = result;
			},
		});

		try {
			await program.parseAsync(["--host", "127.0.0.1", "--port", "0"], {
				from: "user",
			});

			expect(started).toBeDefined();
			if (!started) {
				throw new Error("serve command did not report startup");
			}
			expect(started.server.listening).toBe(true);
			expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
			expect(output).toEqual([
				`Serving Cosmonauts artifacts at ${started.url}`,
			]);

			const response = await fetch(`${started.url}plans/`);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain("No plans found");
			await expect(
				access(join(tmp.path, "missions", "tasks")),
			).rejects.toThrow();
		} finally {
			if (started) {
				await closeServer(started);
			}
		}
	});

	test("keeps the server running when opening the browser fails @cosmo-behavior plan:code-structure-map#B-020", async () => {
		const output: string[] = [];
		const warnings: string[] = [];
		const openBrowser = vi.fn(async () => {
			throw new Error("opener unavailable");
		});

		const result = await runServeCommand(
			{
				projectRoot: tmp.path,
				host: "127.0.0.1",
				port: 0,
				open: true,
			},
			{
				openBrowser,
				writeOutput: (line) => output.push(line),
				writeWarning: (line) => warnings.push(line),
			},
		);

		try {
			expect(result.server.listening).toBe(true);
			expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
			expect(output).toEqual([`Serving Cosmonauts artifacts at ${result.url}`]);
			expect(openBrowser).toHaveBeenCalledWith(result.url);
			expect(result.openWarning).toBe(
				"Warning: failed to open browser: opener unavailable",
			);
			expect(warnings).toEqual([result.openWarning]);
		} finally {
			await closeServer(result);
		}
	});

	test("does not add static export or file-watching behavior in W1", async () => {
		const source = await readFile(
			join(process.cwd(), "cli", "serve", "subcommand.ts"),
			"utf-8",
		);

		expect(source).not.toContain("fs.watch");
		expect(source).not.toContain("watchFile");
		expect(source).not.toContain("chokidar");
		expect(source).not.toContain("static export");
	});
});

async function closeServer(result: ServeStartupResult): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		result.server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
