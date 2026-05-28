## Purpose

Cosmonauts ships two very different kinds of skills, but the CLI presents them as one. Today `cosmonauts skills export` enumerates the **internal** skills its own agents load at runtime (`drive`, `plan`, `spawning`, `init`, `archive`, …) and copies them verbatim into a target harness's skill directory. Most of those skills assume Cosmonauts-native tools and a Cosmonauts agent's perspective; pasted into Claude Code, Codex, Gemini CLI, or Antigravity they teach the wrong vocabulary, point at tools that don't exist, and crowd out the one set of skills the outside agent actually needs — the curated `external-skills/cosmonauts/` bundle that explains how to drive Cosmonauts from the CLI.

That bundle is the right entry point for an outside harness, but today the only way to install it is a hand-typed `cp -r "$(npm root)/cosmonauts/external-skills/cosmonauts" …` per harness, per scope, with no help from the CLI. Inside the codebase the two concepts are also tangled: the exporter's project path for Codex is `.agents/skills/<name>/`, the personal path is `~/.codex/skills/<name>/`, and the `skills-cli` documentation states a third variant (`.codex/skills/<name>/`) — three answers for one path, with nothing reconciling them.

This redesign separates the two tracks so the obvious thing is also the right thing:

1. An outside operator (human or agent) who runs `cosmonauts skills install -t <harness> cosmonauts` gets the curated external bundle for that harness, at the canonical path, at the scope they asked for — no `cp -r`, no per-skill cherry-picking, no confusion about which skill set they just installed.
2. A power-user who *does* want an internal skill copied out has an explicit, separately named command that won't be entered by accident, will warn that the skill is internal-flavored, and will only allow skills that have been marked externally installable.

Backwards compatibility with the current `cosmonauts skills export` flag set is explicitly waived. The redesign may rename, replace, or remove existing commands; the cost of one breaking release is much smaller than the ongoing cost of the current footgun.

## Users

Primary: **outside agents** running in Claude Code, Codex, Gemini CLI, and Antigravity that need to learn how to drive a Cosmonauts project from the CLI. They invoke the install command on behalf of a human user. They cannot read human-formatted output reliably and need machine-parseable feedback.

Primary: **the human developer** standing up a new harness on their machine. They want to type one command, get a working skill set in the right place, and not have to grep documentation to find out which of `.codex/`, `.agents/`, `.claude/`, `.gemini/`, or `.antigravity/` they should be writing to.

Secondary: **Cosmonauts contributors** who write and update skills. They need to mark a skill as internal-only or as having an externally adapted variant, and they need the test suite to catch drift between an internal skill and its external counterpart before it lands.

Tertiary: **package authors** distributing third-party Cosmonauts domains. They may ship their own external bundles inside their package and expect the same `install` command to find them. (In this version we only require that the design not preclude this; we do not need to implement the discovery surface for third-party bundles yet.)

## User Experience

### Glossary

These five terms become first-class in the CLI, the documentation, and any error message. The spec assumes them everywhere below.

- **Internal skill.** A skill consumed by a Cosmonauts agent at runtime. Lives under `domains/<domain>/skills/<name>/` (or a bundled package's equivalent). Resolved by `lib/domains/`. Not installed into external harnesses by default. A subset is marked **externally installable** (see below).
- **External bundle.** A self-contained set of one or more skills, written for an outside agent, and shipped at a known location in the Cosmonauts package (today: `external-skills/<bundle-id>/`). A bundle has a single top-level identity (`cosmonauts` is the one shipped today) and can contain nested sub-skills. A bundle is the unit of `install`.
- **Externally installable internal skill (adapted skill).** An internal skill that the maintainers have explicitly marked as suitable for direct copy to an external harness — either because its content happens to be self-contained and harness-agnostic (e.g. `find-docs`), or because an adapted external twin exists at a known location and the install command should pick the twin instead of the internal source. Adapted skills are the *only* internal skills `export-internal` will copy.
- **Harness target.** A named external agent runtime that Cosmonauts can write skills to. Targets in scope: `claude-code`, `codex`, `gemini-cli`, `antigravity`, plus the cross-harness alias `standard` (see "Harness convergence" below). Each target has a project-scope path and a user-scope path; the CLI is the source of truth for those paths (see table below).
- **Install scope.** Either `project` (writes under the current project root) or `user` (writes under the user's home directory). The CLI flag is `--user` (alias: `--personal`); without it, `project` is the default.

### Harness convergence (and why it shapes this design)

Since Anthropic published the Agent Skills open standard in December 2025 (spec at agentskills.io), three of the four target harnesses in scope have converged on a single install location:

- **OpenAI Codex CLI** reads only from `.agents/skills/` (walking up from the cwd to the repo root), `$HOME/.agents/skills/` for user scope, and `/etc/codex/skills/` for system scope. It does **not** read `.codex/skills/`. (Source: developers.openai.com/codex/skills.)
- **Gemini CLI** reads from both `.gemini/skills/` and `.agents/skills/` at project and user scope, and its own docs state that "within the same tier (user or workspace), the `.agents/skills/` alias takes precedence over the `.gemini/skills/` directory." (Source: github.com/google-gemini/gemini-cli `docs/cli/skills.md`.)
- **Google Antigravity** is in transition: the official codelab documents `<workspace>/.agent/skills/` (singular) and `~/.gemini/antigravity/skills/`, while community evidence indicates the CLI also reads `.agents/skills/` (the standard's plural) and historically the install tooling placed skills there before later being moved into Gemini-specific subdirectories. Antigravity is publicly listed among the runtimes that support the `.agents/skills/` standard. (Sources: codelabs.developers.google.com/getting-started-with-antigravity-skills; medium.com/google-cloud article on Antigravity CLI/IDE configuration.)
- **Claude Code** is the lone outlier in this set: it reads `.claude/skills/` (project) and `~/.claude/skills/` (user), and an open community request (anthropics/claude-code#31005) is asking it to also honour `.agents/skills/`. As of this spec, that request has not landed.

Practical consequence: an operator who installs the Cosmonauts external bundle once into `.agents/skills/cosmonauts/` reaches Codex, Gemini CLI, and (almost certainly) Antigravity in one shot; a second install into `.claude/skills/cosmonauts/` covers Claude Code. The CLI surfaces this with a `standard` target (writes to the cross-harness path) alongside the per-harness ids (which exist for documentation, for forward-compatibility if any harness diverges, and for the friendlier "installed for Codex" message in human output).

Two installs cover all four harnesses today, and any future convergence (e.g. Claude Code adopting `.agents/skills/`) collapses that to one without changing the user-facing command.

### Command model

Three commands. The names are chosen so the friendly path is obvious and the dangerous path is verbose.

```bash
cosmonauts skills list [--audience external|internal|all] [--target <harness>] [--json|--plain]
cosmonauts skills install -t <harness> <bundle>... [--user] [--dry-run] [--json|--plain]
cosmonauts skills export-internal -t <harness> <skill>... [--user] [--dry-run] [--json|--plain]
```

Notes on the model:

- `list` defaults to `--audience external`. The first thing an outside agent sees when it runs `cosmonauts skills list` is the list of installable bundles, not the internal skill roster.
- `list --audience internal` shows only internal skills; each row carries a flag for whether the skill is externally installable.
- `list --audience all` shows both, grouped, with the audience clearly labelled in each row.
- `list --target <harness>` annotates each row with the absolute path it *would* install to under the current scope flags — useful for the agent to verify the destination before installing.
- `install` is the friendly verb for an external bundle. It cannot install an internal skill, by design. The argument is a bundle identity, not a skill name. (`cosmonauts skills install -t claude-code cosmonauts` is the canonical first command for a new Claude Code project.)
- `export-internal` is the explicit verb for the rare case where someone has decided they want a single internal skill copied out. It refuses to copy any internal skill not marked externally installable. The verbose name is the guardrail.
- `--dry-run` prints what would be written and where, without writing. Available on both install and export-internal.
- All three commands accept the existing `--json` / `--plain` output mode flags. JSON is the contract for outside agents.

### Default output: install

Project-scope install of the cosmonauts bundle into Claude Code:

```bash
cosmonauts skills install -t claude-code cosmonauts
```

Human output (illustrative):

```
Installing external bundle 'cosmonauts' (v0.1.0) into target 'claude-code' (scope: project).
  wrote: .claude/skills/cosmonauts/SKILL.md
  wrote: .claude/skills/cosmonauts/plans/SKILL.md
  wrote: .claude/skills/cosmonauts/tasks/SKILL.md
  wrote: .claude/skills/cosmonauts/workflows/SKILL.md
  wrote: .claude/skills/cosmonauts/skills/SKILL.md

Installed 1 bundle (5 skill files). Add '.claude/' to .gitignore if you have not already.
```

JSON output is a stable, parseable object listing the bundle, the destination root, every file written, the resolved scope, and the target. Outside agents are expected to read this.

### Default output: list

```bash
cosmonauts skills list --json
```

Returns external bundles by default. Each row carries at minimum `{id, version, description, targetsSupported}`. With `--target claude-code` the row also carries `{projectPath, userPath}` resolved against the current working directory and home directory.

```bash
cosmonauts skills list --audience all --target codex --json
```

Returns both audiences in one array, each row tagged `audience: "external" | "internal"`, and — for internal skills — `externallyInstallable: true | false`, plus the resolved install path the entry would land at if `export-internal` were run.

### Failure cases and diagnostics

The CLI is the primary teacher of the new vocabulary; its error messages must use it explicitly. The following must be distinguishable to a calling agent reading stderr:

- **F-1. Unknown bundle.** `cosmonauts skills install -t claude-code does-not-exist` → exit 1, stderr: `unknown external bundle 'does-not-exist'. Run 'cosmonauts skills list' to see installable bundles. (To copy an internal skill instead, use 'cosmonauts skills export-internal'.)`
- **F-2. Wrong verb for internal skill.** `cosmonauts skills install -t claude-code drive` → exit 1, stderr: `'drive' is an internal skill, not an external bundle. Internal skills are not installed into external harnesses by default. If you have a specific reason to copy it, use 'cosmonauts skills export-internal -t claude-code drive'. Be aware most internal skills assume Cosmonauts-native tools.`
- **F-3. Internal skill not externally installable.** `cosmonauts skills export-internal -t claude-code init` → exit 1, stderr: `internal skill 'init' is not marked externally installable. The maintainers have flagged it as Cosmonauts-internal — it would teach the calling agent procedures that don't apply outside. Run 'cosmonauts skills list --audience internal --json' to see which internal skills are exportable.`
- **F-4. Unknown harness target.** Exit 1; stderr names every supported target by id.
- **F-5. Conflicting destination.** When the resolved destination already contains a directory not written by Cosmonauts (no install marker), the command refuses to overwrite unless `--force` is passed and prints the path it would have removed. (`--force` is not required when the existing content was written by a previous Cosmonauts install — that case overwrites silently and is the normal upgrade path.)
- **F-6. No write permission.** Exit 1; stderr names the path and the operating system error verbatim.

### What's intentionally removed or replaced

- `cosmonauts skills export -t <claude|codex> [name...|--all]` is removed. The closest replacement for the (rare, legitimate) internal-copy use case is `cosmonauts skills export-internal`; the closest replacement for the common case is `cosmonauts skills install -t <harness> cosmonauts`. There is no migration shim.
- The `--all` flag for bulk-copying every internal skill is removed. It was the single biggest contributor to the "got useless internal skills" failure mode. Bulk install of a curated bundle is the friendly replacement; bulk export of internal skills is not supported.
- The Claude target id is renamed `claude` → `claude-code` to disambiguate from Anthropic-API-only contexts and to match the harness's actual name.
- The Codex personal path `~/.codex/skills/<name>/` is retired. Codex CLI does not actually read from `~/.codex/skills/`; the upstream convention is `~/.agents/skills/`. The new `codex` target writes to `.agents/skills/` at both scopes (see path table). The current code path has been wrong against the upstream behavior since the target was added.
- The split between Codex project (`.agents/skills/<name>/`) and Codex personal (`~/.codex/skills/<name>/`) is retired in favor of a single canonical pair under `.agents/skills/`.

### Harness target path table

This is the contract. The planner may not change rows without revising this spec.

| Target          | Project scope                              | User scope                                | Notes |
| --------------- | ------------------------------------------ | ----------------------------------------- | ----- |
| `claude-code`   | `<projectRoot>/.claude/skills/<name>/`     | `~/.claude/skills/<name>/`                | Canonical for Claude Code. Claude Code does not yet honour `.agents/skills/`. |
| `codex`         | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Codex CLI reads only `.agents/skills/`; it does not read `.codex/skills/`. Same paths as `standard`. |
| `gemini-cli`    | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Gemini CLI accepts both `.gemini/skills/` and `.agents/skills/`; the alias takes precedence per upstream docs, and we use it for cross-harness coverage. Same paths as `standard`. |
| `antigravity`   | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Provisional alignment with the cross-harness standard. Antigravity also reads its own Gemini-namespaced paths; see **OQ-2**. Same paths as `standard`. |
| `standard`      | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Cross-harness install per the Agent Skills open standard (agentskills.io). Reaches Codex, Gemini CLI, and Antigravity in one install. Does **not** reach Claude Code today. |

`<name>` is the bundle id for `install` (e.g. `cosmonauts`) or the skill name for `export-internal` (e.g. `drive`). Sub-skills inside a bundle are written under the bundle's `<name>` directory and preserve their relative paths.

Three of the per-harness rows (`codex`, `gemini-cli`, `antigravity`) resolve to the same paths as `standard` today. They are kept distinct in the CLI surface for three reasons: (1) human output reads "installed for Codex" rather than "installed at the cross-harness path"; (2) if any harness diverges in the future, only its row changes; (3) `cosmonauts skills list --target <id>` returns the harness's actual install convention even when it matches the standard.

To reach every supported harness with the minimum number of commands, an operator runs two: `cosmonauts skills install -t standard cosmonauts` (covers Codex, Gemini CLI, Antigravity) and `cosmonauts skills install -t claude-code cosmonauts` (covers Claude Code). See **OQ-7** on whether to support `-t all` as a one-shot wrapper.

## Acceptance Criteria

Each criterion is user-verifiable by running the named command and observing output, exit code, or filesystem state. AC-### IDs are stable references for downstream planning and testing.

Discovery and listing:

- **AC-001.** `cosmonauts skills list` with no flags returns external bundles only, and includes the `cosmonauts` bundle by default.
- **AC-002.** `cosmonauts skills list --audience internal --json` returns the internal skill roster, and every row carries an explicit `externallyInstallable` boolean.
- **AC-003.** `cosmonauts skills list --audience all --json` returns rows tagged `audience: "external"` or `audience: "internal"`, and the set is the union of AC-001 and AC-002 without duplicates.
- **AC-004.** `cosmonauts skills list --target claude-code --json` annotates each external row with the absolute project-scope and user-scope paths the bundle would install to; the paths match the harness target path table for the current `cwd` and `$HOME`.

Friendly install:

- **AC-005.** `cosmonauts skills install -t claude-code cosmonauts` writes the `external-skills/cosmonauts/` tree under `<cwd>/.claude/skills/cosmonauts/` and exits 0.
- **AC-006.** The same command with `--user` writes under `~/.claude/skills/cosmonauts/` instead, and writes nothing under the project root.
- **AC-007.** `cosmonauts skills install -t codex cosmonauts` writes under `<cwd>/.agents/skills/cosmonauts/`; `--user` writes under `~/.agents/skills/cosmonauts/`. It does **not** write under `.codex/skills/` or `~/.codex/skills/`.
- **AC-008.** `cosmonauts skills install -t gemini-cli cosmonauts` writes under `<cwd>/.agents/skills/cosmonauts/`; `--user` writes under `~/.agents/skills/cosmonauts/`. The legacy `.gemini/skills/` path is not used.
- **AC-009.** `cosmonauts skills install -t antigravity cosmonauts` writes under `<cwd>/.agents/skills/cosmonauts/`; `--user` writes under `~/.agents/skills/cosmonauts/`. (See OQ-2 for the residual Antigravity verification step.)
- **AC-009b.** `cosmonauts skills install -t standard cosmonauts` writes under `<cwd>/.agents/skills/cosmonauts/`; `--user` writes under `~/.agents/skills/cosmonauts/`. The install report names the harnesses this covers (Codex, Gemini CLI, Antigravity).
- **AC-009c.** Running `cosmonauts skills install -t standard cosmonauts` followed by `cosmonauts skills install -t claude-code cosmonauts` (in either order, at either scope) reaches all four targets-in-scope with two commands and no intermediate manual `cp`.
- **AC-010.** Running `install` twice with the same arguments is idempotent: the second run reports an upgrade (or no-op if content is identical) and never refuses to overwrite Cosmonauts-written content.
- **AC-011.** `--dry-run` on `install` prints every path it would write, the bundle version, and the target/scope, and exits 0 without touching the filesystem.
- **AC-012.** JSON output on `install` is a single top-level object containing `bundle`, `version`, `target`, `scope`, `destination`, and a `wrote` array of absolute paths.

Explicit export-internal:

- **AC-013.** `cosmonauts skills export-internal -t claude-code <skill>` succeeds only for internal skills marked externally installable, and writes the skill's directory under `<cwd>/.claude/skills/<skill>/`.
- **AC-014.** Attempting to `export-internal` an internal skill that is *not* marked externally installable exits 1 with the F-3 failure message.
- **AC-015.** `export-internal` accepts multiple skill names in one invocation and writes them all atomically — if any one is unknown or non-installable, none are written.
- **AC-016.** `--dry-run` on `export-internal` behaves analogously to AC-011.

Safe defaults and guardrails:

- **AC-017.** No internal skill is ever written into a harness directory by a command that does not contain the literal string `export-internal`. (Verifiable by grepping the command surface: `install` has no code path that touches an internal skill source.)
- **AC-018.** `cosmonauts skills install -t claude-code drive` (mis-typed: `drive` is an internal skill name, not a bundle) exits 1 with the F-2 failure message and does not write anything.
- **AC-019.** `cosmonauts skills install -t claude-code does-not-exist` exits 1 with the F-1 failure message.
- **AC-020.** `cosmonauts skills install -t made-up-harness cosmonauts` exits 1 with the F-4 failure message and lists every supported target id.
- **AC-021.** When the target install directory already exists and was *not* written by Cosmonauts (no install marker), the command refuses to overwrite unless `--force` is passed; with `--force`, the target is removed and rewritten.
- **AC-022.** Write-permission errors surface the resolved path and the operating system error in stderr (F-6) and exit 1.

Source-of-truth and drift prevention:

- **AC-023.** Every external bundle is sourced from `external-skills/<bundle-id>/` inside the Cosmonauts package; the `install` command does not read internal skill sources for any bundle.
- **AC-024.** An internal skill that has been marked as having an externally adapted twin (e.g. an adapted `drive` for outside agents) is *not* itself exportable by `export-internal`; the planner-chosen mechanism redirects the user to install the bundle that contains the adapted twin instead. The error message names the bundle.
- **AC-025.** The test suite contains a check that fails when an internal skill marked as having an adapted external twin and its twin diverge on the parts that must remain consistent (the contract surface is named in the skill's frontmatter; the test verifies it appears verbatim in the twin). This catches the canonical drift case: internal `drive` documents Drive's run states; an adapted external `drive` claims the same run states; the two must stay aligned.

Documentation:

- **AC-026.** Running `cosmonauts skills --help` (or `cosmonauts skills install --help`, etc.) prints the new vocabulary — "external bundle", "internal skill", "harness target", "install scope" — and the differences between `install` and `export-internal`.
- **AC-027.** The shipped `external-skills/cosmonauts/skills/SKILL.md` and `domains/shared/skills/skills-cli/SKILL.md` are updated to the new command model; neither references `cosmonauts skills export` after this change ships.

## Scope

Included:

- The three CLI verbs (`list`, `install`, `export-internal`) with the flags and behaviors above.
- The four harness targets, with project and user scopes, at the paths in the table above.
- A mechanism for marking an internal skill as externally installable (and, optionally, as having an external adapted twin). The planner picks the mechanism; today's frontmatter is a natural place for it.
- A mechanism for declaring which external bundles exist and what they contain. The planner picks the mechanism (filesystem discovery under `external-skills/`, an index file, or a registry call).
- Updates to the human-facing docs that mention `cosmonauts skills export` so they teach the new model.
- A drift test that compares an internal skill against its adapted external twin on a named contract surface.
- Telemetry/logging is unchanged — no new emissions required.

Excluded:

- Auto-install at package install time, post-`npm install` hooks, or any background sync.
- A package-manager-style registry for third-party external bundles. (The design must not preclude one, but we do not ship discovery for non-Cosmonauts bundles in this version.)
- Versioned uninstall, downgrade, or skill-level pinning. Re-running `install` is the upgrade path; manual `rm` is the uninstall path.
- Changes to how Cosmonauts' own agents resolve internal skills at runtime. Internal skill resolution remains unchanged.
- A migration shim that aliases the old `cosmonauts skills export` to the new commands. The user has explicitly waived backwards compatibility.

## Assumptions

- A-1. The friendly install path for an outside agent is always "install a curated bundle for your harness", not "cherry-pick internal skills". If a future use case requires fine-grained internal cherry-picking, `export-internal` is the right venue and we extend its flags.
- A-2. `external-skills/<bundle-id>/` is the source of truth for external bundles. Other locations (e.g. inside a third-party package) can be added later without changing the user-facing command surface.
- A-3. Marking an internal skill as externally installable is rare. The default for every existing internal skill in the repo today is **not** externally installable; the planner enumerates exceptions explicitly rather than opting everything in.
- A-4. The current Codex path inconsistency (project `.agents/skills/`, personal `~/.codex/skills/`) is a bug. Codex CLI does not read from `~/.codex/skills/`; the upstream path is `~/.agents/skills/`. The new spec aligns Codex with the cross-harness Agent Skills standard (`.agents/skills/`) at both scopes.
- A-4b. The Agent Skills open standard at agentskills.io is the convergence point for Codex, Gemini CLI, and Antigravity. Cosmonauts adopts `.agents/skills/` as the canonical install path for all three; Claude Code remains the only target with a non-standard path until anthropics/claude-code#31005 (or equivalent) lands upstream.
- A-5. Outside agents that read JSON output do not parse human output. The human output is for humans; we don't preserve its current shape.
- A-6. Sub-skills inside the `cosmonauts` external bundle (`skills/SKILL.md`, `plans/SKILL.md`, `tasks/SKILL.md`, `workflows/SKILL.md`) are part of the bundle and travel together. `install` writes the whole tree; there is no per-sub-skill install.
- A-7. `.claude/`, `.codex/`, `.gemini/`, and `.antigravity/` are already (or will be) in the project's `.gitignore` for an external-skill consumer; install will warn but not block when they aren't.
- A-8. The planner is free to add a `cosmonauts.lock` or install marker file inside an installed bundle's directory so that idempotent re-install (AC-010) and the overwrite guardrail (AC-021) can distinguish a Cosmonauts-written tree from a user-managed one.

## Open Questions

- **OQ-1. ~~Canonical Codex skills path.~~ Resolved.** Codex CLI reads from `.agents/skills/` only (project, walks to repo root, plus `$HOME/.agents/skills/` for user scope and `/etc/codex/skills/` for system). It does not read `.codex/skills/`. The current code path writing user-scope Codex skills to `~/.codex/skills/` has been wrong against upstream behavior; the new spec writes to `.agents/skills/` at both scopes. (Sources: developers.openai.com/codex/skills.) System-scope `/etc/codex/skills/` is **out of scope** for this redesign — Cosmonauts does not install for system scope. The retained question: do we keep `codex` as a distinct CLI target id at all, given it resolves to identical paths as `standard`? Recommendation: yes (for the friendlier human-output label and forward-compatibility). Planner confirms.
- **OQ-2. Antigravity install location.** Public Antigravity documentation is split. The official codelab (codelabs.developers.google.com/getting-started-with-antigravity-skills) says project skills live at `<workspace>/.agent/skills/` (singular) and user skills at `~/.gemini/antigravity/skills/`. A community write-up (Medium, "Configuring MCP Servers and Skills for Antigravity CLI and IDE") reports that the codelab's user-scope path "is incorrect — Antigravity tools do not pick up skills placed in this location" and that the CLI-specific path is `~/.gemini/antigravity-cli/skills/` with a unified `~/.gemini/skills/` working across products. Separately, Antigravity is listed among the runtimes that support the cross-harness `.agents/skills/` standard, and early Antigravity install tooling (`npx skills add`) historically wrote there. The spec's resolution: align `antigravity` with `.agents/skills/` (the cross-harness standard) for predictability and convergence with Codex and Gemini CLI. The planner should: (a) run a smoke test on a current Antigravity install to confirm `.agents/skills/cosmonauts/` is picked up, and (b) if it is not, add an Antigravity-specific path override (likely `<workspace>/.agent/skills/<name>/` and `~/.gemini/antigravity-cli/skills/<name>/`) to the harness target path table and update AC-009 accordingly. The codelab's singular `.agent/skills/` (no `s`) should be treated as a probable upstream typo unless reproducible.
- **OQ-3. Mechanism for marking adapted twins.** The spec requires that an internal skill flagged as having an external adapted twin redirects the user to install a bundle instead of cherry-picking the internal source (AC-024). The planner picks the wire mechanism: frontmatter (`adapted_in: cosmonauts`), an index file under `external-skills/`, or a convention. Either is acceptable; the spec only requires the redirect behavior and the drift test (AC-025) be implementable.
- **OQ-4. Bundle metadata source.** The spec requires `list` to surface `{id, version, description}` for each bundle (AC-001). The planner picks where `version` and `description` come from — a `bundle.yaml` at `external-skills/<bundle-id>/`, the package `version`, or the bundle's top-level SKILL.md frontmatter. The spec is agnostic between these.
- **OQ-5. `--force` semantics on bulk installs.** When `--force` is passed and the target contains user-managed content for some sub-paths but not others, do we remove the entire bundle directory, or only the sub-paths Cosmonauts would write? Default proposal: remove the entire bundle directory (predictable). Planner confirms.
- **OQ-6. Initial set of externally installable internal skills.** The spec defaults every internal skill to non-installable. The planner reviews the current internal skill roster and proposes which (if any) ship with the externally-installable flag turned on in this change. Candidate set from the existing `cosmonauts-skills` documentation: `plan`, `task`, `drive`, `agent-packaging`. Each candidate must be evaluated for whether it is genuinely self-contained or whether it needs an adapted twin first.
- **OQ-7. One-shot install across all targets.** Given Claude Code is the only target that is not on `.agents/skills/` today, an operator needs two `install` invocations to cover all four harnesses. Do we support `-t all` (or repeated `-t` flags) as a single-command wrapper? Default proposal: yes, accept a comma-separated list (`-t claude-code,standard`) and the literal `-t all` (expands to "every supported target"). Planner confirms the spelling and whether the report aggregates results into one JSON object or emits one per target.
- **OQ-8. Future Claude Code adoption of `.agents/skills/`.** If anthropics/claude-code#31005 lands before this change ships, should `-t claude-code` write to `.claude/skills/` (current), `.agents/skills/` (post-adoption), or both? Default proposal: keep `-t claude-code` writing to `.claude/skills/` for now; revisit on the next upstream release. The user-facing impact is small (one extra command stays one extra command until adoption is universal).
