# Plan Review: domain-eject-and-tiers

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: low
  title: "Stale line reference for DomainSource in plan"
  plan_refs: "Key contracts section — 'DomainSource (unchanged — lib/packages/types.ts:29)'"
  code_refs: lib/packages/types.ts:39
  description: |
    The plan references `DomainSource` at `lib/packages/types.ts:29`. The interface actually starts at line 39. The type shape described in the plan is correct — only the line number is wrong. Workers referencing this line number will look at the wrong location. Fix the reference to `:39`.

- id: PR-002
  dimension: interface-fidelity
  severity: medium
  title: "Scanner file changes description omits required stat import"
  plan_refs: "Files to Change — scanner.ts entry"
  code_refs: lib/packages/scanner.ts:7-9
  description: |
    The plan's "Files to Change" entry for `lib/packages/scanner.ts` says: "add `homedir()` import, add two directory-existence-guarded `DomainSource` entries." The scanner currently imports only `basename`, `dirname`, `join` from `node:path` and has no `node:fs/promises` or `node:os` imports (scanner.ts:7-9).

    The plan's approach section says to use `stat()` to check directory existence. This requires adding `import { stat } from "node:fs/promises"` in addition to `import { homedir } from "node:os"`. The file change description mentions only `homedir`, which may cause a worker to miss the `stat` import.

    Alternatively, the plan could specify using `readdir` with a try/catch (matching the pattern in `store.ts:67-70`), but whichever approach is chosen, the import needs to be explicit in the task description.

- id: PR-003
  dimension: state-sync
  severity: medium
  title: "Eject searches both scopes but plan says 'local first for higher precedence' — actual precedence is inverted"
  plan_refs: "Approach — Eject section, step 1: 'Scans installed packages (both scopes, local first for higher precedence)'"
  code_refs: lib/packages/store.ts:56-62
  description: |
    The plan says eject scans "both scopes, local first for higher precedence" and takes the "first package with a domain matching the requested ID." But in the scanner's precedence system, local packages (precedence 2) are *higher* precedence than global packages (precedence 1). If eject returns the first match from the local scope, it picks the higher-precedence source — which is the one already winning in the merge. This is arguably correct behavior (eject what you're currently using), but the plan's phrasing "local first for higher precedence" is ambiguous and could be interpreted incorrectly.

    More importantly, this creates a semantic question the plan doesn't address: should eject always copy from the highest-precedence installed source? What if the user has the domain installed both globally and locally, and they want to eject the global version? The plan should specify that eject picks the highest-precedence installed source (local > global) and document this behavior, or accept it as a known limitation.

- id: PR-004
  dimension: risk-blast-radius
  severity: medium
  title: "Import rewrite regex doesn't account for domain.ts importing from lib/domains/ vs lib/agents/"
  plan_refs: "Approach — import rewrite regex, Risks — 'Import rewrite regex is too broad or too narrow'"
  code_refs: bundled/coding/coding/domain.ts:1, bundled/coding/coding/agents/cosmo.ts:1
  description: |
    The plan's regex `/from\s+"(?:\.\.\/)+lib\//g` correctly matches both depths: `domain.ts` uses `from "../../../lib/domains/types.ts"` and agents use `from "../../../../lib/agents/types.ts"`. However, the plan doesn't mention `workflows.ts`, which is at the same level as `domain.ts` and has `from "../../../lib/workflows/types.ts"` (bundled/coding/coding/workflows.ts:1).

    The regex would handle `workflows.ts` correctly since it matches the same `../` depth pattern. This is not a bug, but the plan's verification ("verified by grep") only mentions domain.ts (3 levels) and agents/*.ts (4 levels). The worker implementing the test should be told to assert that `workflows.ts` imports are also rewritten. If future domain files add non-type imports at the domain root level, the rewrite would change a runtime import — the plan should note `workflows.ts` explicitly as a rewrite target to ensure test coverage.

- id: PR-005
  dimension: duplication
  severity: low
  title: "DomainSource is defined in both lib/packages/types.ts and lib/domains/types.ts"
  plan_refs: "Key contracts section"
  code_refs: lib/packages/types.ts:39, lib/domains/types.ts:60
  description: |
    `DomainSource` is defined identically in both `lib/packages/types.ts:39` and `lib/domains/types.ts:60`. The scanner imports from `packages/types`, while the loader imports from `domains/types`. They are structurally identical so TypeScript resolves them as compatible. This pre-exists the plan and is not introduced by it, but the plan adds new code in both `scanner.ts` (which uses the packages version) and potentially `eject.ts`. The plan should be aware of this but does not need to fix it — noting for completeness.

- id: PR-006
  dimension: interface-fidelity
  severity: high
  title: "Eject copies domain dir but installed packages may use the parent-dir-as-domainsDir indirection"
  plan_refs: "Approach — Eject section, step 3: 'Resolves the source path: join(pkg.installPath, domain.path)'"
  code_refs: lib/packages/scanner.ts:102-107
  description: |
    The plan says eject copies `join(pkg.installPath, domain.path)` to `.cosmonauts/domains/<domainId>/`. For the common case (e.g., package "coding" with `domain.path = "coding"`), this gives source = `<store>/coding/coding/` and target = `.cosmonauts/domains/coding/`.

    The scanner for new project-domains tier would add `.cosmonauts/domains/` as the `domainsDir`. Then `loadDomains(".cosmonauts/domains/")` would scan its children, find `coding/`, and load `coding/domain.ts`. This works correctly.

    However, there is an edge case the plan does not address: if a package has `domain.path = "nested/coding"`, then `join(pkg.installPath, "nested/coding")` resolves to `<store>/pkg/nested/coding/`. The eject copies this to `.cosmonauts/domains/coding/`. This is correct because the eject target uses the domain *name* (ID), not the path. But the plan should state this explicitly — the target directory name comes from `domain.name` (the ID), not from the last segment of `domain.path`. If these differ (e.g., `name: "my-coding"`, `path: "coding"`), the ejected directory must be named by the ID.

    Looking at the plan's `EjectOptions`, it accepts `domainId` and the eject result has `ejectedTo`. The plan needs to clarify: the target path is `.cosmonauts/domains/<domainId>/` where `domainId` comes from `PackageDomain.name`, and the source path is `join(pkg.installPath, domain.path)` where the match is found by `domain.name === domainId`. If the worker uses `domain.path` as the target directory name instead of `domain.name`, ejected domains with non-matching name/path would be placed in the wrong directory and not discovered by the scanner.

- id: PR-007
  dimension: user-experience
  severity: medium
  title: "No guidance for when cosmonauts is not a project dependency"
  plan_refs: "Assumptions — 'The cosmonauts package name is resolvable for import type'"
  code_refs: package.json:1-30
  description: |
    The plan assumes `from "cosmonauts/lib/agents/types.ts"` is resolvable for IDE/typecheck support. But `cosmonauts` is a CLI tool installed globally or via `npx` — it is not typically listed in a project's `package.json` dependencies. The `package.json` has no `exports` field, so bare-specifier resolution of `cosmonauts/lib/...` requires the package to be in `node_modules/`.

    For users who installed cosmonauts globally (`npm i -g cosmonauts`), the rewritten imports won't resolve in the project context. The IDE will show type errors in ejected files. The plan acknowledges this is "for IDE support only" and runtime-irrelevant, but the rewrite actively *introduces* red squiggles that weren't there before (the original relative paths were also broken from the store, but users never saw those files).

    Mitigation: the eject output message should mention that adding `cosmonauts` as a dev dependency enables type support in ejected files, or the rewrite could use a relative path from `.cosmonauts/domains/` back to `node_modules/cosmonauts/lib/` — though that's fragile. This is medium severity because it affects developer experience but not correctness.

- id: PR-008
  dimension: quality-contract
  severity: medium
  title: "No quality criterion for eject from link-installed packages"
  plan_refs: "Quality Contract"
  code_refs: lib/packages/installer.ts:158
  description: |
    The installer supports `--link` mode (installer.ts:158) which creates a symlink instead of copying. If a domain is installed via `--link`, `pkg.installPath` is a symlink. The eject function uses `cp(source, target, { recursive: true })` where source is `join(pkg.installPath, domain.path)`. Node's `cp` follows symlinks for the source path, so this should work — but it means the ejected copy contains the actual files from the link target, not symlinks.

    The quality contract has no test for this scenario. If `cp` behavior changes or the eject function adds `lstat`-based checks, link-installed packages could silently break. Add a QC for eject from a link-installed package.

- id: PR-009
  dimension: risk-blast-radius
  severity: medium
  title: "Plan does not address eject when no matching domain is found in any installed package"
  plan_refs: "Approach — Eject section"
  code_refs: N/A (new code)
  description: |
    The plan says eject "finds the first package with a domain matching the requested ID" and QC-004 covers "ejectDomain throws a descriptive error when the target directory already exists." But there is no explicit mention of what happens when the domain ID is not found in *any* installed package. The `EjectOptions` accepts a `domainId` string — what if the user types `cosmonauts eject nonexistent`?

    QC-004 mentions "error cases" generically in the test file description, but neither the approach section nor the quality contract explicitly states the "domain not found" error behavior. The test file description in "Implementation Order" step 2 does mention "domain not found error" — but this should also appear in the QC to ensure it's verified. This is medium because the omission is in the QC only; the implementation description is adequate.

- id: PR-010
  dimension: interface-fidelity
  severity: low
  title: "Plan says loader calls loadDomains at line 110 — actual line differs"
  plan_refs: "Integration seams — Scanner → Loader"
  code_refs: lib/domains/loader.ts:124-140
  description: |
    The plan says "The loader calls `loadDomains(source.domainsDir)` for each source (`lib/domains/loader.ts:110`)" and "`readdir(domainsDir)` (`lib/domains/loader.ts:27`)". The `loadDomainsFromSources` function starts at line 124, and it calls `loadDomains(source.domainsDir)` at approximately line 138. The `readdir` in `loadDomains` is at line 30. These are off by ~10-28 lines from what the plan states. The behavioral description is correct — only the line references are stale.

- id: PR-011
  dimension: state-sync
  severity: low
  title: "User-domains tier at ~/.cosmonauts/domains/ could conflict with future workspace/multi-project features"
  plan_refs: "New precedence tiers"
  code_refs: lib/packages/scanner.ts:48-66
  description: |
    The plan introduces `~/.cosmonauts/domains/` (precedence 1.5) as a global user override tier. This directory would contain domain subdirectories that apply to ALL projects for a given user. The plan doesn't discuss how this interacts with:
    1. Multiple projects that need different customizations of the same domain
    2. The existing `~/.cosmonauts/packages/` global package store (precedence 1)

    A user who customizes `~/.cosmonauts/domains/coding/` for project A would also affect project B. This is a design choice, not a bug, and the plan does describe it as "global user overrides for personal customizations across all projects." But the QC doesn't verify that global user domains correctly override global packages (precedence 1.5 > 1) while being overridden by local packages (precedence 2 > 1.5). QC-001 covers the full ordering but only when "all tiers are present" — a specific test for the global-user-domains-overrides-global-packages case would increase confidence.

## Missing Coverage

- **Scoped package names in eject**: If a package is named `@org/domains`, the `listInstalledPackages` result includes the scoped name. The eject search matches by `domain.name`, which is domain-level not package-level, so this should work. But the plan doesn't mention scoped packages at all, and no test covers eject from a scoped package.

- **Eject when the same domain is provided by multiple packages**: If both `@org/coding-pro` and `coding` provide a domain called "coding", the eject function takes the first match. The plan should specify which package wins (highest-precedence scope? alphabetical within scope?) and test this edge case.

- **Race condition: eject while scanner is running**: If another cosmonauts process is actively scanning domains while eject is writing to `.cosmonauts/domains/`, the scanner could read a partially-copied domain directory. This is unlikely in practice but the plan doesn't mention it. A simple mitigation would be to copy to a temp dir first, then rename atomically.

- **Eject idempotency**: What happens if the user runs `cosmonauts eject coding` twice without `--force`? The plan says it throws an error. But what if `--force` is used — does it delete the existing directory first, or does `cp` overwrite in place? In-place overwrite could leave stale files from the previous version if the new version removed some files. The implementation should `rm -rf` then copy, not just overwrite.

- **Scanner test for precedence between global user domains (1.5) and local packages (2)**: QC-001 covers full ordering, but the interesting edge case is when `~/.cosmonauts/domains/coding/` exists AND `.cosmonauts/packages/<pkg>/coding/` exists. The local package should win (2 > 1.5). This should be an explicit test case.

## Assessment

The plan is viable with revisions. The design is sound — the scanner tier extension and eject workflow are well-reasoned, and the catalogName fix is straightforward. The most important issue to address is **PR-006**: the plan must explicitly state that the eject target directory is named by `domain.name` (the domain ID from `PackageDomain`), not derived from `domain.path`, and workers must implement accordingly — otherwise ejected domains with non-trivial path layouts will be placed incorrectly and invisible to the scanner. The medium-severity findings (PR-002, PR-003, PR-004, PR-007, PR-008, PR-009) should be addressed before task creation to avoid worker confusion and gaps in test coverage.
