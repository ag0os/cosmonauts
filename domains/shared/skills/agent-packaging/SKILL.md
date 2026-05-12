---
name: agent-packaging
description: Guide a human through designing, reviewing, and exporting an external-safe AgentPackageDefinition for packaged agents. Use when authoring package definitions or preparing cosmonauts export artifacts for external runtimes.
---

# Agent Packaging

Use this skill when a human wants to package a Cosmonauts-style agent for an external runtime. The goal is a reviewed `AgentPackageDefinition`, not a blind dump of an internal agent prompt.

## Start with source-agent inspection

When a package is derived from an existing agent, inspect the source agent definition before drafting the external prompt:

- Read the agent's identity, capabilities, prompt layers, configured tools, extensions, skills, subagents, model, and thinking level.
- Identify which source-agent tools and workflows are unavailable in the target runtime.
- Surface those tool gaps and behavior differences to the human before writing or rewriting the prompt.
- Ask which unavailable behaviors should be omitted, replaced with target-native tools, or documented as manual expectations.

Do not assume the target runtime can call Cosmonauts orchestration tools, extensions, project skill loading, or task-system helpers unless the package definition explicitly maps those capabilities to target-safe tools.

## Draft an external-safe prompt collaboratively

Work with the human to produce a prompt that makes sense in the destination runtime:

1. Summarize the source agent's useful responsibilities and the unavailable-tool gaps.
2. Propose an external-safe prompt that describes only capabilities the exported agent can actually use.
3. Review the prompt with the human and revise it until internal-only references are removed or replaced.
4. Choose skill delivery declaratively: usually `mode: "none"`, `mode: "source-agent"`, or an allowlist of skill names that should be embedded.
5. Choose the target tool policy declaratively. Pick the package `tools.preset` and, when needed, target-specific `targets["claude-cli"].allowedTools` rather than copying internal tool names by habit.

## Author the AgentPackageDefinition

Write or present a complete `AgentPackageDefinition` for human review. Include:

- `schemaVersion: 1`
- a stable package `id` and clear `description`
- optional `sourceAgent` provenance
- a prompt source (`source-agent`, `file`, or `inline`) that matches the safety review
- a declarative `tools` policy
- a declarative `skills` selection
- `projectContext: "omit"`
- a target block such as `targets["claude-cli"]` with prompt mode, inline skill delivery, and any target-native allowed tools

Prefer an explicit external-safe prompt for agents whose internal instructions depend on Cosmonauts orchestration. Use `prompt.kind: "source-agent"` only when compatibility checks show the internal prompt and tool assumptions are safe for the target runtime.

## Raw-export warning

Do not blindly export internal prompts. Raw export is unsafe when a prompt mentions Cosmonauts-only tools or workflows that the external runtime cannot provide, including `spawn_agent`, `chain_run`, or `drive`. If those appear in a source prompt, stop and collaborate with the human on an external-safe prompt and a reviewed package definition instead of shipping the raw internal prompt.

## Final compilation step

After the human has reviewed the definition, compile it with:

```bash
cosmonauts export --definition <path> --out <path>
```

Run the command only after the package definition, prompt, skill selection, and target tool policy have been reviewed for the target runtime.
