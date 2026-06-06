# External Agent Orchestration Phase 1: Packaged Claude Export

## Product Goal

Phase 1 proves that a Cosmonauts-authored agent package can run outside the Cosmonauts process on the Claude Code CLI subscription path. The exported artifact is a standalone Bun-compiled binary that embeds its prompt and selected skills, materializes only temporary prompt assets at runtime, and shells out to `claude` with subscription-safe defaults.

The source of truth for export is a declarative `AgentPackageDefinition`, not a raw internal `AgentDefinition`. A definition may reference an internal source agent for provenance/default metadata, but it may also describe a standalone external agent with no Cosmonauts source agent.

## Functional Requirements

1. Package definitions are JSON files with `schemaVersion: 1`, `id`, `description`, `prompt`, `tools`, `skills`, `projectContext: "omit"`, and `targets`.
2. Prompt sources support:
   - `source-agent` for raw source-agent prompt export when compatibility checks pass;
   - `file` paths resolved relative to the definition file, with markdown frontmatter stripped;
   - `inline` content for generated one-file definitions.
3. Package definitions can reference `sourceAgent` for provenance, model/thinking metadata, source-agent skills, or raw prompt assembly. `prompt.kind: "source-agent"` and `skills.mode: "source-agent"` require `sourceAgent`.
4. Raw source-agent export is compatibility-gated. It rejects source agents with extensions, subagents, or extension-backed capabilities such as `spawning`, `tasks`, `todo`, or `drive`. Explicit `file`/`inline` prompts may still reference those agents for provenance and metadata.
5. Selected skills are embedded as full markdown bodies, not only a skill index. Both flat `.md` skills and directory `SKILL.md` skills are supported; YAML frontmatter is stripped from embedded skill content.
6. Source-agent skill mode preserves the current internal shared-skill filtering behavior when project-level skills are configured.
7. The schema may contain future target keys (`codex`, `gemini-cli`, `open-code`), but Phase 1 export supports only `claude-cli`. Attempts to export to unsupported targets fail clearly before compile.
8. `cosmonauts export --definition <path> --out <path> [--target claude-cli]` compiles a package definition to a standalone binary. `--target` defaults to `claude-cli`.
9. `cosmonauts export <agent-id> --target claude-cli --out <path>` is a shorthand that first normalizes the source agent into an `AgentPackageDefinition` and then follows the same package build path.
10. Export bootstrap uses the same bundled-domain discovery seam as the main CLI and Drive's `cosmonauts-subagent` path so dogfood agents such as `coding/explorer` resolve in this repo.
11. Exported binaries accept prompt input from trailing args or stdin. Trailing args take precedence and must not wait on stdin. If no prompt is available, the binary prints usage and exits non-zero.
12. Exported binaries run `claude -p --bare --setting-sources ""` with append prompt mode by default and replace prompt mode as an opt-in.
13. Prompt asset temp files are separate from the Claude working directory. Claude runs in the caller's current working directory so its tools operate on the project where the binary is invoked.
14. Subscription safety is the default: unless `--allow-api-billing` is passed at binary runtime, the Claude child environment omits `ANTHROPIC_API_KEY`, prints a clear stderr diagnostic, and preserves other environment variables.
15. Missing Claude binaries or spawn failures produce diagnostics naming the runtime (`claude-cli`), binary path, and likely remediation.
16. `/skill:agent-packaging` teaches agents how to inspect source agents, identify unavailable internal tools, draft external-safe prompts with a human, choose target tool/skill policy, and author/export package definitions.

## Non-goals for Phase 1

- External runtime dispatch inside chains.
- Drive migration to packaged agents.
- Adding `AgentDefinition.kind` or external agent definitions to domain manifests.
- Automatic prompt rewriting of arbitrary internal agents.
- Codex/Gemini/open-code export parity.
- Claude plugin-dir skill delivery.
- Persisting runtime activity back into Cosmonauts memory.
- Adding a first-class Pi tool for package export.

## Key Constraints

- Existing internal chains, workflows, Drive, and Pi-backed agent sessions must remain unchanged.
- Internal `AgentDefinition` stays runtime-neutral; runtime-specific options live in package target blocks.
- Exported binaries must not require the Cosmonauts source repo after compilation.
- Claude command/env mapping must be single-sourced behind the package/runtime module, not duplicated in CLI, Drive, or future chain integration.
