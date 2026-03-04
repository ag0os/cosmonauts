/**
 * Shared temp-directory helpers for filesystem-oriented tests.
 *
 * Usage:
 *   import { useTempDir } from "../helpers/fs.ts";
 *   const tmp = useTempDir("my-prefix-");
 *   // tmp.path is available inside beforeEach/test/afterEach
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

/**
 * Returns an object whose `.path` property is set to a fresh temp
 * directory before each test and cleaned up after each test.
 *
 * The `prefix` is used as the mkdtemp prefix (e.g. "config-test-").
 */
export function useTempDir(prefix: string): { path: string } {
	const ref = { path: "" };

	beforeEach(async () => {
		ref.path = await mkdtemp(join(tmpdir(), prefix));
	});

	afterEach(async () => {
		await rm(ref.path, { recursive: true, force: true });
	});

	return ref;
}
