/**
 * A bun `--preload` that appends the path of every `@earendil-works/*`
 * module the process loads to the file `PI_LOAD_LOG` names, then loads it
 * unchanged.
 */

import { appendFileSync, readFileSync } from "node:fs";

declare const Bun: {
	plugin(plugin: {
		name: string;
		setup(build: {
			onLoad(
				options: { filter: RegExp },
				callback: (args: { path: string }) => {
					contents: string;
					loader: "js";
				},
			): void;
		}): void;
	}): void;
};

const log = process.env.PI_LOAD_LOG;
if (!log) throw new Error("pi-load-recorder: PI_LOAD_LOG is not set");

Bun.plugin({
	name: "pi-load-recorder",
	setup(build) {
		build.onLoad({ filter: /[\\/]@earendil-works[\\/].*\.m?js$/ }, (args) => {
			appendFileSync(log, `${args.path}\n`);
			return { contents: readFileSync(args.path, "utf8"), loader: "js" };
		});
	},
});
