import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
test("exports retain all stable deep entries with explicit friendly aliases and no wildcard", async () => {
	const pkg = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	);
	const config = await readFile(
		new URL("../fallow.toml", import.meta.url),
		"utf8",
	);
	const section = config.split("entry = [")[1]?.split("]")[0] ?? "";
	const entries = [...section.matchAll(/"([^"]+)"/g)].map(
		(match) => match[1] ?? "",
	);
	expect(entries).toHaveLength(24);
	for (const entry of entries) {
		expect(pkg.exports[`./${entry}`]).toBe(`./${entry}`);
		const alias = entry
			.replace(/^lib\//, "")
			.replace(/\/index\.ts$/, "")
			.replace(/\.ts$/, "");
		expect(require.resolve(`cosmonauts/${alias}`)).toBe(
			require.resolve(`cosmonauts/${entry}`),
		);
	}
	expect(Object.keys(pkg.exports).some((key) => key.includes("*"))).toBe(false);
	expect(() =>
		require.resolve("cosmonauts/lib/agents/session-assembly.ts"),
	).toThrow(/not defined by "exports"/);
	expect(require.resolve("cosmonauts")).toMatch(/lib\/index\.ts$/);
});
