import { execFile } from "node:child_process";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { writeProjectInstalledDomainPackage } from "../helpers/domain-package-fixture.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("library-cli-startup-");
const exec = promisify(execFile);
const bin = fileURLToPath(new URL("../../bin/cosmonauts", import.meta.url));

test.each([
	"--list-domains",
	"--list-agents",
])("actual bin startup %s is empty without framework content", async (flag) => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	const result = await exec("bun", [bin, flag, "--json"], {
		cwd: tmp.path,
		env: {
			...process.env,
			HOME: home,
			PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
		},
	});
	expect(result.stderr).toBe("");
	expect(JSON.parse(result.stdout)).toEqual([]);
	expect(result.stdout).not.toContain('"coding"');
	expect(result.stdout).not.toContain('"main"');
	expect(result.stdout).not.toContain('"shared"');
});

test("an empty CLI refuses interaction with the no-domain guard", async () => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	await expect(
		exec("bun", [bin, "--print", "hello"], {
			cwd: tmp.path,
			env: { ...process.env, HOME: home },
		}),
	).rejects.toMatchObject({
		code: 1,
		stderr: expect.stringContaining("No runnable default domain installed"),
	});
});

test("an installed synthetic lead is selected by the actual bin without bundled content", async () => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	await writeProjectInstalledDomainPackage(tmp.path, {
		domainId: "studio",
		lead: "scribe",
		agents: [{ id: "scribe" }],
		prompts: { scribe: "ONLY_CONSUMER_PERSONA" },
	});
	const result = await exec("bun", [bin, "--dump-prompt"], {
		cwd: tmp.path,
		env: { ...process.env, HOME: home },
	});
	expect(result.stderr).toBe("");
	expect(result.stdout).toContain("ONLY_CONSUMER_PERSONA");
	expect(result.stdout).toContain("COSMONAUTS_AGENT_ID:studio/scribe");
});
test("a discovered lead-less domain receives the interaction guard", async () => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	const domain = join(tmp.path, ".cosmonauts", "domains", "orphan");
	await mkdir(domain, { recursive: true });
	await writeFile(
		join(domain, "domain.ts"),
		'export default {id:"orphan",description:"Resources only"};',
	);
	await expect(
		exec("bun", [bin, "--print", "hello"], {
			cwd: tmp.path,
			env: { ...process.env, HOME: home },
		}),
	).rejects.toMatchObject({
		code: 1,
		stderr: expect.stringContaining("No runnable default domain installed"),
	});
});

test.each([
	["--list-domains", "--json"],
	["--list-agents", "--json"],
	["--print", "hello"],
])("an installed coding package without shared fails loudly for %s", async (...args) => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	const installed = join(tmp.path, ".cosmonauts", "packages", "coding");
	await mkdir(join(tmp.path, ".cosmonauts", "packages"), { recursive: true });
	// Keep the actual package's relative library imports intact, without installing shared.
	await symlink(
		fileURLToPath(new URL("../../bundled/coding", import.meta.url)),
		installed,
		"dir",
	);
	await expect(
		exec("bun", [bin, ...args], {
			cwd: tmp.path,
			env: { ...process.env, HOME: home },
		}),
	).rejects.toMatchObject({
		code: 1,
		stderr: expect.stringMatching(
			/Domain validation failed[\s\S]*Capability "framework-base" not found/,
		),
	});
});

test("an explicit unknown agent on an empty install names the empty available list", async () => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	await expect(
		exec("bun", [bin, "-a", "unknown", "--print", "hello"], {
			cwd: tmp.path,
			env: { ...process.env, HOME: home },
		}),
	).rejects.toMatchObject({
		code: 1,
		stderr: expect.stringContaining(
			'Unknown agent ID "unknown". Available agents: (none)',
		),
	});
});
