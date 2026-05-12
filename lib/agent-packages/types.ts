import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentToolSet } from "../agents/types.ts";

export type AgentPackageSchemaVersion = 1;
export type ExternalRuntimeTarget =
	| "claude-cli"
	| "codex"
	| "gemini-cli"
	| "open-code";
export type SupportedExportTarget = "claude-cli";
export type SkillDeliveryMode = "inline";
export type SystemPromptMode = "append" | "replace";

export interface AgentPackageDefinition {
	readonly schemaVersion: 1;
	readonly id: string;
	readonly description: string;
	readonly sourceAgent?: string;
	readonly prompt: PackagePromptSource;
	readonly tools: PackageToolPolicy;
	readonly skills: PackageSkillSelection;
	readonly projectContext: "omit";
	readonly targets: Partial<
		Record<ExternalRuntimeTarget, TargetPackageOptions>
	>;
}

export type PackagePromptSource =
	| { readonly kind: "source-agent" }
	| { readonly kind: "file"; readonly path: string }
	| { readonly kind: "inline"; readonly content: string };

export interface PackageToolPolicy {
	readonly preset: AgentToolSet;
	readonly notes?: string;
}

export type PackageSkillSelection =
	| { readonly mode: "none" }
	| { readonly mode: "source-agent" }
	| { readonly mode: "allowlist"; readonly names: readonly string[] };

export interface TargetPackageOptions {
	readonly promptMode?: SystemPromptMode;
	readonly skillDelivery?: SkillDeliveryMode;
	readonly allowedTools?: readonly string[];
}

export interface AgentPackage {
	readonly schemaVersion: AgentPackageSchemaVersion;
	readonly packageId: string;
	readonly description: string;
	readonly sourceAgentId?: string;
	readonly systemPrompt: string;
	readonly tools: AgentToolSet;
	readonly skills: readonly PackagedSkill[];
	readonly model?: string;
	readonly thinkingLevel?: ThinkingLevel;
	readonly projectContext: "omit";
	readonly target: SupportedExportTarget;
	readonly targetOptions: TargetPackageOptions;
}

export interface PackagedSkill {
	readonly name: string;
	readonly description: string;
	readonly content: string;
	readonly sourcePath: string;
}

export type InvocationWarning = {
	readonly code: "anthropic_api_key_removed";
	readonly message: string;
};

export interface InvocationSpec {
	readonly command: string;
	readonly args: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly cwd: string;
	readonly stdin: string;
	readonly warnings: readonly InvocationWarning[];
}

export interface MaterializedInvocation {
	readonly spec: InvocationSpec;
	readonly tempDir: string;
	cleanup(): Promise<void>;
}
