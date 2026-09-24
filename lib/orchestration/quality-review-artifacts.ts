import { createHash, randomUUID } from "node:crypto";
import {
	link,
	lstat,
	mkdir,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import type {
	ArtifactRef,
	RunRecord,
	RunStore,
} from "../durable-runtime/types.ts";

export interface QualityReviewArtifactSink {
	write(
		path: string,
		contents: string,
		options?: { replace?: boolean; metadata?: Record<string, unknown> },
	): Promise<ArtifactRef>;
	writeReviewer(evidence: ReviewerEvidence): Promise<ArtifactRef>;
	references(): ArtifactRef[];
}

export interface ReviewerEvidence {
	readonly runId: string;
	readonly lens: string;
	readonly spawnId: string;
	readonly sessionId: string;
	readonly resolvedRole: string;
	readonly resolvedModel: { readonly provider: string; readonly id: string };
	readonly outcome: "success" | "failed";
	readonly digest: string;
	readonly fullText: string;
}

/** Host-only path authority. Callers provide a loaded run record, never an agent path. */
export function createQualityReviewArtifactSink(options: {
	store: RunStore;
	run: RunRecord;
	stepId?: string;
}): QualityReviewArtifactSink {
	const { store, run, stepId } = options;
	const root = resolve(run.artifactsDir);
	const ref = { scope: run.scope, runId: run.runId };
	const emitted = new Set<string>();
	const references = new Map<string, ArtifactRef>();

	async function write(
		path: string,
		contents: string,
		settings: { replace?: boolean; metadata?: Record<string, unknown> } = {},
	): Promise<ArtifactRef> {
		const persisted = await store.loadRun(ref);
		if (
			!persisted ||
			persisted.runDir !== run.runDir ||
			persisted.artifactsDir !== run.artifactsDir
		) {
			throw new Error("Artifact sink run record does not match persisted run");
		}
		if ((await lstat(root)).isSymbolicLink())
			throw new Error("Artifact root is a symlink");
		if ((await lstat(run.runDir)).isSymbolicLink())
			throw new Error("Run directory is a symlink");
		const runReal = await realpath(run.runDir);
		const rootReal = await realpath(root);
		if (!rootReal.startsWith(`${runReal}${sep}`))
			throw new Error("Artifact root escapes run");
		if (
			isAbsolute(path) ||
			/^[a-zA-Z]:[\\/]/.test(path) ||
			path
				.split(/[\\/]/)
				.some((part) => part === ".." || part === "." || part === "")
		) {
			throw new Error(`Unsafe artifact path: ${path}`);
		}
		const target = validateRelativePath(root, `qm/${path}`);
		await ensureSafeParent(root, dirname(target));
		const temporary = join(
			dirname(target),
			`.${basename(target)}.${randomUUID()}.tmp`,
		);
		try {
			await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
			if (settings.replace) {
				await assertNoSymlink(target);
				await rename(temporary, target);
			} else {
				await link(temporary, target);
			}
		} finally {
			await rm(temporary, { force: true });
		}
		const artifact: ArtifactRef = {
			id: `qm/${path}`,
			path: target,
			kind: "quality-review",
			metadata: {
				...settings.metadata,
				sha256: createHash("sha256").update(contents).digest("hex"),
			},
		};
		await store.appendEvent(ref, {
			type: "artifact_written",
			runId: run.runId,
			stepId,
			artifact,
		});
		emitted.add(artifact.id);
		references.set(artifact.id, artifact);
		return artifact;
	}

	return {
		write,
		references: () => [...references.values()],
		writeReviewer(evidence) {
			const { lens, fullText } = evidence;
			if (!/^[a-z0-9][a-z0-9-]*$/.test(lens))
				throw new Error("Invalid reviewer lens");
			if (evidence.runId !== run.runId)
				throw new Error("Reviewer evidence belongs to another run");
			if (
				!evidence.spawnId ||
				!evidence.sessionId ||
				!evidence.resolvedRole ||
				!evidence.resolvedModel.provider ||
				!evidence.resolvedModel.id
			)
				throw new Error("Reviewer evidence is missing host correlation");
			if (evidence.outcome !== "success")
				throw new Error("Reviewer did not complete successfully");
			if (fullText.trim() === "") throw new Error("Empty reviewer evidence");
			if (
				createHash("sha256").update(fullText).digest("hex") !== evidence.digest
			)
				throw new Error("Reviewer evidence digest mismatch");
			const id = `qm/reviewers/${lens}.md`;
			if (emitted.has(id))
				throw new Error(`Duplicate reviewer evidence: ${lens}`);
			return write(`reviewers/${lens}.md`, fullText, {
				metadata: {
					spawnId: evidence.spawnId,
					sessionId: evidence.sessionId,
					resolvedRole: evidence.resolvedRole,
					resolvedModel: evidence.resolvedModel,
				},
			});
		},
	};
}

function validateRelativePath(root: string, path: string): string {
	if (
		isAbsolute(path) ||
		path
			.split(/[\\/]/)
			.some((part) => part === ".." || part === "" || part === ".")
	) {
		throw new Error(`Unsafe artifact path: ${path}`);
	}
	const target = resolve(root, path);
	const rest = relative(root, target);
	if (
		rest === "" ||
		rest.startsWith(`..${sep}`) ||
		rest === ".." ||
		isAbsolute(rest)
	) {
		throw new Error(`Artifact path escapes run: ${path}`);
	}
	return target;
}

async function ensureSafeParent(root: string, parent: string): Promise<void> {
	const rootReal = await realpath(root);
	let cursor = root;
	for (const part of relative(root, parent).split(sep).filter(Boolean)) {
		cursor = join(cursor, part);
		try {
			await mkdir(cursor);
		} catch (error) {
			if (!isExist(error)) throw error;
		}
		const stat = await lstat(cursor);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new Error(`Unsafe artifact parent: ${cursor}`);
		const real = await realpath(cursor);
		if (real !== rootReal && !real.startsWith(`${rootReal}${sep}`))
			throw new Error(`Artifact parent escapes run: ${cursor}`);
	}
}

async function assertNoSymlink(path: string): Promise<void> {
	try {
		if ((await lstat(path)).isSymbolicLink())
			throw new Error(`Artifact target is a symlink: ${path}`);
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
}

function isExist(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "EEXIST"
	);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
