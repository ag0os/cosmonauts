---
name: cosmonauts-skills
description: Install cosmonauts' internal skills into an external agent harness (Claude Code, Codex) so the calling agent can learn cosmonauts-internal procedures (writing plans, scaffolding tasks, distilling memory, etc.). Use this skill when the user wants to import cosmonauts skills, sync them between harnesses, or discover which skills cosmonauts ships.
---

# `cosmonauts skills` (for external agents)

This is the **external twin** of cosmonauts' internal `skills-cli` skill. It's about pulling cosmonauts' *internal* skills (the ones cosmonauts agents use — `plan`, `task`, `drive`, `archive`, `pi`, `spawning`, etc.) into your harness so you can learn the same procedures.

**Not the same as this bundle.** The skills exposed by `cosmonauts skills export` are the *internal* skills cosmonauts ships for its own agents. The `cosmonauts` skill bundle you're reading right now is shipped separately at `external-skills/cosmonauts/` and is installed by manual copy (see the main `cosmonauts` SKILL.md). Don't try to install this bundle via `cosmonauts skills export` — it isn't in the discovery surface.

## Discover what's available

```bash
cosmonauts skills list --json
```

Returns an array of `{name, domain, description}` rows. As of cosmonauts ~0.1, common entries:

| Skill | Domain | What it teaches |
| --- | --- | --- |
| `plan` | shared | Authoring plan documents and `spec.md` |
| `task` | shared | Authoring task files with frontmatter, AC, dependencies |
| `drive` | shared | Running the driver loop, commit policies, backends |
| `archive` | shared | Archiving completed plans into memory |
| `pi` | shared | Pi framework API reference (current pinned version) |
| `spawning` | shared | Subagent spawning and coordination |
| `agent-packaging` | shared | Exporting cosmonauts agents as Claude Code binaries |
| `init` | shared | Bootstrapping a new project for cosmonauts |
| `roadmap` | shared | Reading and maintaining `ROADMAP.md` |
| `skill-writing` | shared | Writing new skills |
| `skills-cli` | shared | Using `cosmonauts skills` from inside cosmonauts |

The exact set depends on installed domains; always re-check with `--json`.

## Install a few into your harness

```bash
# Project-level (./.claude/skills/ or ./.codex/skills/)
cosmonauts skills export -t claude task plan drive
cosmonauts skills export -t codex task plan drive

# User-level (~/.claude/skills/ or ~/.codex/skills/)
cosmonauts skills export -t claude --personal task plan

# Everything (use sparingly — many skills target internal agents, not external use)
cosmonauts skills export -t claude --all
```

| Target | Project path | Personal path |
| --- | --- | --- |
| `claude` | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| `codex` | `.codex/skills/<name>/` | `~/.codex/skills/<name>/` |

Each skill's `SKILL.md` is copied verbatim into a directory named after the skill. The exported files follow the [Agent Skills](https://github.com/anthropics/skills) standard.

## External framework integration stack

For Claude Code, Codex, Gemini CLI, or another framework that can call shell commands, use the integration surfaces in this order:

1. **External `cosmonauts` skill bundle.** Install `external-skills/cosmonauts/` first. It teaches the outside agent the public CLI contract, including discovery, plan/task commands, workflows, and drive usage. This bundle is installed by manual copy, not by `cosmonauts skills export`.
2. **Drive-oriented internal skills.** Export `plan`, `task`, and `drive` when the outside agent should create structured work and then run it through `cosmonauts drive`.

```bash
cosmonauts skills export -t claude plan task drive
cosmonauts skills export -t codex plan task drive
```

The actual execution surface is still the CLI:

```bash
cosmonauts drive run --plan <slug> --backend codex --mode detached
cosmonauts drive status <runId> --plan <slug>
cosmonauts drive list
```

3. **Agent packaging skill.** Export `agent-packaging` only when the external framework wants to build portable specialist agents from Cosmonauts agent definitions. This teaches the package-design workflow; the actual binary export is done with `cosmonauts export`.

```bash
cosmonauts skills export -t claude agent-packaging
cosmonauts export --definition ./agent-package.json --out ./bin/<agent-name>
```

## What to actually export

Most cosmonauts internal skills are written for cosmonauts' own agents (cosmo, cody, planner, worker, etc.) and reference internal tools you don't have. Useful to an outside agent:

- **`plan`** — explains the plan file format, the planning protocol, what makes a good plan. Useful when authoring plans to push into cosmonauts via `cosmonauts plan create --spec "..."`.
- **`task`** — explains the task file format, AC checklists, dependency rules. Useful when authoring tasks for `cosmonauts task create --from-file`.
- **`drive`** — explains the driver loop and commit policies. Useful when invoking `cosmonauts drive run` and interpreting the run output.
- **`agent-packaging`** — useful when designing an external-safe packaged agent for `cosmonauts export`; skip it for ordinary plan/task/drive automation.
- **`pi`** — Pi framework API reference. Only useful if you're modifying cosmonauts itself.

Skip these unless you have a specific need; they assume an internal-agent perspective:

- `skills-cli` (internal version of this skill)
- `spawning`, `archive`, `init`, `roadmap`, `skill-writing`

## Keeping them in sync

Re-export after a cosmonauts upgrade to pull updated skill text:

```bash
cosmonauts skills export -t claude --all --personal
```

Add `.claude/`, `.codex/` (or just `*/skills/cosmonauts*` patterns) to `.gitignore` — exported skills are local artifacts, not committed.

## What this command does NOT do

- It does **not** install the `cosmonauts` external bundle (this skill set you're reading). That ships at `external-skills/cosmonauts/` in the npm package and is installed by manual copy — see the main `cosmonauts` SKILL.md for the `cp -r` command.
- It does **not** install cosmonauts itself. You need cosmonauts globally (or in `node_modules/`) before any `cosmonauts skills *` command works.
- It does **not** version-pin. Re-exporting overwrites; if you want pinning, copy the exported `SKILL.md` files into version control as part of your harness setup.

## See also

- The main `cosmonauts` SKILL.md — for everything else about driving cosmonauts from outside.
- `cosmonauts skills --help` — exhaustive flag reference.
- The internal `skills-cli` skill (export it if curious) — for the cosmonauts-internal-agent view of the same command.
