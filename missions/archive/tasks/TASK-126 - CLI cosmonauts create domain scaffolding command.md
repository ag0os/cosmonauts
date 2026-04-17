---
id: TASK-126
title: 'CLI: cosmonauts create domain scaffolding command'
status: Done
priority: low
assignee: worker
labels:
  - cli
  - 'plan:package-system'
dependencies:
  - TASK-114
createdAt: '2026-03-28T20:36:51.524Z'
updatedAt: '2026-03-28T20:48:56.798Z'
---

## Description

Create `cli/create/subcommand.ts` implementing `cosmonauts create domain <name>`. Generates a new package scaffold: `<name>/cosmonauts.json`, `<name>/<name>/domain.ts`, and empty subdirectories (`agents/`, `prompts/`, `capabilities/`, `skills/`, `workflows.ts`). Register the `create` subcommand in `cli/main.ts`. Add tests in `tests/cli/create/subcommand.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 cosmonauts create domain <name> creates the package directory at ./<name>/
- [ ] #2 Generated cosmonauts.json has name = the given name, version = '0.1.0', domains = [name]
- [ ] #3 Generated domain.ts exports a DomainManifest with the correct id and portable = false
- [ ] #4 All subdirectories (agents/, prompts/, capabilities/, skills/, extensions/) are created
- [ ] #5 Command errors clearly if the target directory already exists
- [ ] #6 Tests verify generated file contents and directory structure for a sample domain name
<!-- AC:END -->

## Implementation Notes

Implemented cli/create/subcommand.ts with scaffoldDomain() function and createCreateProgram() Commander factory. Registered 'create' in cli/main.ts subcommand dispatch. Tests in tests/cli/create/subcommand.test.ts cover all ACs. The domains field in cosmonauts.json uses PackageDomain[] format: [{name, path}] as required by the manifest validator.
