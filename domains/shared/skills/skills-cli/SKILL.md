---
name: skills-cli
description: How to list and export cosmonauts skills to other agent harnesses (Claude Code, Codex) using the CLI. Use when listing available skills, exporting skills to Claude Code or Codex, or syncing skills across harnesses.
---

# Skills CLI

The `cosmonauts skills` subcommand manages skill discovery and cross-harness export.

## List Skills

```bash
cosmonauts skills list
```

Lists all skills across all domains with name, domain, and description.

## Export Skills

Export skills to another agent harness's skill directory:

```bash
# Export specific skills to Claude Code (project-level)
cosmonauts skills export -t claude roadmap plan task

# Export all skills to Claude Code
cosmonauts skills export -t claude --all

# Export to user-level directory (~/.claude/skills or ~/.codex/skills)
cosmonauts skills export -t claude --personal

# Export to Codex
cosmonauts skills export -t codex task plan
```

### Targets

| Target | Project directory | Personal directory |
|--------|------------------|--------------------|
| `claude` | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| `codex` | `.codex/skills/<name>/` | `~/.codex/skills/<name>/` |

### What Gets Exported

Each skill's `SKILL.md` is copied to the target directory, preserving the skill name as the subdirectory. The exported files follow the Agent Skills standard and are immediately discoverable by the target harness.

### Typical Use

After adding or updating skills, re-export to keep other harnesses in sync:

```bash
cosmonauts skills export -t claude --all
```

Ensure the target directory (e.g., `.claude/`) is in `.gitignore` — exported skills are local, not committed.
