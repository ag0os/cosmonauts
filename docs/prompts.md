# Prompt Composition

Agents in Cosmonauts get their system prompt assembled at session creation by `lib/domains/prompt-assembly.ts` from a strict four-layer order. The agent's `AgentDefinition` (`id`, `domain`, `capabilities`) determines what loads.

## The four layers

These paths describe consumer resources, not files shipped by Cosmonauts.

```text
Layer 0  <frameworkPromptsDir>/base.md           (only when explicitly supplied)
Layer 1  <domain>/capabilities/<name>.md         (in declared order)
Layer 2  inline/file instructions or persona    (required)
Layer 3  consumer subAgentTemplate              (sub-agent mode only)
```

- **Layer 0** - Consumer base. `frameworkPromptsDir` is an optional input to `assemblePrompts`; there is no default base voice.
- **Layer 1** - Capability packs declared in the agent's `capabilities` array, loaded in order.
- **Layer 2** - Persona. `instructions` supplies inline content or an absolute file path. Without instructions, the assembler resolves `prompts/<agent-id>.md` from consumer resources.
- **Layer 3** - Runtime overlay for sub-agents. A supplied `subAgentTemplate` can render `parentRole`, `objective` and `taskId`. Top-level sessions skip it; absent template means no overlay.

YAML frontmatter is stripped from loaded prompt files. Inline instructions are used as text. Explicit instructions have runtime identity markers stripped before the host appends its marker.

## Capability resolution

With a `DomainResolver`, lookups use the agent's resource domain, portable domains, then domains declaring `resourceFallback`. Without one, directory callers supply `domainsDir`, `domain` and any `fallbackDomains` explicitly. No fallback domain name is invented.

A capability that does not resolve raises an error. Explicit instructions with no capabilities can be assembled without a domain directory.

## Inspecting a composed prompt

To see the assembled prompt for an agent in your supplied domain:

```bash
cosmonauts --plugin-dir ./domains --dump-prompt -a notes/researcher --file /tmp/agent-prompt.txt
```

Omit `--file` to print to stdout.

## Iterating on prompts

- **Persona-level changes** (rules unique to one agent): edit the inline instructions, instruction file or convention-based persona.
- **Cross-agent norms**: edit a capability pack. It affects every agent that lists it.
- **New cross-cutting discipline**: add a capability to a consumer resource domain, then add its name to the agent definitions you want it on. Order in the array is order in the prompt.
- **Domain-specific override of a fallback capability**: place a same-named file under the domain's `capabilities/` directory; the resolver picks the domain copy first.

The implementation is `lib/domains/prompt-assembly.ts`; the public entry is `cosmonauts/domains` (`assemblePrompts`, `DomainResolver`). Session assembly uses `runtime.subAgentTemplate` for spawned context.
