/** Explicit, reasoned refresh of the committed Fallow analysis floors. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const categories = {
	"dead-code": {
		command: "dead-code",
		path: ".fallow-baselines/dead-code.json",
	},
	health: { command: "health", path: ".fallow-baselines/health.json" },
	dupes: { command: "dupes", path: ".fallow-baselines/dupes.json" },
} as const;
type Category = keyof typeof categories;

const args = process.argv.slice(2);
function option(name: string): string | undefined {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
}
const root = resolve(option("--root") ?? ".");
const base = option("--base");
const reason = option("--reason");
const requested = args.flatMap((arg, index) =>
	arg === "--category" ? [args[index + 1]] : [],
);
const fallow = option("--fallow") ?? join(root, "node_modules/.bin/fallow");

function run(command: string, argv: string[], allowFindings = false): string {
	const result = spawnSync(command, argv, { cwd: root, encoding: "utf8" });
	if (
		result.error ||
		(result.status !== 0 && !(allowFindings && result.status === 1))
	) {
		throw new Error(
			`${command} ${argv.join(" ")}: ${result.error?.message ?? result.stderr.trim()}`,
		);
	}
	return result.stdout.trim();
}

try {
	if (
		!base ||
		base.startsWith("-") ||
		!reason?.trim() ||
		reason.startsWith("-") ||
		requested.length === 0 ||
		requested.some((item) => !item || !(item in categories))
	) {
		throw new Error(
			"Usage: bun scripts/update-fallow-baselines.ts --base <revision> --reason <text> --category <dead-code|health|dupes> [--category ...] [--root <path>]",
		);
	}
	const commit = run("git", ["rev-parse", "--verify", `${base}^{commit}`]);
	const manifestPath = join(root, ".fallow-baselines/manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
		version: number;
		baselines: Record<
			string,
			{
				path: string;
				sha256: string;
				provenance: Array<Record<string, string>>;
			}
		>;
	};
	if (manifest.version !== 1 || !manifest.baselines)
		throw new Error("invalid baseline manifest");
	const scratch = mkdtempSync(join(tmpdir(), "fallow-baseline-refresh-"));
	try {
		const writes: Array<{ path: string; content: string }> = [];
		for (const category of new Set(requested as Category[])) {
			const { command, path } = categories[category];
			const output = join(scratch, `${category}.json`);
			run(
				fallow,
				[
					command,
					"--save-baseline",
					output,
					"--format",
					"json",
					"--quiet",
					"--no-cache",
				],
				true,
			);
			const content = readFileSync(output, "utf8");
			JSON.parse(content);
			const sha256 = createHash("sha256").update(content).digest("hex");
			const entry = manifest.baselines[category];
			if (!entry || entry.path !== path || !Array.isArray(entry.provenance))
				throw new Error(`invalid manifest entry: ${category}`);
			entry.sha256 = sha256;
			entry.provenance.push({
				action: "refresh",
				base,
				baseCommit: commit,
				sha256,
				reason: reason.trim(),
				recordedAt: new Date().toISOString(),
			});
			writes.push({ path: join(root, path), content });
		}
		for (const write of writes) {
			const staged = `${write.path}.refresh-${process.pid}-${writes.indexOf(write)}.tmp`;
			writeFileSync(staged, write.content);
			try {
				renameSync(staged, write.path);
			} finally {
				rmSync(staged, { force: true });
			}
		}
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
		console.log(
			`Refreshed ${requested.join(", ")} against ${base} (${commit}).`,
		);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
