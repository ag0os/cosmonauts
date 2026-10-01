import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentPackage } from "../../agent-packages/types.ts";
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

const MODEL_FLAGS: ReadonlySet<string> = new Set(["--model", "-m"]);
const CONFIG_FLAGS: ReadonlySet<string> = new Set(["--config", "-c"]);

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
 * record names.
 */
export function harnessModel(options: {
	kind: Exclude<LeanBackendKind, "pi">;
	agentPackage: AgentPackage;
	extraArgs: readonly string[];
}): HarnessModel {
	const caller = callerModel(options.extraArgs);
	if (options.kind === "claude-cli")
		return {
			args: [],
			requested: { model: caller.model ?? HARNESS_DEFAULT_MODEL },
		};
	const own = codexModel(options.agentPackage);
	const args = [
		...(own.model && caller.model === undefined ? ["--model", own.model] : []),
		...(own.effort && caller.effort === undefined
			? ["-c", `${EFFORT_KEY}=${own.effort}`]
			: []),
	];
	const model = caller.model ?? own.model ?? HARNESS_DEFAULT_MODEL;
	const effort = caller.effort ?? own.effort;
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

/** `--model x`, `-m x`, `--model=x`, `-c model=x` and `-c model_reasoning_effort=y`, up to `--`. */
function callerModel(args: readonly string[]): {
	model?: string;
	effort?: string;
} {
	const found: { model?: string; effort?: string } = {};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (arg === "--") break;
		const next = args[index + 1];
		const model = flagValue(MODEL_FLAGS, arg, next);
		const config = flagValue(CONFIG_FLAGS, arg, next);
		if (model !== undefined) found.model = model;
		if (config !== undefined) Object.assign(found, configModel(config));
		if (MODEL_FLAGS.has(arg) || CONFIG_FLAGS.has(arg)) index += 1;
	}
	return found;
}

function configModel(config: string): { model?: string; effort?: string } {
	const [key, value] = splitConfig(config);
	if (key === "model") return { model: value };
	if (key === EFFORT_KEY) return { effort: value };
	return {};
}

function flagValue(
	flags: ReadonlySet<string>,
	arg: string,
	next: string | undefined,
): string | undefined {
	if (flags.has(arg)) return next;
	const equals = arg.indexOf("=");
	if (equals === -1 || !flags.has(arg.slice(0, equals))) return undefined;
	return arg.slice(equals + 1);
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
