/**
 * A bun `--preload` that, when the process exits, writes to the file
 * `PI_LOAD_LOG` names every `@earendil-works/*` module it loaded, as a JSON
 * array. It reads bun's ESM registry and `require.cache` rather than
 * hooking module loading, so ESM and CommonJS modules (`.js`, `.mjs`,
 * `.cjs`) are seen and run unchanged. The file is written even when the
 * array is empty, so a run the recorder missed has no log.
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

declare const Loader: { registry: Map<string, unknown> } | undefined;

const log = process.env.PI_LOAD_LOG;
if (!log) throw new Error("pi-load-recorder: PI_LOAD_LOG is not set");
if (typeof Loader === "undefined")
	throw new Error("pi-load-recorder: bun's Loader.registry is not available");
const require = createRequire(import.meta.url);
const PI_MODULE = /[\\/]@earendil-works[\\/]/;

process.on("exit", () => {
	const esm = [
		...(Loader as { registry: Map<string, unknown> }).registry.keys(),
	];
	const cjs = Object.keys(require.cache);
	const loaded = [...new Set([...esm, ...cjs])].filter((path) =>
		PI_MODULE.test(path),
	);
	writeFileSync(log, JSON.stringify(loaded.sort()));
});
