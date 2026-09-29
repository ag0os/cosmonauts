import { createHash, randomUUID } from "node:crypto";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ProviderProcessOutcome } from "../../../../domains/shared/extensions/project-tools/process-runner.ts";
import { runProviderProcess } from "../../../../domains/shared/extensions/project-tools/process-runner.ts";
import {
	isDestructiveGitCommand,
	outstandingProbeJournal,
	probeJournalDirectory,
} from "../../../../lib/agents/drive-worker-tool-guard.ts";
import { withEntityFileLock } from "../../../../lib/entity-file-lock.ts";

interface Location {
	path: string;
	line: number;
	statementTemplate: string;
}
interface Input {
	locations: Location[];
	testCommand: string;
	timeoutMs?: number;
	confirmProjectExecution: boolean;
}
interface FileRecord {
	path: string;
	sidecar: string;
	original: string;
	instrumented: string;
	mode: number;
}
interface Manifest {
	root: string;
	files: FileRecord[];
}
interface PreparedFile {
	record: FileRecord;
	bytes: Buffer;
	modified: Buffer;
}
type Result = Record<string, unknown>;

const digest = (bytes: Buffer) =>
	createHash("sha256").update(bytes).digest("hex");
const refusal = (reason: string): Result => ({ refused: true, reason });
const recoveryRequired = (journal: string, reason: string): Result => ({
	status: "recovery-required",
	journal,
	reason,
});

async function durableWrite(
	path: string,
	bytes: Buffer | string,
): Promise<void> {
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(bytes);
		await file.sync();
	} finally {
		await file.close();
	}
}

async function syncDirectory(path: string): Promise<void> {
	const directory = await open(path, "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

async function git(root: string, args: string[]): Promise<string> {
	const result = await runProviderProcess({
		executablePath: "git",
		args,
		cwd: root,
	});
	if (result.kind !== "code-exit" || result.code !== 0)
		throw new Error(`git ${args[0]} failed: ${result.stderr}`);
	return result.stdout;
}

async function trackedSnapshot(root: string): Promise<Map<string, string>> {
	const paths = (await git(root, ["ls-files", "-z"]))
		.split("\0")
		.filter(Boolean);
	const snapshot = new Map<string, string>();
	for (const path of paths) {
		try {
			const file = await lstat(join(root, path));
			if (file.isFile())
				snapshot.set(path, digest(await readFile(join(root, path))));
			else if (file.isSymbolicLink())
				snapshot.set(path, `link:${await realpath(join(root, path))}`);
			else snapshot.set(path, `mode:${file.mode}`);
		} catch {
			snapshot.set(path, "missing");
		}
	}
	return snapshot;
}

async function trackedStatus(root: string): Promise<Map<string, string>> {
	const entries = (
		await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=no"])
	).split("\0");
	const result = new Map<string, string>();
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (!entry || entry.length < 4) continue;
		const status = entry.slice(0, 2);
		result.set(entry.slice(3), status);
		if (/[RC]/.test(status)) index++;
	}
	return result;
}

function sideEffects(
	before: Map<string, string>,
	after: Map<string, string>,
	beforeStatus: Map<string, string>,
	afterStatus: Map<string, string>,
	instrumented: Set<string>,
): string[] {
	return [
		...new Set([
			...before.keys(),
			...after.keys(),
			...beforeStatus.keys(),
			...afterStatus.keys(),
		]),
	]
		.filter(
			(path) =>
				!instrumented.has(path) &&
				(before.get(path) !== after.get(path) ||
					beforeStatus.get(path) !== afterStatus.get(path)),
		)
		.sort();
}

async function safeFile(
	root: string,
	path: string,
	allowMissing = false,
): Promise<{ absolute: string; relativePath: string }> {
	if (isAbsolute(path)) throw new Error("locations must be project-relative");
	const absolute = resolve(root, path);
	const relativePath = relative(root, absolute);
	if (
		!relativePath ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`)
	)
		throw new Error("location escapes project root or is not a file");
	let cursor = root;
	const parts = relativePath.split(sep);
	for (const [index, part] of parts.entries()) {
		cursor = join(cursor, part);
		try {
			if ((await lstat(cursor)).isSymbolicLink())
				throw new Error("symlinked location refused");
		} catch (error) {
			if (
				allowMissing &&
				index === parts.length - 1 &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			)
				return { absolute, relativePath };
			throw error;
		}
	}
	if (
		!(await stat(absolute)).isFile() ||
		(await realpath(absolute)) !== absolute
	)
		throw new Error("location must be a contained regular file");
	return { absolute, relativePath };
}

async function prepare(
	root: string,
	locations: Location[],
	journal: string,
): Promise<{ files: PreparedFile[]; markers: string[] }> {
	if (locations.length === 0) throw new Error("at least one location required");
	const groups = new Map<
		string,
		{
			bytes: Buffer;
			mode: number;
			relativePath: string;
			entries: { line: number; statement: string }[];
		}
	>();
	const markers: string[] = [];
	const seen = new Set<string>();
	for (const location of locations) {
		const { absolute, relativePath } = await safeFile(root, location.path);
		if (seen.has(`${absolute}:${location.line}`))
			throw new Error("duplicate location");
		seen.add(`${absolute}:${location.line}`);
		if (
			!Number.isSafeInteger(location.line) ||
			location.line < 1 ||
			!location.statementTemplate.includes("{{hitFile}}") ||
			!location.statementTemplate.includes("{{marker}}")
		)
			throw new Error("invalid line or marker template");
		await git(root, ["ls-files", "--error-unmatch", "--", relativePath]);
		let group = groups.get(absolute);
		if (!group) {
			group = {
				bytes: await readFile(absolute),
				mode: (await stat(absolute)).mode & 0o777,
				relativePath,
				entries: [],
			};
			groups.set(absolute, group);
		}
		const marker = randomUUID().replaceAll("-", "");
		markers.push(marker);
		group.entries.push({
			line: location.line,
			statement: location.statementTemplate
				.replaceAll("{{hitFile}}", join(journal, "hits"))
				.replaceAll("{{marker}}", marker),
		});
	}
	const files: PreparedFile[] = [];
	for (const group of groups.values()) {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(group.bytes);
		const lines = text.split("\n");
		for (const entry of group.entries.sort((a, b) => b.line - a.line)) {
			if (
				entry.line > lines.length ||
				(entry.line === lines.length && lines.at(-1) === "")
			)
				throw new Error("line outside source");
			lines.splice(
				entry.line - 1,
				0,
				entry.statement + (text.includes("\r\n") ? "\r" : ""),
			);
		}
		const modified = Buffer.from(lines.join("\n"));
		files.push({
			bytes: group.bytes,
			modified,
			record: {
				path: group.relativePath,
				sidecar: `sidecar-${files.length}`,
				original: digest(group.bytes),
				instrumented: digest(modified),
				mode: group.mode,
			},
		});
	}
	return { files, markers };
}

async function restore(
	root: string,
	journal: string,
	manifest: Manifest,
	allowCommandChanges = false,
): Promise<string | undefined> {
	if (
		manifest.root !== root ||
		!Array.isArray(manifest.files) ||
		manifest.files.length === 0
	)
		return "invalid journal manifest";
	let error: string | undefined;
	for (const record of manifest.files) {
		try {
			if (
				!/^sidecar-\d+$/.test(record.sidecar) ||
				!/^[a-f0-9]{64}$/.test(record.original) ||
				!/^[a-f0-9]{64}$/.test(record.instrumented)
			)
				throw new Error("invalid journal record");
			const { absolute } = await safeFile(
				root,
				record.path,
				allowCommandChanges,
			);
			const sidecar = join(journal, record.sidecar);
			if (!(await lstat(sidecar)).isFile())
				throw new Error("sidecar is not regular");
			const backup = await readFile(sidecar);
			if (digest(backup) !== record.original)
				throw new Error("sidecar digest mismatch");
			const current = await readFile(absolute).then(
				digest,
				(error: NodeJS.ErrnoException) => {
					if (allowCommandChanges && error.code === "ENOENT") return undefined;
					throw error;
				},
			);
			if (
				!allowCommandChanges &&
				current !== record.original &&
				current !== record.instrumented
			)
				throw new Error("source changed since instrumentation");
			if (current !== record.original)
				await writeFile(
					absolute,
					backup,
					current === undefined ? { flag: "wx" } : undefined,
				);
			await chmod(absolute, record.mode);
			if (digest(await readFile(absolute)) !== record.original)
				throw new Error("restored digest mismatch");
		} catch (cause) {
			error = `${record.path}: ${String(cause)}`;
		}
	}
	return error;
}

async function recover(
	root: string,
	journal: string,
): Promise<string | undefined> {
	try {
		const manifest = JSON.parse(
			await readFile(join(journal, "manifest.json"), "utf8"),
		) as Manifest;
		const failure = await restore(root, journal, manifest);
		if (failure) return failure;
		await rm(journal, { recursive: true, force: true });
		return undefined;
	} catch (error) {
		return String(error);
	}
}

function exitCode(outcome: ProviderProcessOutcome): number | null {
	return outcome.kind === "code-exit" ? outcome.code : null;
}

async function runProbe(
	root: string,
	input: Input,
	signal: AbortSignal,
): Promise<Result> {
	const directory = probeJournalDirectory(root);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	if (((await lstat(directory)).mode & 0o777) !== 0o700)
		return refusal("probe journal directory must be mode 0700");
	return withEntityFileLock(join(directory, "probe.lock"), async () => {
		const outstanding = outstandingProbeJournal(root);
		if (outstanding) {
			const failure = await recover(root, outstanding);
			if (failure) return recoveryRequired(outstanding, failure);
		}
		if (!input.confirmProjectExecution)
			return refusal("explicit project-execution confirmation required");
		if (isDestructiveGitCommand(input.testCommand))
			return refusal("destructive Git command refused");
		if (!input.testCommand.trim()) return refusal("test command required");
		const journal = join(directory, `journal-${randomUUID()}`);
		let prepared: Awaited<ReturnType<typeof prepare>>;
		try {
			prepared = await prepare(root, input.locations, journal);
		} catch (error) {
			return refusal(String(error));
		}
		const before = await trackedSnapshot(root);
		const beforeStatus = await trackedStatus(root);
		await mkdir(journal, { mode: 0o700 });
		const manifest: Manifest = {
			root,
			files: prepared.files.map(({ record }) => record),
		};
		let instrumenting = false;
		let outcome: ProviderProcessOutcome | undefined;
		let failure: string | undefined;
		let restoreFailure: string | undefined;
		const modifiedByCommand: string[] = [];
		try {
			for (const file of prepared.files) {
				await durableWrite(join(journal, file.record.sidecar), file.bytes);
				if (
					digest(await readFile(join(journal, file.record.sidecar))) !==
					file.record.original
				)
					throw new Error("sidecar verification failed");
			}
			const manifestBytes = JSON.stringify(manifest);
			await durableWrite(join(journal, "manifest.json"), manifestBytes);
			if (
				(await readFile(join(journal, "manifest.json"), "utf8")) !==
				manifestBytes
			)
				throw new Error("manifest verification failed");
			await syncDirectory(journal);
			await syncDirectory(directory);
			for (const file of prepared.files) {
				const { absolute } = await safeFile(root, file.record.path);
				if (digest(await readFile(absolute)) !== file.record.original)
					throw new Error("source changed since validation");
			}
			for (const file of prepared.files) {
				const { absolute } = await safeFile(root, file.record.path);
				if (digest(await readFile(absolute)) !== file.record.original)
					throw new Error("source changed since validation");
				instrumenting = true;
				await writeFile(absolute, file.modified);
				if (digest(await readFile(absolute)) !== file.record.instrumented)
					throw new Error("instrumentation verification failed");
			}
			outcome = await runProviderProcess(
				{
					executablePath: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
					args:
						process.platform === "win32"
							? ["/c", input.testCommand]
							: ["-c", input.testCommand],
					cwd: root,
				},
				signal,
				{ timeoutMs: input.timeoutMs ?? 30_000 },
			);
		} catch (error) {
			failure = String(error);
		} finally {
			if (instrumenting) {
				for (const file of prepared.files) {
					try {
						const current = digest(
							await readFile(join(root, file.record.path)),
						);
						if (
							outcome &&
							current !== file.record.instrumented &&
							current !== file.record.original
						)
							modifiedByCommand.push(file.record.path);
					} catch {
						modifiedByCommand.push(file.record.path);
					}
				}
				restoreFailure = await restore(
					root,
					journal,
					manifest,
					outcome !== undefined,
				);
			}
		}
		if (restoreFailure) return recoveryRequired(journal, restoreFailure);
		if (failure || !outcome) {
			await rm(journal, { recursive: true, force: true });
			return refusal(failure ?? "command did not run");
		}
		const after = await trackedSnapshot(root);
		const afterStatus = await trackedStatus(root);
		const changed = [
			...new Set([
				...sideEffects(
					before,
					after,
					beforeStatus,
					afterStatus,
					new Set(manifest.files.map((file) => file.path)),
				),
				...modifiedByCommand,
			]),
		].sort();
		const hitText = await readFile(join(journal, "hits"), "utf8").catch(
			() => "",
		);
		const hits = prepared.markers.map((marker, index) => ({
			path: input.locations[index]?.path,
			line: input.locations[index]?.line,
			count: hitText.split("\n").filter((value) => value === marker).length,
		}));
		await rm(journal, { recursive: true, force: true });
		return {
			hits,
			exitCode: exitCode(outcome),
			commandStatus: outcome.kind,
			stderr: outcome.stderr.slice(-2000),
			sideEffects: changed,
			restored: true,
			usableZero:
				exitCode(outcome) === 0 &&
				changed.length === 0 &&
				hits.some((hit) => hit.count === 0),
		};
	});
}

export default function executionProbe(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "execution_probe",
		label: "Execution probe",
		description:
			"Count execution of source locations under one confirmed project command",
		parameters: Type.Object({
			locations: Type.Array(
				Type.Object({
					path: Type.String(),
					line: Type.Integer(),
					statementTemplate: Type.String(),
				}),
			),
			testCommand: Type.String(),
			timeoutMs: Type.Optional(Type.Number()),
			confirmProjectExecution: Type.Boolean(),
		}),
		execute: async (_id, params, signal, _onUpdate, ctx) => {
			const root = await realpath(ctx.cwd);
			const details = await runProbe(
				root,
				params,
				signal ?? new AbortController().signal,
			);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(details) }],
				details,
			};
		},
	});
}
