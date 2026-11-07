import { extractAgentIdFromSystemPrompt } from "../agents/runtime-identity.ts";
import type { MemoryWarning } from "../memory/types.ts";

interface EpisodeCaptureOptions {
	readonly episodeSource: string;
	readonly reportEpisodeWarning: (warning: MemoryWarning) => Promise<void>;
}

export interface EpisodeCaptureGrant {
	readonly enabled?: boolean;
	readonly source?: string;
}

export function createEpisodeCapture<T>(options: {
	readonly enabled?: boolean;
	readonly source?: string;
	readonly cwd: string;
	readonly systemPrompt: string;
	readonly createManager: (
		cwd: string,
		captureOptions?: EpisodeCaptureOptions,
	) => T;
}): { readonly manager: T; readonly warnings: MemoryWarning[] } {
	const warnings: MemoryWarning[] = [];
	const episodeSource = options.enabled
		? (options.source ?? extractAgentIdFromSystemPrompt(options.systemPrompt))
		: undefined;
	const captureOptions = episodeSource
		? {
				episodeSource,
				reportEpisodeWarning: async (warning: MemoryWarning) => {
					if (warnings.length === 0) warnings.push(warning);
				},
			}
		: undefined;
	return {
		manager: options.createManager(options.cwd, captureOptions),
		warnings,
	};
}

export function appendEpisodeWarning(
	text: string,
	warnings: readonly MemoryWarning[],
): string {
	const warning = warnings[0];
	if (!warning) return text;
	const location = warning.path ? `${warning.path}: ` : "";
	return `${text}\nWarning: ${location}${warning.message}`;
}
