import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createCreateProgram,
	scaffoldDomain,
} from "../../../cli/create/subcommand.ts";

describe("createCreateProgram", () => {
	it("returns a Commander program", () => {
		const program = createCreateProgram();
		expect(program.name()).toBe("cosmonauts create");
	});

	it("registers the domain subcommand", () => {
		const program = createCreateProgram();
		const commandNames = program.commands.map((c) => c.name());
		expect(commandNames).toContain("domain");
	});
});

describe("scaffoldDomain", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await import("node:fs/promises").then((fs) =>
			fs.mkdtemp(join(tmpdir(), "create-domain-test-")),
		);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates the package directory at ./<name>/", async () => {
		await scaffoldDomain("mypkg", tempDir);
		const { stat } = await import("node:fs/promises");
		const s = await stat(join(tempDir, "mypkg"));
		expect(s.isDirectory()).toBe(true);
	});

	it("generates cosmonauts.json with correct name, version, and domains", async () => {
		await scaffoldDomain("mypkg", tempDir);
		const raw = await readFile(
			join(tempDir, "mypkg", "cosmonauts.json"),
			"utf-8",
		);
		const manifest = JSON.parse(raw) as Record<string, unknown>;

		expect(manifest.name).toBe("mypkg");
		expect(manifest.version).toBe("0.1.0");
		expect(manifest.domains).toEqual([{ name: "mypkg", path: "mypkg" }]);
	});

	it("generates domain.ts that exports a DomainManifest with correct id and portable = false", async () => {
		await scaffoldDomain("mypkg", tempDir);
		const source = await readFile(
			join(tempDir, "mypkg", "mypkg", "domain.ts"),
			"utf-8",
		);

		expect(source).toContain("export const manifest");
		expect(source).toContain('id: "mypkg"');
		expect(source).toContain("portable: false");
	});

	it("creates all required subdirectories", async () => {
		await scaffoldDomain("mypkg", tempDir);
		const { stat } = await import("node:fs/promises");
		const domainDir = join(tempDir, "mypkg", "mypkg");

		for (const sub of [
			"agents",
			"prompts",
			"capabilities",
			"skills",
			"extensions",
		]) {
			const s = await stat(join(domainDir, sub));
			expect(s.isDirectory()).toBe(true);
		}
	});

	it("throws an error if the target directory already exists", async () => {
		await mkdir(join(tempDir, "mypkg"), { recursive: true });
		await expect(scaffoldDomain("mypkg", tempDir)).rejects.toThrow(
			'Directory "mypkg" already exists',
		);
	});

	it("works for a different domain name", async () => {
		await scaffoldDomain("devops", tempDir);
		const raw = await readFile(
			join(tempDir, "devops", "cosmonauts.json"),
			"utf-8",
		);
		const manifest = JSON.parse(raw) as Record<string, unknown>;
		expect(manifest.name).toBe("devops");
		expect(manifest.domains).toEqual([{ name: "devops", path: "devops" }]);

		const source = await readFile(
			join(tempDir, "devops", "devops", "domain.ts"),
			"utf-8",
		);
		expect(source).toContain('id: "devops"');
	});
});
