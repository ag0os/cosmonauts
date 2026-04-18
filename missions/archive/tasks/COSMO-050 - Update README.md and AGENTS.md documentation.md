---
id: COSMO-050
title: Update README.md and AGENTS.md documentation
status: Done
priority: medium
assignee: worker
labels:
  - frontend
  - 'plan:local-vs-shared'
dependencies:
  - COSMO-047
  - COSMO-048
createdAt: '2026-03-06T14:49:50.833Z'
updatedAt: '2026-03-06T15:01:59.645Z'
---

## Description

Update project documentation to reflect the new local-vs-shared separation, the init scaffold, and the config-based workflow setup.

**README.md changes:**
- Add a "Getting Started" section after "Installation" that walks through:
  1. `cosmonauts-tasks init` to scaffold local directories
  2. Copying `.cosmonauts/config.example.json` to `.cosmonauts/config.json` and customizing
  3. Running first workflow
- Update the directory structure in "Architecture" section to note that `missions/` and `memory/` are local (gitignored), not part of the cloned repo
- Update "Named Workflows" section to note workflows are defined in project config, not built-in

**AGENTS.md changes:**
- Update "Key Directories" section to clarify which directories are local (gitignored) vs tracked:
  - `missions/` — local, gitignored, created by `cosmonauts-tasks init`
  - `memory/` — local, gitignored, created by init
  - `.cosmonauts/` — local config, gitignored (copy from `config.example.json`)
- Update "Named Workflows" table to note they come from project config
- Update "Work Lifecycle" section if it references tracked mission files

<!-- AC:BEGIN -->
- [x] #1 README.md contains a 'Getting Started' section describing init, config setup, and first workflow
- [x] #2 README.md architecture section notes that `missions/` and `memory/` are local/gitignored
- [x] #3 AGENTS.md 'Key Directories' section distinguishes local (gitignored) directories from tracked ones
- [x] #4 AGENTS.md notes that workflows are defined in `.cosmonauts/config.json`, not built into the framework
- [x] #5 No broken markdown links or formatting issues in either file
<!-- AC:END -->

## Implementation Notes

Updated both README.md and AGENTS.md:

**README.md:**
- Added 'Getting Started' section after Installation with init, config setup, and first workflow steps
- Updated architecture directory tree to mark missions/, memory/, .cosmonauts/ as local/gitignored
- Updated Multi-Agent Pipelines section to note workflows come from .cosmonauts/config.json

**AGENTS.md:**
- Split Key Directories into 'Tracked (in repo)' and 'Local (gitignored)' sections
- Updated Named Workflows to note they're defined in .cosmonauts/config.json, not built-in; removed `plan` workflow not in example config
- Updated Work Lifecycle to note all work artifacts are local/gitignored

Commit: 61dae76
