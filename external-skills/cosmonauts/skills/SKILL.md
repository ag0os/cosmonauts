---
name: cosmonauts-skills
description: Install cosmonauts' internal skills into an external agent harness (Claude Code, Codex) so the calling agent can learn cosmonauts-internal procedures (writing plans, scaffolding tasks, distilling memory, etc.). Use this skill when the user wants to import cosmonauts skills, sync them between harnesses, or discover which skills cosmonauts ships.
---

# `cosmonauts skills` (for external agents)

This is the **external twin** of cosmonauts' internal skills CLI guidance. It is about pulling runtime-visible internal skills into your harness so you can learn the same procedures.

**Not the same as this bundle.** The skills exposed by `cosmonauts skills export` are the *internal* skills cosmonauts ships for its own agents. The `cosmonauts` skill bundle you're reading right now is one stable-authority harness asset. Synchronize it through `cosmonauts harness sync`, not `cosmonauts skills export`.

## Discover what's available

```bash
cosmonauts skills list --json
```

Returns an array of `{name, domain, description}` rows.

When `../references/generated-inventory.md` is present, its skills section contains the same sync-time visible rows. The exact set depends on the current project; always use the generated file or `cosmonauts skills list --json` instead of an authored list.

## Install a few into your harness

```bash
cosmonauts skills export -t <target> <skill-name>
cosmonauts skills export -t <target> --personal <skill-name>
cosmonauts skills export -t <target> --all
```

Each skill's `SKILL.md` is copied verbatim into a directory named after the skill. The exported files follow the [Agent Skills](https://github.com/anthropics/skills) standard.

## External framework integration stack

For Claude Code, Codex, or another framework that can call shell commands, use the integration surfaces in this order:

1. **External `cosmonauts` skill bundle.** Synchronize the stable-authority bundle first. It teaches the outside agent the public CLI contract, including discovery, plan/task commands, named chains, and Drive usage.
2. **Internal skills, only when explicitly needed.** `cosmonauts skills export` copies internal Cosmonauts-agent skills, not the external CLI bundle. Select live rows by their descriptions when an outside agent needs a detailed internal procedure.

The actual execution surface is still the CLI:

```bash
cosmonauts run drive --plan <slug> --backend codex --mode detached
cosmonauts run status <runId> --scope <slug>
cosmonauts run list --scope <slug>
```

3. **Agent packaging.** Export the applicable live skill only when the external framework wants to build portable specialist agents from Cosmonauts agent definitions. The actual binary export is done with `cosmonauts export`.

```bash
cosmonauts skills export -t <target> <skill-name>
cosmonauts export --definition ./agent-package.json --out ./bin/<agent-name>
```

## Choose exports from live facts

Many internal skills assume an internal-agent perspective. Read the live descriptions and export only the procedures the outside agent actually needs.

## Keeping them in sync

Re-export after a cosmonauts upgrade to pull updated skill text:

```bash
cosmonauts skills export -t claude --all --personal
```

Keep exported harness assets local unless the owning project explicitly tracks them.

## What this command does NOT do

- It does **not** install the `cosmonauts` external bundle (this skill set you're reading). Use `cosmonauts harness sync --asset external-skill:cosmonauts` for that stable-authority asset.
- It does **not** install cosmonauts itself. You need cosmonauts globally (or in `node_modules/`) before any `cosmonauts skills *` command works.
- It does **not** version-pin. Re-exporting overwrites; if you want pinning, copy the exported `SKILL.md` files into version control as part of your harness setup.

## See also

- The main `cosmonauts` SKILL.md — for everything else about driving cosmonauts from outside.
- `cosmonauts skills --help` — exhaustive flag reference.
- The internal `skills-cli` skill (export it if curious) — for the cosmonauts-internal-agent view of the same command.
