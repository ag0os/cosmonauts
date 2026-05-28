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
- **External bundle.** A self-contained set of one or more skills, written for an outside agent, and shipped at a known location in the Cosmonauts package (today: `external-skills/<bundle-id>/`). A bundle has a single top-level identity (`cosmonauts` is the one shipped today) and declares standards-compliant member skill directories. A bundle is the unit of `install`.
- **Externally installable internal skill (adapted skill).** An internal skill that the maintainers have explicitly marked as suitable for direct copy to an external harness — either because its content happens to be self-contained and harness-agnostic (e.g. `find-docs`), or because an adapted external twin exists at a known location and the install command should pick the twin instead of the internal source. Adapted skills are the *only* internal skills `export-internal` will copy.
- **Harness target.** A named external agent runtime that Cosmonauts can write skills to. Targets in scope: `claude-code`, `codex`, `gemini-cli`, `antigravity`, plus the cross-harness alias `standard` (see "Harness convergence" below). Each target has a project-scope path and a user-scope path; the CLI is the source of truth for those paths (see table below).
- **Install scope.** Either `project` (writes under the current project root) or `user` (writes under the user's home directory). The CLI flag is `--user` (alias: `--personal`); without it, `project` is the default.

### Harness convergence (and why it shapes this design)

Since Anthropic published the Agent Skills open standard in December 2025 (spec at agentskills.io), three of the four target harnesses in scope have converged on a single shared install location:

- **OpenAI Codex CLI** reads only from `.agents/skills/` (walking up from the cwd to the repo root), `$HOME/.agents/skills/` for user scope, and `/etc/codex/skills/` for system scope. It does **not** read `.codex/skills/`. (Source: developers.openai.com/codex/skills.)
- **Gemini CLI** reads from both `.gemini/skills/` and `.agents/skills/` at project and user scope, and its own docs state that "within the same tier (user or workspace), the `.agents/skills/` alias takes precedence over the `.gemini/skills/` directory." (Source: github.com/google-gemini/gemini-cli `docs/cli/skills.md`.)
- **Google Antigravity** uses `.agents/skills/` for workspace/project skills, and the design assumes the same `.agents/skills/` convention is the path Antigravity CLI and IDE both honor for shared local skills. Google-specific Antigravity global paths are not used by default because they split IDE and CLI coverage.
- **Claude Code** is the lone outlier in this set: it reads `.claude/skills/` (project) and `~/.claude/skills/` (user), and an open community request (anthropics/claude-code#31005) is asking it to also honour `.agents/skills/`. As of this spec, that request has not landed.

Practical consequence: an operator who installs the Cosmonauts external bundle once into `.agents/skills/` reaches Codex, Gemini CLI, and Antigravity in one shot; a second install into `.claude/skills/` covers Claude Code. The CLI surfaces this with a `standard` target (writes to the cross-harness path) alongside the per-harness ids (which exist for documentation, for forward-compatibility if any harness diverges, and for the friendlier "installed for Codex" message in human output).

#### Why a second install for Claude Code, instead of pointing Claude Code at `.agents/skills/`?

Claude Code does not currently expose a configuration knob that adds extra skill search paths. Three things have been investigated and ruled out as a replacement for "write the bundle into `.claude/skills/`":

- `settings.json → permissions.additionalDirectories` is a *file-access permission*, not a skill-discovery path. Anthropic's own docs state that "most `.claude/` configuration is not discovered from these directories," and community issue [anthropics/claude-code#43267](https://github.com/anthropics/claude-code/issues/43267) confirms that skills inside an additional directory's `.claude/skills/` are silently not picked up.
- The CLI flag `claude --add-dir <path>` *does* cause skills inside `<path>/.claude/skills/` to be discovered, but it's per-launch only — it cannot be persisted in `settings.json` and gives the operator no benefit unless they remember to pass it every time.
- The open feature request [anthropics/claude-code#22902](https://github.com/anthropics/claude-code/issues/22902) (`additionalSkillsPaths` / `CLAUDE_SKILLS_PATH` / native `.agents/skills/` support) is explicitly motivated by cross-harness convergence but has not landed. We do not depend on it.

Plugins are a tangentially related surface (Claude Code plugins can carry skills from arbitrary paths via a marketplace), but packaging the Cosmonauts external bundle as a Claude Code plugin is a much bigger product question than this redesign should answer. Out of scope here; flagged for the roadmap if we ever want a single-install story for Claude Code.

Symlinking each Claude Code member skill directory to its `.agents/skills/` counterpart would also work on macOS/Linux as an advanced trick. We intentionally do not adopt it as default behavior because (a) symlinks behave inconsistently on Windows, (b) operators inspecting their `.claude/skills/` directory should see real files, not pointers into another harness's tree, and (c) two cheap copies are simpler than one clever pointer. Power users can do this themselves; the CLI does not.

So: two installs cover all four harnesses today, and any future convergence (e.g. Claude Code adopting `.agents/skills/` per #22902) collapses that to one without changing the user-facing command. To make the two-install case feel like one, the CLI accepts `-t all` and a comma-separated `-t a,b` form with destination de-duplication (defined below).

### Command model

Three commands. The names are chosen so the friendly path is obvious and the dangerous path is verbose.

```bash
cosmonauts skills list [--audience external|internal|all] [--target <harness>] [--json|--plain]
cosmonauts skills install -t <harness[,harness...]> <bundle>... [--user] [--dry-run] [--force] [--json|--plain]
cosmonauts skills export-internal -t <harness[,harness...]> <skill>... [--user] [--dry-run] [--force] [--json|--plain]
```

Notes on the model:

- `list` defaults to `--audience external`. The first thing an outside agent sees when it runs `cosmonauts skills list` is the list of installable bundles, not the internal skill roster.
- `list --audience internal` shows only internal skills; each row carries a flag for whether the skill is externally installable.
- `list --audience all` shows both, grouped, with the audience clearly labelled in each row.
- `list --target <harness>` annotates each row with the absolute path it *would* install to under the current scope flags — useful for the agent to verify the destination before installing.
- `install` is the friendly verb for an external bundle. It cannot install an internal skill, by design. The argument is a bundle identity, not a skill name. (`cosmonauts skills install -t claude-code cosmonauts` is the canonical first command for a new Claude Code project.)
- `export-internal` is the explicit verb for the rare case where someone has decided they want a single internal skill copied out. It refuses to copy any internal skill not marked externally installable. The verbose name is the guardrail.
- `-t all` expands to the minimum set of unique physical destinations that covers every supported harness for the selected scope: `standard` plus `claude-code`.
- Comma-separated targets are accepted (`-t claude-code,standard`). The resolver de-duplicates identical physical destinations so `-t codex,gemini-cli,standard` writes `.agents/skills/<name>/` once.
- `--dry-run` prints what would be written and where, without writing. Available on both install and export-internal.
- `--force` allows replacing a conflicting user-managed destination. Without `--force`, only destinations previously written by Cosmonauts are overwritten during normal upgrades.
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
  wrote: .claude/skills/cosmonauts-plans/SKILL.md
  wrote: .claude/skills/cosmonauts-tasks/SKILL.md
  wrote: .claude/skills/cosmonauts-workflows/SKILL.md
  wrote: .claude/skills/cosmonauts-skills/SKILL.md

Installed 1 bundle (5 skills). Add '.claude/' to .gitignore if you have not already.
```

JSON output is a stable, parseable object listing the bundle, member skills, destinations, every file written, the resolved scope, and the target(s). Outside agents are expected to read this.

### Default output: list

```bash
cosmonauts skills list --json
```

Returns external bundles by default. Each row carries at minimum `{id, version, description, targetsSupported, skills}`. With `--target claude-code` the row also carries `{projectDestinations, userDestinations}` resolved against the current working directory and home directory. Destination fields are arrays because a bundle can install multiple member skills.

```bash
cosmonauts skills list --audience all --target codex --json
```

Returns both audiences in one array, each row tagged `audience: "external" | "internal"`, and — for internal skills — `externallyInstallable: true | false`, plus the resolved destination(s) the entry would land at if `export-internal` were run.

### Frontmatter and metadata contract

Every external bundle and every adapted skill ships SKILL.md frontmatter that conforms to the Agent Skills open standard (agentskills.io/specification). A harness discovers individual skill directories; Cosmonauts' **bundle** concept is a CLI packaging/install unit that may contain one or more standards-compliant sibling skill directories. The contract:

- **Standard-only top-level fields.** Shipped SKILL.md files use only the spec-defined fields: `name`, `description`, and optionally `license`, `compatibility`, `metadata`, `allowed-tools`. Cosmonauts-specific marking (audience, adapted-in, externally-installable, anything else we invent) goes inside the `metadata` map using literal string keys in a `cosmonauts.*` namespace. This survives validators on every supported harness and avoids leaking Cosmonauts-internal vocabulary into harness-level frontmatter.
- **No harness-specific extensions in shipped bundles.** Claude Code extends the standard with `allowed-tools` (experimental), invocation control, subagent execution, and dynamic context injection. None of these appear in shipped bundle SKILL.md files. If a future bundle is *intended* for one harness only, it ships under a separate bundle id (out of scope here).
- **`name` rules are enforced at install time.** `name` is 1–64 chars, lowercase `[a-z0-9-]`, no leading/trailing/consecutive hyphens, and **must equal the parent directory name** at the install destination. This is a spec requirement (agentskills.io) and a Claude Code requirement; we enforce it once at the source instead of debugging it per harness.
- **`description` rules are enforced at install time.** `description` is 1–1024 chars, non-empty, no XML tags. The author is expected to phrase descriptions for the *audience* the bundle is for — external bundles are written from the outside-agent perspective, not the Cosmonauts-internal perspective. (This is also why adapted twins exist: an outside agent benefits from "Use when installing Cosmonauts skills into your harness," not "Use when running the driver loop with `run_driver`.")
- **External bundle layout.** The shipped `cosmonauts` bundle installs five sibling skills, not nested skills hidden below one parent skill: `cosmonauts`, `cosmonauts-plans`, `cosmonauts-tasks`, `cosmonauts-workflows`, and `cosmonauts-skills`. The CLI may store these under `external-skills/cosmonauts/` in the package, but at install time each skill lands as a direct child of the harness skills directory (`.agents/skills/cosmonauts/`, `.agents/skills/cosmonauts-plans/`, etc.). This matches every harness's discovery model and avoids relying on recursive nested `SKILL.md` behavior.
- **Bundle metadata is outside SKILL.md.** The planner must add an external bundle manifest (for example `external-skills/cosmonauts/bundle.json`) or equivalent registry entry that declares the bundle id, version, description, and member skill directories. `list` reports bundles from that manifest/registry. Harnesses only see standards-compliant skill directories.
- **Cosmonauts-internal metadata schema.** Reserved keys under the `metadata` map in this redesign are literal string keys, and values are strings unless the chosen validator explicitly accepts richer YAML values:
  - `metadata["cosmonauts.audience"]`: one of `internal`, `external`. Tells the CLI which track a SKILL.md belongs to. Internal skills default to `internal`; external bundle members always declare `external`. Mismatch with command surface is a fail-fast error.
  - `metadata["cosmonauts.externally-installable"]`: `true` or `false` as a string, only valid on `audience: internal` skills. When `true`, `export-internal` accepts the skill; absent or `false`, it refuses (F-3).
  - `metadata["cosmonauts.adapted-in"]`: bundle id. Only valid on `audience: internal` skills. When set, `export-internal` refuses and points the operator at the named bundle (AC-024).
  - `metadata["cosmonauts.drift-contract"]`: comma-separated contract identifiers. Used by the drift test (AC-025) to identify which sections of the internal skill must appear verbatim in the adapted twin.
- **Validation runs on install.** The CLI validates every SKILL.md it is about to write against the standard before any filesystem mutation, even in `--dry-run`. Validation failures stop the install and surface the offending field, file, and rule (F-7).

A current spec violation in the shipped `external-skills/cosmonauts/` tree: `skills/SKILL.md`, `plans/SKILL.md`, `tasks/SKILL.md`, and `workflows/SKILL.md` each declare `name: cosmonauts-<x>` while their parent directories are `skills`, `plans`, `tasks`, and `workflows`. This redesign resolves it by renaming those source directories to match their skill names and installing them as sibling skills: `cosmonauts-skills/`, `cosmonauts-plans/`, `cosmonauts-tasks/`, and `cosmonauts-workflows/`.

### Filesystem transaction contract

`install` and `export-internal` are transactional at the invocation level:

1. Resolve all requested targets, scopes, bundle members or internal skills, and destination directories.
2. De-duplicate physical destinations.
3. Validate every source SKILL.md, every target conflict, and every write permission boundary before mutating the filesystem.
4. Copy each destination into a temporary sibling directory, write the Cosmonauts install marker, then atomically rename into place where the platform supports it.
5. On any failure before commit, remove temp directories and leave pre-existing destinations untouched. On any failure after one destination has committed, report the committed destinations and failed destination in JSON; this is the only non-atomic edge case allowed, because cross-directory and cross-volume renames cannot be made globally atomic.

The install marker records at least `tool: cosmonauts`, `bundleOrSkill`, `version`, `target`, `scope`, `sourceHash`, and `installedAt`. A destination with this marker is Cosmonauts-managed and may be upgraded without `--force`; a destination without it is user-managed and requires `--force`.

### Failure cases and diagnostics

The CLI is the primary teacher of the new vocabulary; its error messages must use it explicitly. The following must be distinguishable to a calling agent reading stderr:

- **F-1. Unknown bundle.** `cosmonauts skills install -t claude-code does-not-exist` → exit 1, stderr: `unknown external bundle 'does-not-exist'. Run 'cosmonauts skills list' to see installable bundles. (To copy an internal skill instead, use 'cosmonauts skills export-internal'.)`
- **F-2. Wrong verb for internal skill.** `cosmonauts skills install -t claude-code drive` → exit 1, stderr: `'drive' is an internal skill, not an external bundle. Internal skills are not installed into external harnesses by default. If you have a specific reason to copy it, use 'cosmonauts skills export-internal -t claude-code drive'. Be aware most internal skills assume Cosmonauts-native tools.`
- **F-3. Internal skill not externally installable.** `cosmonauts skills export-internal -t claude-code init` → exit 1, stderr: `internal skill 'init' is not marked externally installable. The maintainers have flagged it as Cosmonauts-internal — it would teach the calling agent procedures that don't apply outside. Run 'cosmonauts skills list --audience internal --json' to see which internal skills are exportable.`
- **F-4. Unknown harness target.** Exit 1; stderr names every supported target by id.
- **F-5. Conflicting destination.** When the resolved destination already contains a directory not written by Cosmonauts (no install marker), the command refuses to overwrite unless `--force` is passed and prints the path it would have removed. (`--force` is not required when the existing content was written by a previous Cosmonauts install — that case overwrites silently and is the normal upgrade path.)
- **F-6. No write permission.** Exit 1; stderr names the path and the operating system error verbatim.
- **F-7. Frontmatter validation failure.** When a SKILL.md the command is about to write fails Agent Skills spec validation, exit 1, stderr names the file, the field, the rule it violates, and the harness target whose validator caught it. No partial writes — the install transaction is aborted before any filesystem mutation. Example: `external-skills/cosmonauts/legacy-skills/SKILL.md: frontmatter 'name' value 'cosmonauts-skills' must match parent directory name 'legacy-skills' (Agent Skills spec, name field)`.

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
| `codex`         | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Codex CLI reads `.agents/skills/`; it does not read `.codex/skills/`. Same paths as `standard`. |
| `gemini-cli`    | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Gemini CLI accepts both `.gemini/skills/` and `.agents/skills/`; the alias takes precedence per upstream docs, and we use it for cross-harness coverage. Same paths as `standard`. |
| `antigravity`   | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Same paths as `standard`. We prefer the shared `.agents/skills/` path because it covers Antigravity CLI, Antigravity IDE, Codex, and Gemini CLI together. |
| `standard`      | `<projectRoot>/.agents/skills/<name>/`     | `~/.agents/skills/<name>/`                | Cross-harness install per the Agent Skills open standard. Reaches Codex, Gemini CLI, and Antigravity. Does **not** reach Claude Code today. |

`<name>` is the installed skill directory name. For `install`, this is each member skill in the bundle manifest (e.g. `cosmonauts`, `cosmonauts-plans`, `cosmonauts-tasks`), not the bundle id alone. For `export-internal`, this is the internal skill name (e.g. `drive`).

Three of the per-harness rows (`codex`, `gemini-cli`, `antigravity`) resolve to the same paths as `standard` today. They are kept distinct in the CLI surface for three reasons: (1) human output reads "installed for Codex" rather than "installed at the cross-harness path"; (2) if any harness diverges in the future, only its row changes; (3) `cosmonauts skills list --target <id>` returns the harness's actual install convention even when it matches the standard.

To reach every supported harness with the minimum number of physical writes, an operator runs `cosmonauts skills install -t all cosmonauts`, which expands to `standard` plus `claude-code` at either scope.

## Acceptance Criteria

Each criterion is user-verifiable by running the named command and observing output, exit code, or filesystem state. AC-### IDs are stable references for downstream planning and testing.

Discovery and listing:

- **AC-001.** `cosmonauts skills list` with no flags returns external bundles only, and includes the `cosmonauts` bundle by default.
- **AC-002.** `cosmonauts skills list --audience internal --json` returns the internal skill roster, and every row carries an explicit `externallyInstallable` boolean.
- **AC-003.** `cosmonauts skills list --audience all --json` returns rows tagged `audience: "external"` or `audience: "internal"`, and the set is the union of AC-001 and AC-002 without duplicates.
- **AC-004.** `cosmonauts skills list --target claude-code --json` annotates each external row with the absolute project-scope and user-scope destinations the bundle would install to; the paths match the harness target path table for the current `cwd` and `$HOME`.

Friendly install:

- **AC-005.** `cosmonauts skills install -t claude-code cosmonauts` writes each member of the `cosmonauts` external bundle as a direct child of `<cwd>/.claude/skills/` (`cosmonauts/`, `cosmonauts-plans/`, `cosmonauts-tasks/`, `cosmonauts-workflows/`, `cosmonauts-skills/`) and exits 0.
- **AC-006.** The same command with `--user` writes the same sibling skill directories under `~/.claude/skills/` instead, and writes nothing under the project root.
- **AC-007.** `cosmonauts skills install -t codex cosmonauts` writes the bundle's sibling skill directories under `<cwd>/.agents/skills/`; `--user` writes under `~/.agents/skills/`. It does **not** write under `.codex/skills/` or `~/.codex/skills/`.
- **AC-008.** `cosmonauts skills install -t gemini-cli cosmonauts` writes under `<cwd>/.agents/skills/`; `--user` writes under `~/.agents/skills/`. The legacy `.gemini/skills/` path is not used.
- **AC-009.** `cosmonauts skills install -t antigravity cosmonauts` writes under `<cwd>/.agents/skills/`; `--user` writes under `~/.agents/skills/`. It does not write under `.agent/skills/`, `~/.gemini/antigravity/skills/`, or `~/.gemini/antigravity-cli/skills/`.
- **AC-009b.** `cosmonauts skills install -t standard cosmonauts` writes under `<cwd>/.agents/skills/`; `--user` writes under `~/.agents/skills/`. The install report names the harnesses this covers: Codex, Gemini CLI, and Antigravity.
- **AC-009c.** `cosmonauts skills install -t all cosmonauts` reaches all supported targets by writing only the unique `standard` and `claude-code` destinations at either scope.
- **AC-010.** Running `install` twice with the same arguments is idempotent: the second run reports an upgrade (or no-op if content is identical) and never refuses to overwrite Cosmonauts-written content.
- **AC-011.** `--dry-run` on `install` prints every path it would write, the bundle version, the resolved targets, and the scope, and exits 0 without touching the filesystem.
- **AC-012.** JSON output on `install` is a single top-level object containing `bundle`, `version`, `targets`, `scope`, `destinations`, `wrote`, and `results`. `destinations` and `wrote` are arrays of absolute paths; `results` groups writes by requested target and physical destination.

Explicit export-internal:

- **AC-013.** `cosmonauts skills export-internal -t claude-code <skill>` succeeds only for internal skills marked externally installable, and writes the skill's directory under `<cwd>/.claude/skills/<skill>/`.
- **AC-014.** Attempting to `export-internal` an internal skill that is *not* marked externally installable exits 1 with the F-3 failure message.
- **AC-015.** `export-internal` accepts multiple skill names in one invocation and follows the filesystem transaction contract: if any source is unknown, non-installable, invalid, or conflicting before commit, nothing is written.
- **AC-016.** `--dry-run` on `export-internal` behaves analogously to AC-011.

Safe defaults and guardrails:

- **AC-017.** No internal skill is ever written into a harness directory by a command that does not contain the literal string `export-internal`. (Verifiable by grepping the command surface: `install` has no code path that touches an internal skill source.)
- **AC-018.** `cosmonauts skills install -t claude-code drive` (mis-typed: `drive` is an internal skill name, not a bundle) exits 1 with the F-2 failure message and does not write anything.
- **AC-019.** `cosmonauts skills install -t claude-code does-not-exist` exits 1 with the F-1 failure message.
- **AC-020.** `cosmonauts skills install -t made-up-harness cosmonauts` exits 1 with the F-4 failure message and lists every supported target id.
- **AC-021.** When any target install directory already exists and was *not* written by Cosmonauts (no install marker), the command refuses to overwrite unless `--force` is passed; with `--force`, the target is removed and rewritten through the same temporary-directory transaction flow.
- **AC-022.** Write-permission errors surface the resolved path and the operating system error in stderr (F-6) and exit 1.

Source-of-truth and drift prevention:

- **AC-023.** Every external bundle is declared by a manifest or registry entry rooted at `external-skills/<bundle-id>/` inside the Cosmonauts package; the `install` command copies only the bundle's declared external member skill directories and does not read internal skill sources for any bundle.
- **AC-024.** An internal skill that has been marked as having an externally adapted twin (e.g. an adapted `drive` for outside agents) is *not* itself exportable by `export-internal`; the planner-chosen mechanism redirects the user to install the bundle that contains the adapted twin instead. The error message names the bundle.
- **AC-025.** The test suite contains a check that fails when an internal skill marked as having an adapted external twin and its twin diverge on the parts that must remain consistent. The contract surface is named via `metadata["cosmonauts.drift-contract"]` in the internal skill's frontmatter; the test verifies each named section appears verbatim in the twin. This catches the canonical drift case: internal `drive` documents Drive's run states; an adapted external `drive` claims the same run states; the two must stay aligned.

Frontmatter and validation:

- **AC-028.** Every SKILL.md the `install` command writes passes Agent Skills spec validation: `name` is 1–64 chars matching parent directory name and the allowed charset; `description` is 1–1024 chars with no XML tags. The validation runs before any filesystem mutation, and failures surface via F-7.
- **AC-029.** The test suite contains a snapshot check that every shipped external member skill (`external-skills/<bundle>/<skill-name>/SKILL.md`) and every internal skill marked `metadata["cosmonauts.audience"]: external` or `metadata["cosmonauts.externally-installable"]: "true"` passes the same validator. Adding a non-compliant SKILL.md to the repo fails CI.
- **AC-030.** No shipped SKILL.md (bundle or internal) uses top-level Cosmonauts-specific frontmatter keys. All Cosmonauts metadata lives under literal `metadata["cosmonauts.*"]` keys. Verifiable by a static check over the repo.
- **AC-031.** No shipped *external bundle* SKILL.md uses harness-specific extensions (`allowed-tools`, Claude-Code-only invocation control fields, etc.). External bundles are written to the standard only.
- **AC-032.** The CLI reports the resolved `metadata["cosmonauts.audience"]` in `list --json` output, and `install` refuses to install a SKILL.md whose `audience` is `internal` (matching F-2's wrong-verb semantics at frontmatter granularity, not just bundle id).

Documentation:

- **AC-026.** Running `cosmonauts skills --help` (or `cosmonauts skills install --help`, etc.) prints the new vocabulary — "external bundle", "internal skill", "harness target", "install scope" — and the differences between `install` and `export-internal`.
- **AC-027.** The shipped `external-skills/cosmonauts/cosmonauts-skills/SKILL.md` and `domains/shared/skills/skills-cli/SKILL.md` are updated to the new command model; neither references `cosmonauts skills export` after this change ships.

## Scope

Included:

- The three CLI verbs (`list`, `install`, `export-internal`) with the flags and behaviors above.
- The four harness targets plus the `standard` cross-harness alias, with project and user scopes, at the paths in the table above.
- A mechanism for marking an internal skill as externally installable (and, optionally, as having an external adapted twin) via standard `metadata` frontmatter keys in the literal `cosmonauts.*` namespace.
- A mechanism for declaring which external bundles exist and what they contain. The planner picks the mechanism (filesystem discovery under `external-skills/`, an index file, or a registry call).
- Agent Skills frontmatter validation at install time and in CI, covering every shipped SKILL.md (bundle and internal-marked-external).
- A restructure of `external-skills/cosmonauts/` into sibling member skill directories whose `name` fields and parent directory names agree.
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
- A-4b. The Agent Skills open standard at agentskills.io is the convergence point for Codex, Gemini CLI, and Antigravity. Cosmonauts adopts `.agents/skills/` as the canonical install path for all three at project and user scope; Claude Code remains the only target with a non-standard path until anthropics/claude-code#31005 (or equivalent) lands upstream.
- A-5. Outside agents that read JSON output do not parse human output. The human output is for humans; we don't preserve its current shape.
- A-6. Member skills inside the `cosmonauts` external bundle (`cosmonauts/SKILL.md`, `cosmonauts-plans/SKILL.md`, `cosmonauts-tasks/SKILL.md`, `cosmonauts-workflows/SKILL.md`, `cosmonauts-skills/SKILL.md`) are part of the bundle and travel together. `install` writes every declared member skill as a sibling directory; there is no per-member install in this version.
- A-7. `.claude/`, `.agents/`, `.codex/`, `.gemini/`, and `.antigravity/` are already (or will be) in the project's `.gitignore` for an external-skill consumer; install will warn but not block when they aren't.
- A-8. The planner is free to add a `cosmonauts.lock` or install marker file inside an installed bundle's directory so that idempotent re-install (AC-010) and the overwrite guardrail (AC-021) can distinguish a Cosmonauts-written tree from a user-managed one.
- A-9. The Agent Skills open standard at agentskills.io is the canonical frontmatter contract. Cosmonauts does not invent its own SKILL.md dialect; we extend only through the spec-provided `metadata` map, using literal `cosmonauts.*` string keys, and bundles ship clean of harness-specific extensions.
- A-10. Validation lives at install time, not at runtime in the consuming harness. Every harness validates again on its own — but we want to catch authoring mistakes (mismatched `name`, oversized `description`, illegal chars) before the operator sees a confusing harness-level error.

## Open Questions

- **OQ-1. ~~Canonical Codex skills path.~~ Resolved.** Codex CLI reads from `.agents/skills/` only (project, walks to repo root, plus `$HOME/.agents/skills/` for user scope and `/etc/codex/skills/` for system). It does not read `.codex/skills/`. The current code path writing user-scope Codex skills to `~/.codex/skills/` has been wrong against upstream behavior; the new spec writes to `.agents/skills/` at both scopes. (Sources: developers.openai.com/codex/skills.) System-scope `/etc/codex/skills/` is **out of scope** for this redesign — Cosmonauts does not install for system scope. The retained question: do we keep `codex` as a distinct CLI target id at all, given it resolves to identical paths as `standard`? Recommendation: yes (for the friendlier human-output label and forward-compatibility). Planner confirms.
- **OQ-2. ~~Antigravity install location.~~ Resolved.** Use `.agents/skills/` for Antigravity at project scope and `~/.agents/skills/` at user scope. This keeps Antigravity CLI, Antigravity IDE, Codex, and Gemini CLI on the same physical path. Google-specific Antigravity paths (`.agent/skills/`, `~/.gemini/antigravity/skills/`, `~/.gemini/antigravity-cli/skills/`) are not default install destinations in this redesign.
- **OQ-3. Mechanism for marking adapted twins.** The spec requires that an internal skill flagged as having an external adapted twin redirects the user to install a bundle instead of cherry-picking the internal source (AC-024). Preferred wire mechanism: `metadata["cosmonauts.adapted-in"]` in frontmatter, matching the metadata schema above. An index file under `external-skills/` may supplement this only if the planner needs a reverse lookup from bundle member to internal skill.
- **OQ-4. Bundle metadata source.** The spec requires `list` to surface `{id, version, description}` for each bundle (AC-001). The planner picks where `version` and `description` come from — a bundle manifest at `external-skills/<bundle-id>/`, the package `version`, or the primary member skill's SKILL.md frontmatter. The spec is agnostic between these.
- **OQ-5. ~~`--force` semantics on bulk installs.~~ Resolved.** `--force` removes and rewrites only the destination skill directories Cosmonauts is about to write. Because external bundle members install as sibling skill directories, there is no parent bundle directory to remove wholesale.
- **OQ-6. Initial set of externally installable internal skills.** The spec defaults every internal skill to non-installable. The planner reviews the current internal skill roster and proposes which (if any) ship with the externally-installable flag turned on in this change. Candidate set from the existing `cosmonauts-skills` documentation: `plan`, `task`, `drive`, `agent-packaging`. Each candidate must be evaluated for whether it is genuinely self-contained or whether it needs an adapted twin first.
- **OQ-7. ~~One-shot install across all targets.~~ Resolved.** Support comma-separated targets (`-t claude-code,standard`) and the literal `-t all`. `all` expands to the minimum unique physical destinations: `standard` plus `claude-code`. JSON output is one top-level object with grouped `results`.
- **OQ-8. Future Claude Code adoption of `.agents/skills/`.** If anthropics/claude-code#31005 lands before this change ships, should `-t claude-code` write to `.claude/skills/` (current), `.agents/skills/` (post-adoption), or both? Default proposal: keep `-t claude-code` writing to `.claude/skills/` for now; revisit on the next upstream release. The user-facing impact is small (one extra command stays one extra command until adoption is universal). Related: feature request anthropics/claude-code#22902 (`additionalSkillsPaths` / `CLAUDE_SKILLS_PATH`) — if either lands, document the persistent-config workaround alongside the install command.
- **OQ-9. ~~Sub-bundle restructure to satisfy the parent-directory-name rule.~~ Resolved.** Rename the external member directories to match their declared names and install them as sibling skills: `cosmonauts/`, `cosmonauts-plans/`, `cosmonauts-tasks/`, `cosmonauts-workflows/`, and `cosmonauts-skills/`.
- **OQ-10. Validator implementation.** The spec requires Agent Skills frontmatter validation at install time and in CI (AC-028, AC-029). The planner picks the validator source: vendoring `skills-ref` from agentskills/agentskills, writing a lightweight YAML-frontmatter validator from scratch against the spec text, or invoking `npx skills-ref validate` as a subprocess at CI time. Validator runtime is the constraint — install-time validation has to be fast enough not to interrupt the operator's flow.
