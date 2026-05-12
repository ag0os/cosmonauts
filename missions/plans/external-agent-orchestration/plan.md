---
title: 'External Agent Orchestration Phase 1: Packaged Claude Export'
status: active
createdAt: '2026-05-11T20:50:06.113Z'
updatedAt: '2026-05-11T21:35:04.233Z'
behaviorsReviewPending: false
---

## Overview

Implement Phase 1 of external-agent orchestration around a **declarative package definition** that compiles to a Claude Code CLI-backed Bun binary. The valuable workflow is not merely “export a leaf internal agent”; it is that Cosmo/Cody/Planner can help a human design an external-safe packaged agent in conversation, validate the prompt/tool/runtime choices, write a package definition, and compile it.

Phase 1 proves three things together:

1. `AgentPackageDefinition -> AgentPackage` packaging is declarative and target-aware.
2. `AgentPackage -> claude-cli binary` export works hermetically with subscription-safe defaults.
3. Agents can learn and use this system through an `agent-packaging` skill instead of requiring hard-coded export-specific agent definitions such as `standalone-planner`.

Existing internal `AgentDefinition`s remain useful as optional sources for provenance, model/thinking metadata, raw prompt material when safe, and source-agent skill selection. The clean export artifact is a package definition. This lets a conversational agent derive an external-safe planner prompt from `coding/planner` without pretending the internal `spawn_agent`/`chain_run` tools exist in the exported binary.

## Scope

Included:
- Add a versioned declarative `AgentPackageDefinition` schema that can be authored by humans or agents.
- Support package definitions that either:
  - reference a source `AgentDefinition` and use its source prompt directly when compatibility checks pass; or
  - reference a source `AgentDefinition` for provenance/metadata but provide an explicit standalone prompt for external use; or
  - define a standalone external agent with no source agent.
- Build a serializable `AgentPackage` containing final prompt, selected full skill markdown, tool policy, target metadata, model/thinking metadata, and source metadata.
- Add Claude CLI invocation mapping from an `AgentPackage` to argv/env/temp files.
- Add a standalone binary runner that materializes embedded prompt assets to a temp directory and invokes `claude` in the caller's working directory.
- Add `cosmonauts export --definition <path> --out <path>` and a compatible shorthand `cosmonauts export <agent-id> --target claude-cli --out <path>`.
- Ensure every binary export path is normalized through an `AgentPackageDefinition` before package build, including the `<agent-id>` shorthand.
- Bootstrap export with the same bundled-domain discovery seam used by the main CLI and Drive's `cosmonauts-subagent` path.
- Default to subscription-safe Claude execution by removing `ANTHROPIC_API_KEY` from the spawned Claude env unless the user explicitly passes `--allow-api-billing`.
- Support shell-friendly prompt input in the exported binary via trailing args or stdin, with trailing args taking precedence.
- Add an `agent-packaging` skill that teaches agents how to design, review, and export package definitions through conversation.

Excluded for this phase:
- Chain-stage external runtime dispatch.
- Drive migration to packaged agents.
- `AgentDefinition.kind` or external agent definitions.
- Generic prompt rewriting of arbitrary internal agents without a human-reviewed package definition.
- Codex/Gemini/open-code export parity. The definition schema may include future target keys, but Phase 1 implements only `claude-cli` export.
- Claude plugin-dir skill packaging.
- Persisting runtime activity back into Cosmonauts memory.
- A first-class Pi tool for package export. Agents with shell/write access can use the CLI; agents without those tools can draft definitions or delegate to an implementation agent.

## Review and Fresh-eye Revisions

This revision incorporates `missions/plans/external-agent-orchestration/review.md`, follow-up user direction, and a fresh pass against the current codebase.

- **PR-001 / user feedback** — Instead of making Phase 1 useful only for leaf agents, introduce declarative package definitions. Raw internal-agent shorthand is still validated, but a package definition can derive from `coding/planner` while supplying an external-safe prompt reviewed with the human.
- **PR-002** — The export subcommand bootstrap contract explicitly uses `discoverFrameworkBundledPackageDirs()` and includes real bundled-domain coverage.
- **PR-003** — Source-agent shorthand preserves internal shared-skill filtering behavior; explicit package definitions can declare exact skills.
- **PR-004** — Skill packaging requires reading and embedding full markdown bodies for both flat `.md` skills and directory `SKILL.md` skills.
- **PR-005** — Neutral readonly tool preset remains least-privilege; Claude-specific extra tools can be declared under `targets["claude-cli"].allowedTools` when the package author intentionally wants Claude Code-native affordances such as todos/subagents.
- **PR-006** — Tests include main-dispatch coverage for the hard-coded `cli/main.ts` subcommand route.
- **FR-001** — The phase spec has been narrowed to Phase 1 so task creation is not pulled back toward old chain/adapter scope.
- **FR-002** — The target contract now distinguishes future schema keys from Phase 1 supported export targets.
- **FR-003** — Invocation contracts now include warning types and a materialized-invocation cleanup seam so temp prompt files are not leaked by design.
- **FR-004** — The exported binary must run Claude in the caller's cwd; temp directories are only for prompt assets.
- **FR-005** — Definition validation now explicitly covers source-agent-dependent prompt/skill modes and unsupported export targets.

## Decision Log

- **D-001 — Export first, no chain integration yet**
  - Decision: Phase 1 ships the standalone Claude export path only.
  - Alternatives: Start with external chain stages; refactor Drive and chain runtimes first.
  - Why: Export proves the shared packaging seam and subscription billing path with the least disruption to working chains and Drive.
  - Decided by: user-chose-among-options

- **D-002 — Package definitions are the export source of truth**
  - Decision: Every binary export is built from an `AgentPackageDefinition`, even when the user invokes the `<agent-id>` shorthand.
  - Alternatives: Export `AgentDefinition` directly; hard-code a `standalone-planner` agent; add target-specific ad hoc CLI options for each runtime.
  - Why: The common situation is conversational derivation of external-safe agents. A declarative definition gives Claude, Codex, Gemini, and future binaries one shared authoring model.
  - Decided by: user-directed

- **D-003 — Dynamic prompt derivation beats hard-coded export agents**
  - Decision: Do not add a hard-coded `standalone-planner` definition in Phase 1. Instead, add package-definition support plus a skill that helps agents draft external-safe prompts with the human.
  - Alternatives: Add `coding/standalone-planner`; reject planner export entirely; attempt automatic prompt surgery.
  - Why: Planner-like exports will vary by target runtime and user preference. Claude Code may have native todos/subagents, while other runtimes may not. This needs a conversation and a declarative artifact, not a one-off built-in agent.
  - Decided by: user-directed

- **D-004 — Inline full skill markdown for v1**
  - Decision: Selected skill markdown bodies are embedded into the packaged system prompt rather than emitted as a Claude plugin directory or a skill index only.
  - Alternatives: Claude `--plugin-dir`; hybrid inline index plus plugin files; Pi `formatSkillsForPrompt()` skill index only.
  - Why: Full inline content is hermetic and preserves the knowledge that the exported runtime cannot load via Pi `/skill:name`.
  - Decided by: planner-proposed

- **D-005 — Do not change `AgentDefinition` in Phase 1**
  - Decision: Keep `AgentDefinition` runtime-neutral and do not add `kind: "external"` until chain/runtime dispatch requires it.
  - Alternatives: Add `kind` now; introduce a separate `ExternalAgentDefinition` type.
  - Why: Export package definitions are a separate artifact. Domain agent definitions should not accumulate target-runtime flags.
  - Decided by: planner-proposed

- **D-006 — Append prompt mode by default**
  - Decision: Claude invocation uses `--append-system-prompt-file` by default, with `promptMode: "replace"` available in package target config and binary runtime flags.
  - Alternatives: Always replace Claude Code's default prompt; always append and provide no override.
  - Why: Append preserves Claude Code's CLI/tool-use instincts while layering Cosmonauts discipline. Replace remains available for packages that need full identity control.
  - Decided by: planner-proposed

- **D-007 — Remove API key by default for subscription safety**
  - Decision: The exported binary removes `ANTHROPIC_API_KEY` from the `claude` child environment unless `--allow-api-billing` is passed at binary runtime.
  - Alternatives: Warn and continue; hard fail whenever `ANTHROPIC_API_KEY` is set.
  - Why: The spec requires subscription billing to be the default and forbids silent API fallback. Removing the key preserves subscription auth while allowing explicit API opt-in.
  - Decided by: planner-proposed

- **D-008 — Raw source-agent export is compatibility-gated**
  - Decision: Shorthand exports that use a source agent prompt directly reject definitions with extensions, subagents, or extension-backed capabilities. Package definitions with explicit prompts are allowed to reference those agents for defaults.
  - Alternatives: Allow raw `coding/planner` unchanged; reject all package definitions referencing non-leaf agents.
  - Why: Raw internal prompts can mention unavailable tools. Explicit package prompts are human/agent-authored for the target runtime and can intentionally mention target-native affordances.
  - Decided by: planner-proposed

- **D-009 — Hermetic binaries omit project context**
  - Decision: Exported binaries use `--bare` and do not embed or auto-load `AGENTS.md`/`CLAUDE.md`; project context is package metadata only in Phase 1.
  - Alternatives: Embed export-time project context; allow Claude Code auto-discovery by dropping `--bare`.
  - Why: The spec requires hermetic reproducible exports. Project context varies by runtime repository and can be supplied in the user prompt until a later phase designs portable context packaging.
  - Decided by: planner-proposed

- **D-010 — Claude runs in caller cwd, not asset temp dir**
  - Decision: The binary materializes prompt files in a temp dir but invokes Claude with `cwd: process.cwd()` unless tests inject a cwd.
  - Alternatives: Run Claude in the temp dir; add a runtime `--cwd` flag now.
  - Why: The binary is useful as a coding agent only if Claude tools operate on the project where the user invokes it. A separate runtime cwd flag can be added later if a use case appears.
  - Decided by: planner-proposed

- **D-011 — Future target keys are schema-level only in Phase 1**
  - Decision: Types/validation may recognize `codex`, `gemini-cli`, and `open-code` target blocks, but the export command accepts only `claude-cli` in Phase 1.
  - Alternatives: Restrict schema to `claude-cli` only; implement placeholder exporters for future targets.
  - Why: The umbrella architecture wants stable target nesting, but implementation must not overbuild unproven runtimes.
  - Decided by: planner-proposed

## Current State

- `AgentDefinition` is defined in `lib/agents/types.ts` and is runtime-neutral: id, capabilities, model, tools, extensions, skills, subagents, projectContext, session, loop, and thinkingLevel.
- `CosmonautsRuntime.create()` in `lib/runtime.ts` loads project config, domains, `AgentRegistry`, `DomainResolver`, workflows, project skill filters, and skill paths.
- The normal CLI runtime bootstrap in `cli/main.ts` calls `discoverFrameworkBundledPackageDirs(frameworkRoot)` and passes `bundledDirs` plus `pluginDirs`/`domainOverride` into `CosmonautsRuntime.create()`.
- The coding domain used for dogfooding is bundled under `bundled/coding/coding`, not `domains/`; export subcommands must include bundled discovery or `coding/*` agents are invisible.
- Prompt assembly is centralized in `lib/domains/prompt-assembly.ts` via `assemblePrompts()`.
- Internal session setup uses `buildSessionParams()` in `lib/agents/session-assembly.ts`, then `createAgentSessionFromDefinition()` in `lib/orchestration/session-factory.ts`.
- Internal skill filtering expands configured project skills with shared skill names before calling `buildSkillsOverride()`; this preserves shared skills such as `pi` and `plan` for agents under project skill filters.
- Drive has external CLI process examples in `lib/driver/backends/claude-cli.ts` and `lib/driver/backends/codex.ts`, but those backends receive rendered task prompts only and do not package an `AgentDefinition`.
- The top-level CLI subcommand dispatch lives in `cli/main.ts` and requires new subcommands to be added both to the `if` predicate and the `programs` map.

## Design

### Package definition vs package

`AgentPackageDefinition` is the human/agent-authored declarative source. It can be stored in a project, generated temporarily during a conversation, or created from an `<agent-id>` shorthand.

`AgentPackage` is the compiled in-memory artifact embedded into the exported binary. It contains final prompt text and full skill bodies, not paths to local Cosmonauts source files.

Explicit package definitions must declare their tool policy. Source agents provide provenance and optional model/thinking metadata, but workers must not silently copy a source agent's tool policy for explicit definitions; target-safe tools are part of the human-reviewed package contract. The `<agent-id>` shorthand is the only path that automatically copies the source agent's `tools` value.

### Package definition format

Phase 1 supports JSON definitions. Prompt paths are resolved relative to the definition file and normalized to an absolute path before package build. Prompt file frontmatter is stripped when read, matching existing prompt assembly behavior. Inline prompts are allowed for dynamic one-file definitions.

Example dynamic planner export definition:

```json
{
  "schemaVersion": 1,
  "id": "cosmo-planner-claude",
  "description": "Cosmonauts planning discipline packaged for Claude Code subscription use.",
  "sourceAgent": "coding/planner",
  "prompt": {
    "kind": "file",
    "path": "planner-claude-system.md"
  },
  "tools": {
    "preset": "coding"
  },
  "skills": {
    "mode": "allowlist",
    "names": [
      "plan",
      "engineering-principles",
      "design-dialogue",
      "tdd",
      "reference-adaptation",
      "pi"
    ]
  },
  "projectContext": "omit",
  "targets": {
    "claude-cli": {
      "promptMode": "append",
      "skillDelivery": "inline",
      "allowedTools": ["Read", "Glob", "Grep", "Bash", "Edit", "Write", "TodoWrite", "Task"]
    }
  }
}
```

Notes:
- The definition may reference `coding/planner` for metadata/provenance while replacing the prompt with external-safe instructions.
- `allowedTools` is target-specific. Workers must not assume every runtime supports the same tool names.
- Later Codex/Gemini/open-code support adds exporters for existing target blocks instead of inventing a new definition format.

### Module responsibilities and contracts

**`lib/agent-packages/types.ts` (new)** — stable data contracts for package definitions, built packages, compatibility issues, warnings, and invocation specs.

```ts
export type AgentPackageSchemaVersion = 1;
export type ExternalRuntimeTarget = "claude-cli" | "codex" | "gemini-cli" | "open-code";
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
  readonly targets: Partial<Record<ExternalRuntimeTarget, TargetPackageOptions>>;
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
  /** Runtime-specific allowed tool names. Falls back to preset mapping when omitted. */
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
  /** Markdown body with frontmatter stripped. */
  readonly content: string;
  readonly sourcePath: string;
}

export type InvocationWarning =
  | { readonly code: "anthropic_api_key_removed"; readonly message: string };

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
```

Dependency rule: `lib/agent-packages/types.ts` imports only shared type-only dependencies such as `AgentToolSet` and `ThinkingLevel`; it must not import CLI, Drive, or chain modules.

**`lib/agent-packages/definition.ts` (new)** — read, validate, and normalize package definitions.
- Reads JSON definition files and validates the schema manually with clear errors.
- Resolves `prompt.kind: "file"` paths relative to the definition file and rewrites them to absolute paths before returning the definition.
- Rejects `prompt.kind: "source-agent"` when `sourceAgent` is absent.
- Rejects `skills.mode: "source-agent"` when `sourceAgent` is absent.
- Rejects non-`omit` project context in Phase 1.
- Provides `definitionFromAgent(definition: AgentDefinition, target: "claude-cli")` for the `<agent-id>` shorthand. It uses the qualified source id (`domain/id`) for `sourceAgent`, `prompt.kind: "source-agent"`, `skills.mode: "source-agent"`, copies the source `tools` preset, and creates a deterministic package id by replacing `/` with `-` and appending `-claude-cli`.
- Enforces that exactly one of `<agent-id>` or `--definition` is provided at the CLI layer.

**`lib/agent-packages/compatibility.ts` (new)** — raw source-prompt exportability validation.
- Applies only when `prompt.kind === "source-agent"`.
- Rejects when the referenced source definition has extensions, subagents, or extension-backed capabilities such as `spawning`, `tasks`, `todo`, or `drive`.
- Does not reject definitions that reference such agents while providing `prompt.kind: "file"` or `"inline"`.
- Returns/names all incompatible features so CLI errors can explain what to fix.

**`lib/agents/skills.ts` (modified)** — shared skill filter semantics.
- Add an exported helper that computes the same effective project skill filter used by internal sessions.
- Modify `lib/agents/session-assembly.ts` to call this helper so internal behavior and source-agent package behavior remain single-sourced.

```ts
export async function resolveEffectiveProjectSkills(options: {
  readonly projectSkills?: readonly string[];
  readonly domainsDir?: string;
  readonly resolver?: DomainResolver;
}): Promise<readonly string[] | undefined>;
```

**`lib/agent-packages/skills.ts` (new)** — package-time skill discovery, filtering, and materialization.
- Follows Pi/Cosmonauts discovery rules over `runtime.skillPaths`: direct flat `.md` skills at the root of each skill path and recursive directory skills containing `SKILL.md`.
- Reads actual markdown files and strips frontmatter with `gray-matter`; it must not rely on Pi `formatSkillsForPrompt()` because that formats only a skill index.
- Dedupe by skill name using first match in `runtime.skillPaths` order.
- Skill selection behavior:
  - `none`: no skills.
  - `source-agent`: use `sourceAgent.skills` with `resolveEffectiveProjectSkills()` + `buildSkillsOverride()` semantics to match internal sessions.
  - `allowlist`: embed exactly the named skills available in `runtime.skillPaths`; missing names are diagnostics/errors, not silently ignored.

**`lib/agent-packages/build.ts` (new)** — `AgentPackageDefinition -> AgentPackage` builder.
- Accepts options including `agentRegistry`, `domainContext`, `domainsDir`, `resolver`, `projectSkills`, `skillPaths`, and `target: "claude-cli"`.
- Resolves optional `sourceAgent` through `AgentRegistry.resolve(sourceAgent, domainContext)`.
- Resolves prompt source:
  - `source-agent`: requires a resolved source agent, assembles prompt with `assemblePrompts()`, and runs raw-source compatibility validation.
  - `file`: reads the normalized absolute file path and strips frontmatter.
  - `inline`: uses the content as-is.
- Resolves selected skills through `lib/agent-packages/skills.ts`.
- Appends full inline skill markdown under `# Packaged Skills` when selected skills are present.
- Appends a runtime identity/provenance marker using package id and optional source agent id.
- Carries source agent model/thinking metadata when available; does not pass it to Claude automatically.
- Uses `definition.targets["claude-cli"] ?? {}` as target options; unsupported export targets fail before build in the CLI.

**`lib/agent-packages/claude-cli.ts` (new)** — Claude-specific mapping, temp materialization, cwd, and env safety.
- Exposes a function that returns `MaterializedInvocation`, not a bare `InvocationSpec`, so callers can clean temp files in `finally`.
- Default argv shape:

```txt
claude -p --bare --setting-sources "" --append-system-prompt-file <temp/system.md> --tools <mapped-or-declared-tools>
```

- Uses `--system-prompt-file` instead when prompt mode is `replace`.
- Accepts `cwd` from the caller and uses it as `InvocationSpec.cwd`; temp dir is only for generated prompt assets.
- Default preset mapping:

```ts
const CLAUDE_TOOLS_BY_AGENT_TOOL_SET = {
  coding: ["Bash", "Edit", "Read", "Write", "Glob", "Grep"],
  readonly: ["Read", "Glob", "Grep"],
  verification: ["Bash", "Read", "Glob", "Grep"],
  none: [],
} as const;
```

- If `agentPackage.targetOptions.allowedTools` is present, use that exact Claude tool list instead of the preset mapping.
- Unless `allowApiBilling === true`, remove `ANTHROPIC_API_KEY` from the child env and add an `anthropic_api_key_removed` warning to the invocation spec.
- Do not pass package `model` metadata to Claude automatically in Phase 1.

**`lib/agent-packages/claude-binary-runner.ts` (new)** — runtime entrypoint used by compiled exports.
- Parses binary runtime args.
- Reads prompt input from trailing args or stdin. If trailing args are present, join them and do not wait on stdin.
- Invokes Claude using an embedded `AgentPackage` and `cwd: process.cwd()`.
- Pipes stdout/stderr and exits with Claude's exit code.
- Prints invocation warnings such as API-key removal to stderr before forwarding Claude output.
- Cleans materialized temp dirs in `finally`.
- Must not depend on `CosmonautsRuntime`, domain files, task APIs, or project-local Cosmonauts paths.

Runtime CLI contract:

```txt
<exported-agent> [--allow-api-billing] [--claude-binary <path>] [--prompt-mode append|replace] [prompt...]
```

**`lib/agent-packages/export.ts` (new)** — compile helper.
- Writes a generated temporary TypeScript entry file with the serialized `AgentPackage` embedded.
- Runs `bun build --compile` with injectable `execFile` for tests.
- Generated entry imports `runClaudeBinary()` at build time and passes embedded package JSON.
- The compiled binary must not read package data from the Cosmonauts repo at runtime.

**`cli/export/subcommand.ts` (new)** — human-facing export command.

Command contract:

```txt
cosmonauts export --definition <path> --out <path> [--target claude-cli]
cosmonauts export <agent-id> --target claude-cli --out <path>
```

Bootstrap behavior:
- Export a zero-argument `createExportProgram()` factory like other subcommands.
- Compute `frameworkRoot` the same way `cli/drive/subcommand.ts` does.
- Set `builtinDomainsDir` to `<frameworkRoot>/domains`.
- Call `discoverFrameworkBundledPackageDirs(frameworkRoot)` and pass the result as `bundledDirs` to `CosmonautsRuntime.create()`.
- Accept `--domain <id>` and repeated `--plugin-dir <path>` for parity with the main CLI runtime.
- Default `--target` to `claude-cli` and reject any other target in Phase 1 before build/compile.
- Normalize CLI input to an `AgentPackageDefinition`.
- Build `AgentPackage`, compile binary, and print one JSON success line.

**`domains/shared/skills/agent-packaging/SKILL.md` (new)** — guidance for conversational package authoring.
- Teaches agents to:
  - inspect the source agent definition and prompt/capabilities;
  - identify tool/capability mismatches for the target runtime;
  - draft an external-safe prompt with the human;
  - choose skills and target tool policy declaratively;
  - write an `AgentPackageDefinition`;
  - run or instruct `cosmonauts export --definition`.
- Includes a warning not to blindly export internal prompts that mention unavailable tools.

**`cli/main.ts` (modified)** — register `export` in both hard-coded dispatch sites and update the CLI header comment.

## Behavior Specs

### B-001 — Export from a declarative definition compiles a Claude binary

Context: A package definition contains an inline or file prompt, selected skills, and a `claude-cli` target. The user runs:

```txt
cosmonauts export --definition packages/cosmo-planner/package.json --out bin/cosmo-planner
```

Expected:
- The CLI reads and validates the definition.
- Prompt file paths resolve relative to the definition file and file prompt frontmatter is stripped when read.
- The package builder embeds final prompt text and full selected skill bodies.
- The compile helper invokes `bun build --compile <generated-entry> --outfile bin/cosmo-planner`.
- stdout contains one JSON object naming the package id, target, and output path.

### B-002 — Agent-id shorthand normalizes through a package definition

Context: The user runs:

```txt
cosmonauts export coding/explorer --target claude-cli --out bin/explorer-claude
```

Expected:
- The CLI bootstraps `CosmonautsRuntime` with bundled package discovery, so `coding/explorer` resolves in the dogfood repo.
- The CLI converts the agent into an equivalent `AgentPackageDefinition` with `sourceAgent: "coding/explorer"`, `prompt.kind: "source-agent"`, `skills.mode: "source-agent"`, copied tool preset, deterministic package id, and a target block for `claude-cli`.
- Export then follows the same definition/package/build path as `--definition`.

### B-003 — Raw nonportable source prompts are rejected

Context: The user runs:

```txt
cosmonauts export coding/planner --target claude-cli --out bin/planner-claude
```

Expected:
- Export fails before compile because the shorthand would use `prompt.kind: "source-agent"`.
- The error explains that raw source-agent export supports only prompts without unsupported extension/runtime dependencies and names planner's unsupported features.
- The error suggests creating a package definition with an explicit external-safe prompt derived from `coding/planner`.

### B-004 — Definition-derived planner package can reference planner metadata

Context: A package definition references `sourceAgent: "coding/planner"` but uses `prompt.kind: "file"` with a human-reviewed Claude-safe planner prompt.

Expected:
- Export does not reject the package solely because the source agent has extensions/subagents.
- The package can reuse explicit skill allowlists and source metadata.
- The final prompt is the definition prompt, not the raw internal planner prompt.

### B-005 — Full skill markdown is embedded

Context: A definition selects skills by allowlist.

Expected:
- The package includes body text from selected flat `.md` skills and directory `SKILL.md` skills.
- Frontmatter is stripped from embedded skill content.
- Missing allowlisted skill names fail with a clear diagnostic.
- Duplicate skill names are deduped by first match in `runtime.skillPaths` order.

### B-006 — Source-agent skill mode preserves internal shared-skill behavior

Context: `projectSkills` is configured and the shorthand/source-agent mode selects an agent with shared skills.

Expected:
- Package skill filtering expands the effective project filter with shared skill names, matching internal `buildSessionParams()` behavior.
- Shared skills selected by the source agent remain packageable even when the project-level config does not list them explicitly.

### B-007 — Claude invocation maps preset tools or exact target tools

Context: A package uses `tools.preset: "readonly"` and no Claude `allowedTools` override.

Expected:
- Claude argv includes `--tools "Read,Glob,Grep"`.
- It does not include `WebSearch`/`WebFetch` by default.

Context: A package target declares `allowedTools`.

Expected:
- Claude argv uses that exact comma-separated list.

### B-008 — Prompt mode append/replace works

Context: Claude target prompt mode is `append` or runtime flag defaults to append.

Expected:
- Invocation argv uses `--append-system-prompt-file <path>`.

Context: Prompt mode is `replace`.

Expected:
- Invocation argv uses `--system-prompt-file <path>` and does not include append mode.

### B-009 — Subscription safety removes `ANTHROPIC_API_KEY` by default

Context: The exported binary runs with `ANTHROPIC_API_KEY` present and without `--allow-api-billing`.

Expected:
- The spawned Claude env does not contain `ANTHROPIC_API_KEY`.
- The binary prints a clear stderr diagnostic explaining that Cosmonauts removed the key to preserve Claude subscription auth and that `--allow-api-billing` opts back in.
- Claude still receives other environment variables.

### B-010 — Explicit API billing opt-in preserves `ANTHROPIC_API_KEY`

Context: The exported binary runs with `ANTHROPIC_API_KEY` present and `--allow-api-billing`.

Expected:
- The spawned Claude env preserves `ANTHROPIC_API_KEY`.
- The binary does not print the subscription-safety removal warning.

### B-011 — Exported binary accepts prompt args or stdin

Context: A user runs either:

```txt
cosmo-planner "design a cache layer"
printf "design a cache layer" | cosmo-planner
```

Expected:
- In the first case, trailing args are joined into the prompt passed to Claude stdin and the binary does not wait on stdin.
- In the second case, stdin content is passed to Claude stdin.
- If both are empty, the binary prints usage and exits non-zero.

### B-012 — Missing Claude binary surfaces a diagnostic

Context: The exported binary cannot spawn `claude` or the user-provided `--claude-binary` path.

Expected:
- The binary exits non-zero.
- stderr names the runtime (`claude-cli`), the binary that failed, and a likely fix (`install Claude Code CLI or pass --claude-binary`).

### B-013 — Main CLI dispatch includes export

Context: A user runs `cosmonauts export ...` through the real `bin/cosmonauts`/`cli/main.ts` path.

Expected:
- The subcommand is routed to `createExportProgram()` instead of falling through to normal prompt parsing.
- `cli/main.ts` contains `export` in both the dispatch predicate and the `programs` map.

### B-014 — Agent-packaging skill guides conversational package creation

Context: An agent loads `/skill:agent-packaging` during a conversation about exporting a planner-like Claude binary.

Expected:
- The skill instructs the agent to inspect the source agent, identify unavailable internal tools, draft an external-safe prompt with the human, choose declarative skills/tools/target options, and write or present an `AgentPackageDefinition`.
- The skill avoids recommending hard-coded built-in export agents or blind raw prompt export.

### B-015 — Invalid source-agent-dependent definitions fail clearly

Context: A definition uses `prompt.kind: "source-agent"` or `skills.mode: "source-agent"` without `sourceAgent`.

Expected:
- Definition validation fails before package build.
- The error names the offending field and says `sourceAgent` is required.

### B-016 — Unsupported export targets fail before compile

Context: A definition contains future target blocks and the user runs `cosmonauts export --definition package.json --target codex --out bin/x`.

Expected:
- The definition can parse, but the CLI rejects the requested target because Phase 1 supports only `claude-cli`.
- No package build or `bun build --compile` occurs.

### B-017 — Claude runs in caller cwd and cleans temp assets

Context: The exported binary is invoked from `/repo` and materializes a system prompt file under a temp dir.

Expected:
- The Claude child process receives `cwd: /repo`.
- The argv points at the temp system prompt file.
- The temp directory is removed after Claude exits or spawn fails.

## Files to Change

Production:
- `lib/agents/skills.ts` — add `resolveEffectiveProjectSkills()` and keep `buildSkillsOverride()` behavior unchanged.
- `lib/agents/session-assembly.ts` — replace private shared-skill expansion with `resolveEffectiveProjectSkills()` to keep behavior single-sourced.
- `lib/agent-packages/types.ts` — new package definition, package, warning, materialized invocation, and invocation contracts.
- `lib/agent-packages/definition.ts` — new JSON definition loading/validation/path resolution plus agent-id shorthand normalization.
- `lib/agent-packages/compatibility.ts` — new raw source-prompt exportability validator.
- `lib/agent-packages/skills.ts` — new skill discovery/filtering/materialization helpers for full inline markdown packaging.
- `lib/agent-packages/build.ts` — new `AgentPackageDefinition -> AgentPackage` builder.
- `lib/agent-packages/claude-cli.ts` — new Claude argv/env/temp-file/cwd mapping.
- `lib/agent-packages/claude-binary-runner.ts` — new embedded-package runtime for compiled binaries.
- `lib/agent-packages/export.ts` — new Bun compile helper.
- `cli/export/subcommand.ts` — new `cosmonauts export` subcommand.
- `cli/main.ts` — register the export subcommand.
- `domains/shared/skills/agent-packaging/SKILL.md` — new skill for conversational package authoring.
- `README.md` — document package definitions, `cosmonauts export`, and exported binary usage.
- `docs/orchestration.md` — add the packaged-agent/export concept and note that chains/Drive are unchanged in Phase 1.

Tests:
- `tests/agents/skills.test.ts` — extend coverage for `resolveEffectiveProjectSkills()` shared-skill preservation.
- `tests/agent-packages/definition.test.ts` — definition validation, prompt path resolution, frontmatter stripping for file prompts, inline prompt support, source-agent-dependent validation, future target parsing, and agent-id shorthand normalization.
- `tests/agent-packages/compatibility.test.ts` — raw source-prompt validator behavior, including `coding/planner`-style shorthand rejection.
- `tests/agent-packages/skills.test.ts` — skill filtering, flat `.md` and directory `SKILL.md` full-body embedding, missing-skill errors, dedupe, and inline render behavior.
- `tests/agent-packages/build.test.ts` — package builder prompt/skill/identity/projectContext/source-metadata behavior, domain-context source-agent resolution, and shorthand rejection for nonportable source prompts.
- `tests/agent-packages/claude-cli.test.ts` — Claude argv/env/tool/prompt-mode/project-context/cwd/temp cleanup mapping.
- `tests/agent-packages/claude-binary-runner.test.ts` — runtime arg/stdin/auth/spawn-error/cwd/temp-cleanup behavior.
- `tests/agent-packages/export.test.ts` — generated entry and Bun compile helper behavior with mocked exec.
- `tests/cli/export/subcommand.test.ts` — CLI command parsing, bundled-domain bootstrap, definition export, shorthand export, success JSON, unknown-agent failure, unsupported target failure, and raw nonportable shorthand failure.
- `tests/cli/export/main-dispatch.test.ts` — real/static `cli/main.ts` dispatch coverage for the `export` subcommand.
- `tests/skills/agent-packaging.test.ts` — skill content includes the required conversational package-authoring guidance.

## Implementation Order

1. **Shared skill-filter helper**
   - Extend `tests/agents/skills.test.ts` for effective project-skill expansion with shared skills.
   - Add `resolveEffectiveProjectSkills()` in `lib/agents/skills.ts` and update `lib/agents/session-assembly.ts` to use it without changing internal behavior.

2. **Definition contracts and validation**
   - Add `tests/agent-packages/definition.test.ts` and `tests/agent-packages/compatibility.test.ts`.
   - Implement `lib/agent-packages/types.ts`, `definition.ts`, and `compatibility.ts`.

3. **Skill materialization**
   - Add/complete `tests/agent-packages/skills.test.ts`.
   - Implement `lib/agent-packages/skills.ts` with full markdown body embedding.

4. **Package builder**
   - Add `tests/agent-packages/build.test.ts` for definition prompts, raw source prompts, source metadata, domain-context resolution, full inline skills, projectContext metadata, and shorthand rejection for nonportable source prompts.
   - Implement `lib/agent-packages/build.ts`.

5. **Claude invocation mapping**
   - Add `tests/agent-packages/claude-cli.test.ts` for prompt-mode, default and explicit tool mapping, temp materialization and cleanup seam, caller cwd, project-context omission, and auth env behavior.
   - Implement `lib/agent-packages/claude-cli.ts`.

6. **Binary runner**
   - Add `tests/agent-packages/claude-binary-runner.test.ts` for arg/stdin handling, `--allow-api-billing`, `--claude-binary`, spawn errors, caller cwd, temp cleanup, warnings, and exit code propagation.
   - Implement `lib/agent-packages/claude-binary-runner.ts` with injectable process/spawn boundaries for tests.

7. **Export compiler helper**
   - Add `tests/agent-packages/export.test.ts` for generated entry content and `bun build --compile` invocation.
   - Implement `lib/agent-packages/export.ts`.

8. **CLI integration**
   - Add `tests/cli/export/subcommand.test.ts` and `tests/cli/export/main-dispatch.test.ts`.
   - Implement `cli/export/subcommand.ts` and register `export` in `cli/main.ts`.

9. **Agent-packaging skill**
   - Add `tests/skills/agent-packaging.test.ts`.
   - Implement `domains/shared/skills/agent-packaging/SKILL.md`.

10. **Documentation**
   - Update `README.md` and `docs/orchestration.md` after behavior is implemented and test names/flags are final.

## Risks

- **Package definitions become too broad too early**
  - Blast radius: workers overbuild schema features for future runtimes.
  - Countermeasure: Phase 1 schema supports target nesting and future keys, but only `claude-cli` export is implemented; unsupported targets fail before compile.

- **Blind raw internal prompt export produces unusable binaries**
  - Blast radius: exported planner/coordinator/worker prompts instruct the model to call unavailable Cosmonauts tools.
  - Countermeasure: raw `source-agent` prompt mode is compatibility-gated. Planner-like exports must use explicit package prompts reviewed in conversation.

- **Conversationally authored prompts are unsafe or underspecified**
  - Blast radius: generated binaries may have unclear tool assumptions or missing workflow instructions.
  - Countermeasure: `agent-packaging` skill requires source-agent inspection, target-runtime tool review, and human validation of the final prompt/definition before export.

- **Claude CLI flag drift**
  - Blast radius: exported binaries compile but fail at runtime with unsupported flags.
  - Countermeasure: keep all Claude flag mapping in `lib/agent-packages/claude-cli.ts`; add focused unit tests for argv shape. Runtime errors must name the failing binary and command.

- **Skill semantics differ from Pi `/skill:name` loading**
  - Blast radius: exported agents see full inline skill content up front instead of loading on demand, causing prompt bloat or changed behavior.
  - Countermeasure: Phase 1 supports inline-only and documents the limitation; plugin-dir delivery is a follow-up phase. Tests require full markdown body inclusion so the binary has enough knowledge to operate without Pi.

- **Project skill filters diverge from internal sessions**
  - Blast radius: shorthand/source-agent packages lose shared skills that internal agents retain under project-level filters.
  - Countermeasure: extract and reuse the effective-project-skill helper from internal session assembly.

- **API billing surprise**
  - Blast radius: users with `ANTHROPIC_API_KEY` set accidentally pay API rates instead of using Claude subscription auth.
  - Countermeasure: remove `ANTHROPIC_API_KEY` from Claude child env by default and require `--allow-api-billing` opt-in.

- **Compiled binary accidentally depends on repo files**
  - Blast radius: exported agents fail when moved to another project or machine.
  - Countermeasure: embed `AgentPackage` JSON in the generated entry and materialize prompt files from embedded strings only. Tests assert generated entry contains serialized package data and runner code does not load package data/project context from a project path.

- **Subcommand bootstrap misses bundled or plugin domains**
  - Blast radius: `coding/*` agents fail to resolve in the framework repo or plugin-provided agents cannot be used as package sources.
  - Countermeasure: export subcommand uses the same bundled discovery seam as `cli/main.ts` and accepts `--domain`/`--plugin-dir`.

- **Claude works in the wrong directory**
  - Blast radius: exported coding agents operate on temp assets instead of the user's project.
  - Countermeasure: invocation mapping requires caller-provided cwd; binary runner passes `process.cwd()` and tests assert it.

## Quality Contract

- **QC-001 — Existing chains and Drive untouched**
  - Criterion: Phase 1 does not modify `lib/orchestration/chain-runner.ts`, `lib/driver/run-one-task.ts`, or existing Drive backend behavior except documentation references.
  - Verification: reviewer inspection plus existing tests.

- **QC-002 — Every export flows through a package definition**
  - Criterion: Both `--definition` and `<agent-id>` shorthand normalize to `AgentPackageDefinition` before building an `AgentPackage`; no direct `AgentDefinition -> binary` shortcut exists.
  - Verification: `tests/agent-packages/definition.test.ts` and `tests/cli/export/subcommand.test.ts`.

- **QC-003 — Raw nonportable source prompts rejected, explicit derived prompts allowed**
  - Criterion: `coding/planner` shorthand fails before compile, while a definition that references `coding/planner` and supplies `prompt.kind: "file"` or `"inline"` can build.
  - Verification: `tests/agent-packages/compatibility.test.ts`, `tests/agent-packages/build.test.ts`, and `tests/cli/export/subcommand.test.ts`.

- **QC-004 — Full skill bodies embedded with internal filter parity for source-agent mode**
  - Criterion: packaged skills include body text from flat `.md` and directory `SKILL.md` skills, missing explicit allowlist skills fail clearly, and source-agent mode preserves shared skills under project-level filters.
  - Verification: `bun run test -- tests/agents/skills.test.ts tests/agent-packages/skills.test.ts tests/agent-packages/build.test.ts`.

- **QC-005 — Claude mapping single-sourced, target-aware, and cwd-correct**
  - Criterion: Claude CLI flags, tool mapping, prompt-mode mapping, project-context omission, caller cwd, temp cleanup, and auth env handling live in `lib/agent-packages/claude-cli.ts`; target `allowedTools` overrides default preset mapping.
  - Verification: reviewer inspection and `tests/agent-packages/claude-cli.test.ts`.

- **QC-006 — Subscription safety default**
  - Criterion: With `ANTHROPIC_API_KEY` set and no `--allow-api-billing`, the Claude child env omits the key and stderr explains why.
  - Verification: `bun run test -- tests/agent-packages/claude-cli.test.ts tests/agent-packages/claude-binary-runner.test.ts`.

- **QC-007 — Hermetic binary behavior**
  - Criterion: The generated binary entry embeds the package JSON and the runtime runner only materializes prompt assets from embedded strings/temp dirs, not from the source Cosmonauts repo or runtime project context files.
  - Verification: `tests/agent-packages/export.test.ts`, `tests/agent-packages/claude-binary-runner.test.ts`, and reviewer inspection.

- **QC-008 — Export command and main dispatch behavior**
  - Criterion: `cosmonauts export --definition <path> --out <path>` and `cosmonauts export <agent-id> --target claude-cli --out <path>` resolve bundled/plugin source agents, build/compile, print success JSON, fail unknown/unsupported-target/nonportable raw source prompts before compile, and are registered in both `cli/main.ts` dispatch sites.
  - Verification: `bun run test -- tests/cli/export/subcommand.test.ts tests/cli/export/main-dispatch.test.ts`.

- **QC-009 — Skill enables conversational authoring**
  - Criterion: `/skill:agent-packaging` documents how to derive external-safe package definitions from internal agents with human validation and target-runtime tool review.
  - Verification: `tests/skills/agent-packaging.test.ts` and reviewer inspection.

- **QC-010 — Full quality gates**
  - Criterion: After implementation, the repo passes the standard checks.
  - Verification: `bun run test && bun run lint && bun run typecheck`.
