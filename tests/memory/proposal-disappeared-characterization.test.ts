import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createConsolidationProposalStore } from "../../lib/memory/consolidation-proposals.ts";
import { useTempDir } from "../helpers/fs.ts";

vi.mock("../../lib/memory/proposal-files.ts", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("../../lib/memory/proposal-files.ts")>();
	return {
		...original,
		async readSafeRegularText(
			options: Parameters<typeof original.readSafeRegularText>[0],
		) {
			if (options.relativePath.endsWith("/vanished.md")) {
				await unlink(join(options.root, options.relativePath));
			}
			return original.readSafeRegularText(options);
		},
	};
});

const tmp = useTempDir("proposal-disappeared-");

describe("proposal materializations during concurrent deletion", () => {
	test("fails the entire read when an enumerated proposal disappears before its body is read", async () => {
		const root = join(tmp.path, "project");
		const directory = join(root, "memory/agent/proposals/living-memory");
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "vanished.md"), "# Concurrently deleted\n");
		const store = createConsolidationProposalStore({ projectRoot: root });
		await expect(store.readMaterializations()).rejects.toThrow(
			"Living-memory proposal disappeared: memory/agent/proposals/living-memory/vanished.md.",
		);
		await expect(store.readMaterializations()).resolves.toEqual([]);
	});
});
