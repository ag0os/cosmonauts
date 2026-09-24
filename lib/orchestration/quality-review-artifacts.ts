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
	reviewersOpen(): boolean;
	sealReviewers(graceMs?: number): Promise<string[]>;
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
	let reviewersOpen = true;
	const reviewerWrites = new Map<
		Promise<ArtifactRef>,
		{ lens: string; abandoned: boolean }
	>();

	async function write(
		path: string,
		contents: string,
		settings: {
			replace?: boolean;
			metadata?: Record<string, unknown>;
			guard?: () => void;
			emitEvent?: boolean;
		} = {},
	): Promise<ArtifactRef> {
		const persisted = await store.loadRun(ref);
		settings.guard?.();
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
		let linked = false;
		try {
			await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
			settings.guard?.();
			if (settings.replace) {
				await assertNoSymlink(target);
				settings.guard?.();
				await rename(temporary, target);
			} else {
				settings.guard?.();
				await link(temporary, target);
			}
			linked = true;
			settings.guard?.();
		} catch (error) {
			if (linked && settings.guard) await rm(target, { force: true });
			throw error;
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
		try {
			settings.guard?.();
		} catch (error) {
			await rm(target, { force: true });
			throw error;
		}
		if (settings.emitEvent !== false)
			await store.appendEvent(ref, {
				type: "artifact_written",
				runId: run.runId,
				stepId,
				artifact,
			});
		try {
			settings.guard?.();
		} catch (error) {
			await rm(target, { force: true });
			throw error;
		}
		emitted.add(artifact.id);
		references.set(artifact.id, artifact);
		return artifact;
	}

	return {
		write,
		reviewersOpen: () => reviewersOpen,
		async sealReviewers(graceMs = 1000) {
			reviewersOpen = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					Promise.allSettled([...reviewerWrites.keys()]),
					new Promise<void>((resolve) => {
						timer = setTimeout(resolve, graceMs);
					}),
				]);
			} finally {
				if (timer) clearTimeout(timer);
			}
			const abandoned: string[] = [];
			for (const entry of reviewerWrites.values()) {
				entry.abandoned = true;
				abandoned.push(entry.lens);
				await rm(join(root, "qm", "reviewers", `${entry.lens}.md`), {
					force: true,
				});
			}
			return abandoned;
		},
		references: () => [...references.values()],
		writeReviewer(evidence) {
			if (!reviewersOpen) throw new Error("Reviewer evidence window is closed");
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
			const record = `# Reviewer ${lens}\n\nRun: ${evidence.runId}\nLens: ${lens}\nSpawn: ${evidence.spawnId}\nSession: ${evidence.sessionId}\nRole: ${evidence.resolvedRole}\nModel: ${evidence.resolvedModel.provider}/${evidence.resolvedModel.id}\nFinal-text SHA-256: ${evidence.digest}\n\n## Full final text\n\n${fullText}`;
			const state = { lens, abandoned: false };
			const pending = write(`reviewers/${lens}.md`, record, {
				// Reviewer refs enter the completed step result. An event append cannot
				// be abandoned safely once the store has begun persisting it.
				emitEvent: false,
				guard: () => {
					if (state.abandoned)
						throw new Error(`Reviewer write abandoned: ${lens}`);
				},
				metadata: {
					finalTextDigest: evidence.digest,
					spawnId: evidence.spawnId,
					sessionId: evidence.sessionId,
					resolvedRole: evidence.resolvedRole,
					resolvedModel: evidence.resolvedModel,
				},
			});
			reviewerWrites.set(pending, state);
			void pending.then(
				() => reviewerWrites.delete(pending),
				() => reviewerWrites.delete(pending),
			);
			return pending;
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
