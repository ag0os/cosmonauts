## Bundled Package Specifications

### Full Coding Domain (`bundled/coding/`)

#### `cosmonauts.json`
```json
{
  "name": "coding",
  "version": "0.1.0",
  "description": "Full-featured coding domain with agents, tools, and skills for software development",
  "domains": [
    { "name": "coding", "path": "coding" }
  ]
}
```

#### Contents (moved from `domains/coding/`)

**14 agents:** cosmo, planner, task-manager, coordinator, worker, quality-manager, reviewer, fixer, implementer, test-writer, refactorer, tdd-planner, tdd-coordinator, adaptation-planner

**14 persona prompts:** One `.md` per agent

**4 capabilities:** architectural-design, coding-readonly, coding-readwrite, engineering-discipline

**8 skills:** deepwiki, engineering-principles, languages, playwright-cli, refactoring, reference-adaptation, tdd, web-search

**5 workflows:** plan-and-build, implement, verify, tdd, adapt

---

### Minimal Coding Domain (`bundled/coding-minimal/`)

#### `cosmonauts.json`
```json
{
  "name": "coding-minimal",
  "version": "0.1.0",
  "description": "Minimal coding domain with essential agents for getting started",
  "domains": [
    { "name": "coding", "path": "coding" }
  ]
}
```

#### Contents (subset of full)

**6 agents:**
- `cosmo` — Main orchestrator
- `planner` — Solution design
- `task-manager` — Task creation from plans
- `coordinator` — Implementation loop driver
- `worker` — Single-task implementer
- `quality-manager` — Review and remediation

**6 persona prompts:** One `.md` per agent

**4 capabilities:** Same as full (all are needed by the 6 agents)

**3 skills:**
- `engineering-principles` — Core design guidance
- `languages/` — Language-specific knowledge (TypeScript)
- `web-search/` — Web search tool usage

**3 workflows:**
- `plan-and-build` — `planner -> task-manager -> coordinator -> quality-manager`
- `implement` — `task-manager -> coordinator -> quality-manager`
- `verify` — `quality-manager`

Note: Both packages produce domain ID `"coding"`. Installing the full package after the minimal one replaces it (or merges, with the full package winning on all overlapping agents).

---

## Directory Structure After Extraction

```
cosmonauts/
├── bin/cosmonauts                    # CLI entry point
├── cli/                              # CLI implementation
│   ├── main.ts
│   ├── session.ts
│   ├── packages/subcommand.ts        # install, uninstall, packages list
│   ├── create/subcommand.ts          # create domain
│   ├── update/subcommand.ts          # update [name] [--all]  ← NEW
│   ├── plans/
│   ├── tasks/
│   └── skills/
├── lib/                              # Framework core
│   ├── agents/
│   ├── config/
│   ├── domains/
│   │   ├── loader.ts
│   │   ├── registry.ts
│   │   ├── resolver.ts               # DomainResolver
│   │   ├── validator.ts
│   │   └── types.ts
│   ├── orchestration/
│   ├── packages/
│   │   ├── catalog.ts                # Points to bundled/
│   │   ├── installer.ts
│   │   ├── scanner.ts
│   │   ├── store.ts
│   │   └── types.ts
│   ├── plans/
│   ├── tasks/
│   ├── workflows/
│   └── runtime.ts
├── domains/                          # Framework built-in (ONLY shared)
│   └── shared/
│       ├── domain.ts
│       ├── capabilities/             # core, spawning, tasks, todo
│       ├── extensions/               # tasks, plans, orchestration, todo, init, observability
│       ├── prompts/                  # base.md, runtime/sub-agent.md
│       └── skills/                   # archive, plan, roadmap, task, pi, skills-cli
├── bundled/                          # Installable domain packages (shipped with framework)
│   ├── coding/                       # Full coding domain package
│   │   ├── cosmonauts.json
│   │   └── coding/
│   │       ├── domain.ts
│   │       ├── agents/               # 14 agents
│   │       ├── prompts/              # 14 prompts
│   │       ├── capabilities/         # 4 capabilities
│   │       ├── skills/               # 8 skills
│   │       └── workflows.ts          # 5 workflows
│   └── coding-minimal/              # Minimal coding domain package
│       ├── cosmonauts.json
│       └── coding/
│           ├── domain.ts
│           ├── agents/               # 6 agents
│           ├── prompts/              # 6 prompts
│           ├── capabilities/         # 4 capabilities
│           ├── skills/               # 3 skills
│           └── workflows.ts          # 3 workflows
├── tests/
├── package.json
└── AGENTS.md
```

---

## User Flow

### New User (fresh install)
```bash
npm install -g cosmonauts            # Install CLI globally
cosmonauts                           # First run
# → "No domains installed. Install the coding domain to get started:"
# → "  cosmonauts install coding"
# → "  cosmonauts install coding-minimal  (lightweight)"

cosmonauts install coding            # Installs to ~/.cosmonauts/packages/coding/
cd my-project
cosmonauts init                      # Creates .cosmonauts/config.json
cosmonauts "build an auth system"    # Works!
```

### Existing User (updating)
```bash
npm update -g cosmonauts             # Updates framework + bundled packages
cosmonauts update coding             # Re-copies latest bundled/coding/ to store
```

### Project-Specific Customization
```bash
cd my-project
cosmonauts install --local ./my-custom-agents  # Local override
# .cosmonauts/packages/my-custom-agents/ takes precedence over global
```

### Framework Developer
```bash
cd cosmonauts/                       # In the framework repo
cosmonauts "fix a bug"              # Auto-detects framework repo, uses bundled/coding as plugin
# No manual install needed during development
```

---

## Update Command Specification

### `cosmonauts update [name] [--all] [--local]`

| Flag | Purpose |
|------|---------|
| `name` | Specific package to update (e.g., `coding`) |
| `--all` | Update all installed packages |
| `--local` | Only update project-local packages |

### Update Strategy Per Source Type

| Package origin | Update action |
|----------------|---------------|
| Catalog (bundled) | Re-copy from `bundled/<name>/` |
| Git clone | `git -C <path> pull` or re-clone |
| Symlinked (`--link`) | Skip (already live) |
| Local copy | Warn: source unknown, suggest re-install |

### Determining Package Origin

The installer should record the source type and origin URL/path in a metadata file alongside the installation:

```
~/.cosmonauts/packages/coding/
├── .cosmonauts-meta.json    # { "source": "catalog", "catalogName": "coding", "installedAt": "..." }
├── cosmonauts.json
└── coding/
    └── ...
```

```
~/.cosmonauts/packages/my-domain/
├── .cosmonauts-meta.json    # { "source": "git", "url": "https://github.com/user/repo", "branch": "main" }
├── cosmonauts.json
└── ...
```

This metadata file is written by the installer and read by the update command. Without it, the update command cannot determine how to update.