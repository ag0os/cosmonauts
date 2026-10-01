import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createPrivateReviewWorkspace,
	removePrivateReviewWorkspace,
} from "../orchestration/quality-review-workspace.ts";
import {
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
