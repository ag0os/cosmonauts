import type { AgentPackage } from "../../agent-packages/types.ts";
import type { ThinkingLevel } from "../../agents/types.ts";
import type { LeanBackendKind, RequestedModel } from "../types.ts";

/** What the manifest says when the harness was asked for no model. */
export const HARNESS_DEFAULT_MODEL = "harness default";

const CODEX_PROVIDER_PREFIX = "openai-codex/";
const EFFORT_KEY = "model_reasoning_effort";

/**
 * Codex has no `off` or `minimal` reasoning effort, so both ask for its
 * lowest, and no `max`, which asks for its highest.
 */
const CODEX_EFFORT = {
	off: "low",
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "xhigh",
	max: "xhigh",
} as const satisfies Record<ThinkingLevel, string>;

const CODEX_MODEL_FLAGS: ReadonlySet<string> = new Set(["--model", "-m"]);
const CODEX_CONFIG_FLAGS: ReadonlySet<string> = new Set(["--config", "-c"]);
const CODEX_PROFILE_FLAGS: ReadonlySet<string> = new Set(["--profile", "-p"]);
const CODEX_LOCAL_PROVIDER_FLAGS: ReadonlySet<string> = new Set([
	"--local-provider",
]);
const CODEX_VALUE_FLAGS: readonly ReadonlySet<string>[] = [
	CODEX_MODEL_FLAGS,
	CODEX_CONFIG_FLAGS,
	CODEX_PROFILE_FLAGS,
	CODEX_LOCAL_PROVIDER_FLAGS,
];
/** Claude's only model flag; its `-c` is the boolean `--continue`. */
const CLAUDE_MODEL_FLAGS: ReadonlySet<string> = new Set(["--model"]);

export interface HarnessModel {
	/** Arguments to add before the caller's own. */
	args: string[];
	requested: RequestedModel;
}

/**
 * The model flags a role's package asks for, and what the harness was asked
 * for in all. Codex gets `--model` and `model_reasoning_effort` only for an
 * `openai-codex/` model; Claude gets no mapping. A model or effort the
 * caller's arguments already set is not added again, and is what the
 * record names; a caller who picks the model through a profile or another
 * provider gets neither `--model` nor the role's effort, and the record
 * names that argument and only an effort the caller set.
 */
export function harnessModel(options: {
	kind: Exclude<LeanBackendKind, "pi">;
	agentPackage: AgentPackage;
	extraArgs: readonly string[];
}): HarnessModel {
	if (options.kind === "claude-cli")
		return {
			args: [],
			requested: {
				model: claudeCallerModel(options.extraArgs) ?? HARNESS_DEFAULT_MODEL,
			},
		};
	const caller = codexCallerChoice(options.extraArgs);
	const own = codexModel(options.agentPackage);
	const routed = caller.route !== undefined;
	const callerPicksModel = caller.model !== undefined || routed;
	// The role's effort is mapped for its own model: a route picks another.
	const ownEffort = routed ? undefined : own.effort;
	const args = [
		...(own.model && !callerPicksModel ? ["--model", own.model] : []),
		...(ownEffort && caller.effort === undefined
			? ["-c", `${EFFORT_KEY}=${ownEffort}`]
			: []),
	];
	const model =
		caller.model ??
		(routed ? `caller: ${caller.route}` : undefined) ??
		own.model ??
		HARNESS_DEFAULT_MODEL;
	const effort = caller.effort ?? ownEffort;
	return { args, requested: effort ? { model, effort } : { model } };
}

function codexModel(agentPackage: AgentPackage): {
	model?: string;
	effort?: string;
} {
	const { model, thinkingLevel } = agentPackage;
	if (!model?.startsWith(CODEX_PROVIDER_PREFIX)) return {};
	const id = model.slice(CODEX_PROVIDER_PREFIX.length);
	return thinkingLevel
		? { model: id, effort: CODEX_EFFORT[thinkingLevel] }
		: { model: id };
}

interface CodexCallerChoice {
	model?: string;
	effort?: string;
	/**
	 * The argument that picks the model without naming it: a profile, a
	 * local provider or a `model_provider`.
	 */
	route?: string;
}

/**
 * What the caller's codex arguments choose, up to `--`: a model
 * (`--model`, `-m`, `-c model=`), an effort (`-c model_reasoning_effort=`)
 * or a route to a model (`--profile`, `-p`, `--oss`, `--local-provider`,
 * `-c model_provider=`).
 */
function codexCallerChoice(args: readonly string[]): CodexCallerChoice {
	const found: CodexCallerChoice = {};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (arg === "--") break;
		Object.assign(found, codexArgChoice(arg, args[index + 1]));
		if (CODEX_VALUE_FLAGS.some((flags) => flags.has(arg))) index += 1;
	}
	return found;
}

function codexArgChoice(
	arg: string,
	next: string | undefined,
): CodexCallerChoice {
	if (arg === "--oss") return { route: "--oss" };
	const model = flagValue(CODEX_MODEL_FLAGS, arg, next);
	if (model !== undefined) return { model };
	const config = flagValue(CODEX_CONFIG_FLAGS, arg, next);
	if (config !== undefined) return configChoice(config);
	const profile = flagValue(CODEX_PROFILE_FLAGS, arg, next);
	if (profile !== undefined) return { route: `--profile ${profile}` };
	const provider = flagValue(CODEX_LOCAL_PROVIDER_FLAGS, arg, next);
	if (provider !== undefined) return { route: `--local-provider ${provider}` };
	return {};
}

function configChoice(config: string): CodexCallerChoice {
	const [key, value] = splitConfig(config);
	if (key === "model") return { model: value };
	if (key === EFFORT_KEY) return { effort: value };
	if (key === "model_provider") return { route: `-c model_provider=${value}` };
	return {};
}

/** `--model x` or `--model=x`, up to `--`. */
function claudeCallerModel(args: readonly string[]): string | undefined {
	let model: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (arg === "--") break;
		model = flagValue(CLAUDE_MODEL_FLAGS, arg, args[index + 1]) ?? model;
		if (CLAUDE_MODEL_FLAGS.has(arg)) index += 1;
	}
	return model;
}

/**
 * The value `arg` gives one of `flags`, as clap reads it: the next
 * argument, the part after `=`, or, for a short flag, the rest of the
 * argument (`-mgpt-x`).
 */
function flagValue(
	flags: ReadonlySet<string>,
	arg: string,
	next: string | undefined,
): string | undefined {
	if (flags.has(arg)) return next;
	const equals = arg.indexOf("=");
	if (equals !== -1 && flags.has(arg.slice(0, equals)))
		return arg.slice(equals + 1);
	if (arg.length > 2 && !arg.startsWith("--") && flags.has(arg.slice(0, 2)))
		return arg.slice(2);
	return undefined;
}

/** `key=value`, with TOML string quotes taken off the value. */
function splitConfig(config: string): [string, string] {
	const equals = config.indexOf("=");
	if (equals === -1) return [config.trim(), ""];
	const value = config.slice(equals + 1).trim();
	return [
		config.slice(0, equals).trim(),
		value.replace(/^(["'])(.*)\1$/, "$2"),
	];
}
