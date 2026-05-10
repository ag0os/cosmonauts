# Prompt Composition

Agents in Cosmonauts get their system prompt assembled at session creation by `lib/domains/prompt-assembly.ts` from a strict four-layer order. The agent's `AgentDefinition` (`id`, `domain`, `capabilities`) determines what loads.

## The four layers

```
Layer 0  domains/shared/prompts/base.md                 (always; identity + mission)
Layer 1  {domain}/capabilities/{cap}.md                 (in declared order; falls back to shared/)
Layer 2  {domain}/prompts/{agent-id}.md                 (the persona file)
Layer 3  domains/shared/prompts/runtime/sub-agent.md    (only when spawned, not for top-level)
```

- **Layer 0** — Universal base. Identity and mission for every agent.
- **Layer 1** — Capability packs declared in the agent's `capabilities` array, loaded in order. Each name resolves to `{domain}/capabilities/{name}.md` first, falling back to `shared/capabilities/{name}.md`. Examples: `core`, `tasks`, `spawning`, `engineering-discipline`, `coding-readwrite`, `coding-readonly`, `architectural-design`, `todo`, `drive`.
- **Layer 2** — Persona. One file per agent at `{domain}/prompts/{agent-id}.md`. The persona defines role, workflow, decision rules — and gets the strongest recency weight, since it loads last for top-level sessions.
- **Layer 3** — Runtime overlay for sub-agents. Adds parent role, objective, task ID. Top-level sessions skip it.

YAML frontmatter is stripped on load, so prompt files can carry metadata without leaking into the model's context.

## Capability resolution

With a domain resolver (the default at runtime), Layer 1 lookups are three-tier: agent's domain → portable domains → shared. Without one (e.g., direct file-based assembly), it's two-tier: domain → shared.

A capability that doesn't exist in either tier raises an error — capabilities are required to resolve.

## Examples

### `main/cosmo` — executive assistant

Definition: `domains/main/agents/cosmo.ts`
Capabilities: `[core, tasks, spawning, todo, drive]`

Final stack:
- L0 `domains/shared/prompts/base.md`
- L1 `domains/shared/capabilities/core.md`
- L1 `domains/shared/capabilities/tasks.md`
- L1 `domains/shared/capabilities/spawning.md`
- L1 `domains/shared/capabilities/todo.md`
- L1 `domains/shared/capabilities/drive.md`
- L2 `domains/main/prompts/cosmo.md`

### `coding/cody` — coding-domain lead

Definition: `bundled/coding/coding/agents/cody.ts`
Capabilities: `[core, engineering-discipline, coding-readwrite, tasks, spawning, todo]`

Final stack:
- L0 `domains/shared/prompts/base.md`
- L1 `domains/shared/capabilities/core.md`
- L1 `bundled/coding/coding/capabilities/engineering-discipline.md`
- L1 `bundled/coding/coding/capabilities/coding-readwrite.md`
- L1 `domains/shared/capabilities/tasks.md`
- L1 `domains/shared/capabilities/spawning.md`
- L1 `domains/shared/capabilities/todo.md`
- L2 `bundled/coding/coding/prompts/cody.md`

## Inspecting a composed prompt

To see the assembled prompt for any agent:

```bash
cosmonauts --dump-prompt -a coding/cody --file /tmp/cody-prompt.txt
cosmonauts --dump-prompt -a cosmo --file /tmp/cosmo-prompt.txt
```

Omit `--file` to print to stdout.

## Iterating on prompts

- **Persona-level changes** (rules unique to one agent) → edit Layer 2 `.md`. Same name as the agent ID, no other wiring.
- **Cross-agent norms** (e.g., comment policy, bash rules) → edit a Layer 1 capability. Touches every agent that lists it.
- **New cross-cutting discipline** → add `domains/shared/capabilities/foo.md`, then add `"foo"` to `capabilities` in the agent definitions you want it on. Order in the array = order in the prompt.
- **Domain-specific override of a shared capability** → drop a same-named file under the domain's `capabilities/` directory; the resolver picks the domain copy first.
