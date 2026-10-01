import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createPrivateReviewWorkspace,
	removePrivateReviewWorkspace,
} from "../orchestration/quality-review-workspace.ts";
import {
	addDetachedWorktree,
	applyPatch,
	readPrefix,
	readStagedChange,
	readWorktreeChange,
	removeWorktree,
	type WorktreeChange,
} from "./git.ts";
import type { ReviewWorkspaceKind } from "./types.ts";

export interface ReviewCheckout extends WorktreeChange {
	kind: ReviewWorkspaceKind;
	/** Where the reviewer runs. */
	worktree: string;
	warnings: string[];
	/** Resolves to a warning instead of throwing. */
	dispose(): Promise<string | undefined>;
}

interface OpenOptions {
	projectRoot: string;
	base: string;
	signal?: AbortSignal;
}

/**
 * A review-only run's checkout (`runReview`, which has no builder clone).
 * Prefers a private clone so the reviewer cannot touch the worktree. The clone
 * needs a main, master or origin/main ref and refuses linked worktrees, so on
 * any failure the reviewer reads the worktree in place instead.
 */
export async function openReviewCheckout(
	options: OpenOptions,
): Promise<ReviewCheckout> {
	const reserved = await mkdtemp(join(tmpdir(), "cosmonauts-lean-review-"));
	try {
		return await privateCheckout(options, reserved);
	} catch (error) {
		const cleanup = await removeQuietly(reserved);
		return inPlaceCheckout(options, [
			`private review workspace unavailable, reviewed in place: ${errorMessage(error)}`,
			...(cleanup ? [cleanup] : []),
		]);
	}
}

interface BuilderReviewOptions {
	/** The run's diff base: the checkout starts here. */
	base: string;
	/** The builder's latest patch; undefined when none was written. */
	patchPath: string | undefined;
	/** The builder clone's project directory: the checkout's repository, and the in-place fallback. */
	builderDir: string;
	signal?: AbortSignal;
}

/**
 * The reviewer's checkout in a build run: a detached worktree of the diff
 * base, added to the builder's clone (never to the caller's repository),
 * with the builder's latest patch applied to its working tree, so the
 * reviewer sees exactly what the builder left and cannot touch the
 * builder's checkout. When that checkout cannot be made, the reviewer reads
 * the builder clone in place, never the caller's tree.
 */
export async function openBuilderReviewCheckout(
	options: BuilderReviewOptions,
): Promise<ReviewCheckout> {
	try {
		return await patchedCheckout(options);
	} catch (error) {
		return inPlaceCheckout({ ...options, projectRoot: options.builderDir }, [
			`private review checkout unavailable, reviewed in the builder clone: ${errorMessage(error)}`,
		]);
	}
}

async function patchedCheckout(
	options: BuilderReviewOptions,
): Promise<ReviewCheckout> {
	const { patchPath } = options;
	if (patchPath === undefined) throw new Error("no builder patch was written");
	const checkout = await openTempWorktree({
		projectRoot: options.builderDir,
		ref: options.base,
		...(options.signal ? { signal: options.signal } : {}),
	});
	try {
		if ((await stat(patchPath)).size > 0)
			await applyPatch({ cwd: checkout.root, patchPath });
		const change = await readWorktreeChange({
			cwd: checkout.projectDir,
			base: options.base,
			signal: options.signal,
		});
		return {
			kind: "private",
			worktree: checkout.projectDir,
			...change,
			warnings: [],
			dispose: async () => joinWarnings(await checkout.dispose()),
		};
	} catch (error) {
		await checkout.dispose();
		throw error;
	}
}

/** A detached temporary checkout of a repository. */
interface TempWorktree {
	/** The checkout's top level. */
	root: string;
	/** The checkout's counterpart of the project root. */
	projectDir: string;
	/** Removes the checkout; resolves to warnings and never throws. */
	dispose(): Promise<string[]>;
}

/**
 * Adds a detached worktree of `ref` under a fresh temp directory; only
 * `projectRoot`'s worktree metadata changes. A failure part-way removes
 * what was made before it throws.
 */
async function openTempWorktree(options: {
	projectRoot: string;
	ref: string;
	signal?: AbortSignal;
}): Promise<TempWorktree> {
	const scratch = await mkdtemp(join(tmpdir(), "cosmonauts-lean-review-"));
	const root = join(scratch, "checkout");
	const dispose = () => disposeTempWorktree(options.projectRoot, scratch, root);
	try {
		const prefix = await readPrefix({
			cwd: options.projectRoot,
			signal: options.signal,
		});
		await addDetachedWorktree({
			cwd: options.projectRoot,
			path: root,
			ref: options.ref,
			signal: options.signal,
		});
		return { root, projectDir: join(root, prefix), dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}

async function disposeTempWorktree(
	projectRoot: string,
	scratch: string,
	root: string,
): Promise<string[]> {
	const warnings = await removeWorktree({ cwd: projectRoot, path: root });
	await rm(scratch, { recursive: true, force: true }).catch(
		(error: unknown) => {
			warnings.push(`could not delete ${scratch}: ${errorMessage(error)}`);
		},
	);
	return warnings;
}

function joinWarnings(warnings: readonly string[]): string | undefined {
	return warnings.length > 0 ? warnings.join("; ") : undefined;
}

async function privateCheckout(
	options: OpenOptions,
	reserved: string,
): Promise<ReviewCheckout> {
	const workspace = await createPrivateReviewWorkspace(
		options.projectRoot,
		reserved,
		{ deferMaterials: true },
	);
	const change = await readStagedChange({
		cwd: workspace.workspaceRoot,
		base: options.base,
		signal: options.signal,
	});
	return {
		kind: "private",
		worktree: workspace.workspaceRoot,
		...change,
		warnings: [],
		dispose: () => removeQuietly(reserved),
	};
}

async function inPlaceCheckout(
	options: OpenOptions,
	warnings: string[],
): Promise<ReviewCheckout> {
	const change = await readWorktreeChange({
		cwd: options.projectRoot,
		base: options.base,
		signal: options.signal,
	});
	return {
		kind: "in-place",
		worktree: options.projectRoot,
		...change,
		warnings,
		dispose: async () => undefined,
	};
}

async function removeQuietly(reserved: string): Promise<string | undefined> {
	try {
		await removePrivateReviewWorkspace(reserved);
		return undefined;
	} catch (error) {
		return `could not remove private review workspace ${reserved}: ${errorMessage(error)}`;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
