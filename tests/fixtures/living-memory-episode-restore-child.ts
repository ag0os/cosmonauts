import { link } from "node:fs/promises";
import {
	createDurableMachineFiles,
	createProjectEpisodeConsolidationSource,
} from "../../lib/memory/index.ts";

const [projectRoot] = process.argv.slice(2);
if (projectRoot === undefined) process.exit(2);

const durableFiles = createDurableMachineFiles();
const source = createProjectEpisodeConsolidationSource({
	projectRoot,
	durableFiles: {
		...durableFiles,
		async restoreFile(options) {
			await link(options.sourcePath, options.destinationPath);
			process.exit(86);
		},
	},
});
await source.recover?.();
process.exit(0);
