import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createPrivateReviewWorkspace,
	removePrivateReviewWorkspace,
} from "../orchestration/quality-review-workspace.ts";
import { openTempWorktree } from "./builder-worktree.ts";
import {
	applyPatch,
	readStagedChange,
	readWorktreeChange,
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
 * A review-only run's checkout (`runReview`, which has no builder worktree).
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
	projectRoot: string;
	/** The run's diff base: the checkout starts here. */
	base: string;
	/** The builder's latest patch; undefined when none was written. */
	patchPath: string | undefined;
	/** The builder worktree's project directory: the in-place fallback. */
	builderDir: string;
	signal?: AbortSignal;
}

/**
 * The reviewer's checkout in a build run: a second detached worktree of the
 * diff base with the builder's latest patch applied to its working tree, so
 * the reviewer sees exactly what the builder left and cannot touch the
 * builder worktree. When that checkout cannot be made, the reviewer reads the
 * builder worktree in place, never the caller's.
 */
export async function openBuilderReviewCheckout(
	options: BuilderReviewOptions,
): Promise<ReviewCheckout> {
	try {
		return await patchedCheckout(options);
	} catch (error) {
		return inPlaceCheckout({ ...options, projectRoot: options.builderDir }, [
			`private review checkout unavailable, reviewed in the builder worktree: ${errorMessage(error)}`,
		]);
	}
}

async function patchedCheckout(
	options: BuilderReviewOptions,
): Promise<ReviewCheckout> {
	const { patchPath } = options;
	if (patchPath === undefined) throw new Error("no builder patch was written");
	const checkout = await openTempWorktree({
		projectRoot: options.projectRoot,
		ref: options.base,
		prefix: "cosmonauts-lean-review-",
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
