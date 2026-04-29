/**
 * Pi CLI flag passthrough registry.
 *
 * Controls which flags from Pi's CLI are allowed through cosmonauts.
 * Flip a flag to `true` to enable passthrough, `false` to block it.
 *
 * We parse the passthrough args ourselves (Pi's parseArgs is not exported).
 * The registry is the single source of truth — adding/removing a Pi flag
 * means editing one entry here.
 */

// ============================================================================
// Flag Registry
// ============================================================================

/** Shape of a single flag definition. */
interface FlagDef {
	/** Whether cosmonauts passes this flag through to Pi. */
	enabled: boolean;
	/** CLI flag name(s). First is canonical, rest are aliases. */
	cli: string[];
	/** "boolean" flags take no argument; "string" and "string[]" consume the next arg. */
	type: "boolean" | "string" | "string[]";
}

/**
 * Master registry of Pi CLI flags.
 *
 * To enable/disable a flag, flip `enabled`. To add a new Pi flag,
 * add an entry here — the parser picks it up automatically.
 */
const PI_FLAG_DEFS = {
	// Session management
	continue: { enabled: true, cli: ["--continue", "-c"], type: "boolean" },
	resume: { enabled: true, cli: ["--resume", "-r"], type: "boolean" },
	session: { enabled: true, cli: ["--session"], type: "string" },
	fork: { enabled: true, cli: ["--fork"], type: "string" },
	sessionDir: { enabled: true, cli: ["--session-dir"], type: "string" },
	noSession: { enabled: true, cli: ["--no-session"], type: "boolean" },

	// Model & provider — not yet wired to session creation
	provider: { enabled: false, cli: ["--provider"], type: "string" },
	models: { enabled: false, cli: ["--models"], type: "string" },
	listModels: { enabled: false, cli: ["--list-models"], type: "string" },

	// Tools — agent definitions control tools; CLI override not yet wired
	tools: { enabled: false, cli: ["--tools"], type: "string" },
	noTools: { enabled: false, cli: ["--no-tools"], type: "boolean" },

	// Output & modes — not yet wired to print/interactive mode selection
	mode: { enabled: false, cli: ["--mode"], type: "string" },
	export: { enabled: false, cli: ["--export"], type: "string" },
	verbose: { enabled: false, cli: ["--verbose"], type: "boolean" },
	offline: { enabled: false, cli: ["--offline"], type: "boolean" },

	// Extensions — agent definitions control extensions; not yet wired
	extensions: { enabled: false, cli: ["--extension", "-e"], type: "string[]" },

	// Skills (ad-hoc loading)
	skills: { enabled: false, cli: ["--skill"], type: "string[]" },

	// Prompts — cosmonauts manages its own prompt system
	systemPrompt: { enabled: false, cli: ["--system-prompt"], type: "string" },
	appendSystemPrompt: {
		enabled: false,
		cli: ["--append-system-prompt"],
		type: "string",
	},
	promptTemplates: {
		enabled: false,
		cli: ["--prompt-template"],
		type: "string[]",
	},
	noPromptTemplates: {
		enabled: false,
		cli: ["--no-prompt-templates", "-np"],
		type: "boolean",
	},
	noExtensions: {
		enabled: false,
		cli: ["--no-extensions", "-ne"],
		type: "boolean",
	},
	noSkills: { enabled: false, cli: ["--no-skills", "-ns"], type: "boolean" },
	themes: { enabled: true, cli: ["--theme"], type: "string[]" },
	noThemes: { enabled: true, cli: ["--no-themes"], type: "boolean" },

	// Auth — prefer env vars over CLI flags
	apiKey: { enabled: false, cli: ["--api-key"], type: "string" },
} as const satisfies Record<string, FlagDef>;

type FlagKey = keyof typeof PI_FLAG_DEFS;

// ============================================================================
// Parsed result type
// ============================================================================

/** Parsed Pi flags that cosmonauts passes through. Only enabled flags appear. */
export interface PiFlags {
	// Session
	continue?: boolean;
	resume?: boolean;
	session?: string;
	fork?: string;
	sessionDir?: string;
	noSession?: boolean;
	// Themes
	themes?: string[];
	noThemes?: boolean;
}

// ============================================================================
// Parsing
// ============================================================================

/** Build a lookup from CLI string (e.g. "--continue") → { key, def }. */
function buildCliLookup(): Map<string, { key: FlagKey; def: FlagDef }> {
	const map = new Map<string, { key: FlagKey; def: FlagDef }>();
	for (const [key, def] of Object.entries(PI_FLAG_DEFS)) {
		if (!def.enabled) continue;
		for (const alias of def.cli) {
			map.set(alias, { key: key as FlagKey, def });
		}
	}
	return map;
}

function buildDisabledCliLookup(): Map<string, FlagKey> {
	const map = new Map<string, FlagKey>();
	for (const [key, def] of Object.entries(PI_FLAG_DEFS)) {
		if (def.enabled) continue;
		for (const alias of def.cli) {
			map.set(alias, key as FlagKey);
		}
	}
	return map;
}

const CLI_LOOKUP = buildCliLookup();
const DISABLED_CLI_LOOKUP = buildDisabledCliLookup();

export interface PiFlagParseResult {
	/** Enabled Pi flags extracted from argv. */
	flags: PiFlags;
	/** Remaining args that were not Pi flags (positional args, @files, etc.). */
	remaining: string[];
	/** Warnings for disabled flags the user tried to use. */
	warnings: string[];
}

/**
 * Parse argv, extracting enabled Pi flags and returning the rest.
 *
 * Disabled flags produce a warning and are dropped.
 * Unknown flags are left in `remaining` for the caller.
 */
export function parsePiFlags(argv: string[]): PiFlagParseResult {
	const flags: Record<string, unknown> = {};
	const remaining: string[] = [];
	const warnings: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string; // bounds-checked by loop condition
		if (CLI_LOOKUP.has(arg)) {
			i = consumeEnabledFlag(argv, i, flags);
			continue;
		}

		if (DISABLED_CLI_LOOKUP.has(arg)) {
			i = consumeDisabledFlag(argv, i, warnings);
			continue;
		}

		remaining.push(arg);
	}

	return { flags: postProcessPiFlags(flags), remaining, warnings };
}

function consumeEnabledFlag(
	argv: readonly string[],
	index: number,
	flags: Record<string, unknown>,
): number {
	const arg = argv[index] as string;
	const match = CLI_LOOKUP.get(arg);
	if (!match) {
		return index;
	}

	if (match.def.type === "boolean") {
		flags[match.key] = true;
		return index;
	}

	const next = argv[index + 1] as string | undefined;
	if (match.def.type === "string") {
		return consumeEnabledStringFlag(match.key, next, index, flags);
	}

	return consumeEnabledStringArrayFlag(match.key, next, index, flags);
}

function consumeEnabledStringFlag(
	key: FlagKey,
	next: string | undefined,
	index: number,
	flags: Record<string, unknown>,
): number {
	if (key === "listModels" && (next === undefined || next.startsWith("-"))) {
		flags[key] = true;
		return index;
	}

	if (next === undefined) {
		return index;
	}

	flags[key] = next;
	return index + 1;
}

function consumeEnabledStringArrayFlag(
	key: FlagKey,
	next: string | undefined,
	index: number,
	flags: Record<string, unknown>,
): number {
	if (next === undefined) {
		return index;
	}

	const values = readStringArrayFlag(flags[key]);
	values.push(next);
	flags[key] = values;
	return index + 1;
}

function readStringArrayFlag(value: unknown): string[] {
	return Array.isArray(value) ? value.filter(isString) : [];
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function consumeDisabledFlag(
	argv: readonly string[],
	index: number,
	warnings: string[],
): number {
	const arg = argv[index] as string;
	const disabledKey = DISABLED_CLI_LOOKUP.get(arg);
	if (!disabledKey) {
		return index;
	}

	const def = PI_FLAG_DEFS[disabledKey];
	warnings.push(
		`Flag "${arg}" is not supported by cosmonauts (Pi flag "${disabledKey}" is disabled)`,
	);

	if (def.type !== "boolean" && index + 1 < argv.length) {
		return index + 1;
	}

	return index;
}

function postProcessPiFlags(flags: Record<string, unknown>): PiFlags {
	if (typeof flags.models === "string") {
		flags.models = flags.models.split(",").map((s) => s.trim());
	}
	if (typeof flags.tools === "string") {
		flags.tools = flags.tools.split(",").map((s) => s.trim());
	}

	return flags as PiFlags;
}
