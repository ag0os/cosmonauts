import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { CosmonautsRuntime } from "../lib/runtime.ts";
import { getHostRuntime } from "../lib/runtime-host.ts";
import {
	type PiFlagParseResult,
	type PiFlags,
	parsePiFlags,
} from "./pi-flags.ts";

const VALID_THINKING_LEVELS: ReadonlySet<string> = new Set([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

export interface CliRuntimeOptions {
	completionLabel?: string;
	domain?: string;
	model?: string;
	thinking?: ThinkingLevel;
	profile?: boolean;
	pluginDirs?: string[];
	piFlags: PiFlags;
}

export interface CliRuntimeContext {
	cwd: string;
	runtime: CosmonautsRuntime;
}

interface CliRuntimeOptionParseResult {
	options: CliRuntimeOptions;
	remaining: string[];
	warnings: PiFlagParseResult["warnings"];
}

export function parseThinkingLevel(value: string): ThinkingLevel {
	if (!VALID_THINKING_LEVELS.has(value)) {
		throw new Error(
			`Invalid thinking level "${value}". Valid: ${[...VALID_THINKING_LEVELS].join(", ")}`,
		);
	}
	return value as ThinkingLevel;
}

export function parseCliRuntimeOptions(
	argv: readonly string[],
): CliRuntimeOptionParseResult {
	const piResult = parsePiFlags([...argv], {
		// Preserve `--mode` for `cosmonauts run drive` (where it is a real Drive
		// option) instead of warning/dropping it as a disabled Pi flag. Detect the
		// `run drive` command anywhere in the already-collected args, so a global
		// runtime option preceding the command (e.g. `--domain coding run drive
		// --mode detached`) does not shift it out of a fixed positional slot.
		preserveDisabledFlag: ({ arg, key, remaining }) =>
			key === "mode" &&
			arg === "--mode" &&
			remaining.some((a, idx) => a === "run" && remaining[idx + 1] === "drive"),
	});
	const options: CliRuntimeOptions = { piFlags: piResult.flags };
	const remaining: string[] = [];

	for (let i = 0; i < piResult.remaining.length; i++) {
		const arg = piResult.remaining[i] as string;
		switch (arg) {
			case "-d":
			case "--domain":
				options.domain = readRequiredValue(piResult.remaining, ++i, arg);
				break;
			case "-m":
			case "--model":
				options.model = readRequiredValue(piResult.remaining, ++i, arg);
				break;
			case "--completion-label":
				options.completionLabel = readRequiredValue(
					piResult.remaining,
					++i,
					arg,
				);
				break;
			case "--plugin-dir": {
				const value = readRequiredValue(piResult.remaining, ++i, arg);
				options.pluginDirs = [...(options.pluginDirs ?? []), value];
				break;
			}
			case "--profile":
				options.profile = true;
				break;
			case "-t":
			case "--thinking": {
				const next = piResult.remaining[i + 1];
				if (next && VALID_THINKING_LEVELS.has(next)) {
					options.thinking = parseThinkingLevel(next);
					i += 1;
				} else {
					options.thinking = "high";
				}
				break;
			}
			default:
				remaining.push(arg);
				break;
		}
	}

	return { options, remaining, warnings: piResult.warnings };
}

export async function createCliRuntimeContext(
	options: CliRuntimeOptions,
): Promise<CliRuntimeContext> {
	const cwd = process.cwd();
	const runtime = await getHostRuntime({
		projectRoot: cwd,
		domainOverride: options.domain,
		pluginDirs: options.pluginDirs,
	});
	return { cwd, runtime };
}

function readRequiredValue(
	argv: readonly string[],
	index: number,
	flag: string,
): string {
	const value = argv[index];
	if (!value || value.startsWith("-")) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

/** Inline tools retain the selected CLI scope; standalone helpers may request the base. */
export function getCliExecutionRuntime(
	projectRoot: string,
	selectedRuntime?: CosmonautsRuntime,
): Promise<CosmonautsRuntime> {
	return selectedRuntime
		? Promise.resolve(selectedRuntime)
		: getHostRuntime({ projectRoot });
}
