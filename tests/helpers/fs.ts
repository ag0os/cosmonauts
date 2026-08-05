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
		// Driver e2e tests hand back control once their artifacts land, while
		// background work (episode capture, lock release) can still be writing
		// under the temp root. A plain recursive rm then races that writer and
		// fails with ENOTEMPTY under parallel suite load, so let rm retry —
		// that is exactly what these options are for. Cleanup is not an
		// assertion, so retrying hides nothing a test was proving.
		await rm(ref.path, {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 50,
		});
	});

	return ref;
}
