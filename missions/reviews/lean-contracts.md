# Lean vs coding: contract inventory and cost sheet

Work package W3-5. Measured on `feature/lean-domain` at `793ee564`, 2026-10-01.
Counting only: no model calls, no code changes. Contracts are the ones meant in
`missions/architecture/lean-coding-domain-brief.md` §1: everything the framework
and an agent must agree on (prompt text, procedure, output grammar, per-backend
protocol), each of which has to be prompted, parsed and reviewed.

Scope of "build roles":

- **lean**: `lead`, `builder`, `code-reviewer`, `checker`. The brief (§4.2)
  calls the last two `reviewer` and `verifier`; the shipped ids are
  `code-reviewer` and `checker`. The `build` chain is
  `lean/builder -> lean/code-reviewer`.
- **coding**: the stages of the default `plan-and-build` chain
  (`bundled/coding/chains.ts`): `planner -> plan-reviewer -> planner ->
  task-manager -> coordinator -> integration-verifier -> quality-manager`, plus
  the roles those stages spawn: `worker` (coordinator subagent) and `reviewer`,
  `security-reviewer`, `performance-reviewer`, `ux-reviewer` (quality-manager
  subagents; the generalist `reviewer` always runs, specialists by lens). The
  `implement` chain is the same list without `planner` and `plan-reviewer`.
  `cody` is shown only as the counterpart of `lead`.

All figures are words (whitespace-separated tokens, as `wc -w` counts them) on
the Markdown source, YAML frontmatter included, unless a row says otherwise.
Skill frontmatter is the only frontmatter in the counted files; prompts and
capabilities have none.

## Summary table

| # | Metric | lean | coding |
|---|---|---|---|
| 1 | Agents (`agents/*.ts`) | 4 | 18 |
| 2a | Prompt words, all `prompts/*.md` | 1,178 | 24,714 |
| 2b | Prompt words, build roles only | 1,178 (4 roles) | 18,873 (11 roles) |
| 3a | Capability words in the domain's `capabilities/` | 0 (no directory) | 3,005 (7 files) |
| 3b | Capability words loaded by build roles (distinct files) | 0 | 3,406 (8 files) |
| 3c | of which shared-fallback capabilities (`domains/shared/capabilities/`) | 0 | 604 (`tasks`, `spawning`) |
| 4a | Skill words a build role may load, allowlisted (`.cosmonauts/config.json`) | 5,576 per role (5 skills) | 30,348 for `skills: ["*"]` roles (27 skills); planner 12,256; plan-reviewer 8,331; task-manager 2,583; coordinator 0 |
| 4b | Same, unfiltered (no project allowlist) | 19,622 per role (23 skills) | 44,598 for `*` roles (47 skills); others unchanged |
| 4c | Skill words the role's prompt tells it to load on the normal build path | builder 3,118; lead 204; code-reviewer 0; checker 0 | planner 3,711; plan-reviewer 2,012; worker 3,118; reviewer 1,280; others 0 |
| 5 | Machine-parsed output grammars an agent must emit | 1 | 5 (+1 prompt-only format with no parser) |
| 6 | Protocol sections (domain prompts + capabilities) | 6 | 92 |
| 6b | Protocol sections per build role (persona + its capabilities) | 1–2 | 3–12 |
| 7 | Per-backend prompt-text variants per role | 2 system-prompt wrappers (Pi; packaged for claude-cli and codex-cli, which differ only in one package-id line); 0 backend variants in task prompts | worker under Drive: persona present (Pi) or absent (claude-cli, codex); 2 completion-protocol texts; 3 rendered commit-policy texts; 5 backend/context branch sites inside `worker.md` |
| T | **Total words read before working, per build role (Pi backend)** | lead 939; builder 3,833; code-reviewer 723; checker 580 | planner 8,987; plan-reviewer 7,043; task-manager 2,569; coordinator 2,284; worker 8,779 (chain) / 9,778 (Drive); integration-verifier 3,109; quality-manager 3,512; reviewer 6,061; security-reviewer 4,190; performance-reviewer 4,238; ux-reviewer 4,145 |
| T2 | **Total for one build** (sum of the roles one run starts, one task, generalist reviewer only) | `build` chain: 4,556 | `implement`: 26,314; `plan-and-build`: 51,378 |

Brief §1 quoted ~24,100 prompt words and ~2,600 capability words for coding
(measured on `main` 2026-09-29). This branch has 24,714 and 3,005; commits
`c03cccd9` (TASK-798, adds the `execution-probe` capability), `363169bd`
(TASK-801) and `c3492c86` (TASK-810) changed those files after that
measurement. The brief's ~4,400 words for `work-artifacts` still holds (516 in
`SKILL.md` + 3,872 in `references/` = 4,388).

## 1. Agents

lean: `builder`, `checker`, `code-reviewer`, `lead` (4).

coding: `cody`, `coordinator`, `distiller`, `explorer`, `fixer`,
`integration-verifier`, `performance-reviewer`, `plan-reviewer`, `planner`,
`quality-manager`, `refactorer`, `reviewer`, `security-reviewer`,
`spec-writer`, `task-manager`, `ux-reviewer`, `verifier`, `worker` (18).
`bundled/coding/agents/.gitkeep` is not counted.

Counted with `ls bundled/<domain>/agents/*.ts`.

## 2. Prompt words

Per-role persona words (`wc -w bundled/<domain>/prompts/<id>.md`):

| lean role | words | | coding build role | words |
|---|---|---|---|---|
| lead | 393 | | planner (runs twice in `plan-and-build`) | 2,599 |
| builder | 300 | | plan-reviewer | 2,898 |
| code-reviewer | 279 | | task-manager | 1,420 |
| checker | 206 | | coordinator | 1,105 |
| | | | worker | 2,128 |
| | | | integration-verifier | 963 |
| | | | quality-manager | 862 |
| | | | reviewer | 1,774 |
| | | | security-reviewer | 1,707 |
| | | | performance-reviewer | 1,755 |
| | | | ux-reviewer | 1,662 |
| **total** | **1,178** | | **total** | **18,873** |

Coding roles outside the build (`cody` 884, `distiller` 544, `explorer` 352,
`fixer` 723, `refactorer` 1,387, `spec-writer` 1,100, `verifier` 851) make up
the rest of the 24,714. Lean has no per-agent prompt files beyond
`prompts/<id>.md`. The brief's ≤400-word budget holds for all four lean
personas (largest: `lead`, 393).

Host-written prompt text that reaches the same agents is not in `prompts/`
and is counted under Totals and metric 7 instead: lean's task templates in
`lib/lean-run/prompts.ts`; coding's Drive envelope
(`lib/prompts/framework/drive/envelope.md`, 398 words), the Drive report
contract and completion protocol in `lib/driver/prompt-template.ts`, and the
chain stage prompts in `lib/orchestration/stage-prompts.ts`.

## 3. Capability words

`lib/domains/prompt-assembly.ts` builds every system prompt in four layers:
`lib/prompts/framework/base.md` (28 words, always), one file per entry in the
agent's `capabilities` (resolved agent domain first, then portable domains,
then `domains/shared/capabilities/`), the persona `prompts/<id>.md`, and
`lib/prompts/framework/runtime/sub-agent.md` (33 words in source, 32 rendered)
when the agent runs as a sub-agent.

lean: every agent declares `capabilities: []` and there is no
`bundled/lean/capabilities/` directory. Lean roles load base + persona (+
runtime) only.

coding domain files (`wc -w bundled/coding/capabilities/*.md`):
`architectural-design` 707, `coding-readonly` 206, `coding-readwrite` 730,
`engineering-discipline` 320, `execution-probe` 333, `git-workflow` 203,
`healthy-codebase-harness` 506; total 3,005. Shared fallback files:
`drive` 601, `spawning` 382, `tasks` 222, `todo` 167; total 1,372.

Capability words each build role loads (resolved paths, from the measurement
script):

| coding role | capabilities | words |
|---|---|---|
| planner | healthy-codebase-harness, engineering-discipline, architectural-design, coding-readonly, spawning* | 2,121 |
| plan-reviewer | healthy-codebase-harness, engineering-discipline, architectural-design, coding-readonly | 1,739 |
| task-manager | healthy-codebase-harness, coding-readonly, tasks* | 934 |
| coordinator | healthy-codebase-harness, tasks*, spawning* | 1,110 |
| worker | healthy-codebase-harness, engineering-discipline, coding-readwrite, execution-probe, tasks* | 2,111 |
| integration-verifier | healthy-codebase-harness, coding-readonly | 712 |
| quality-manager | healthy-codebase-harness, engineering-discipline, spawning* | 1,208 |
| reviewer | healthy-codebase-harness, engineering-discipline, coding-readwrite | 1,556 |
| security-, performance-, ux-reviewer | healthy-codebase-harness, engineering-discipline, coding-readonly | 1,032 each |
| (cody) | healthy-codebase-harness, engineering-discipline, coding-readwrite, git-workflow, tasks*, spawning*, todo*, drive* | 3,131 |

`*` = resolved through the shared fallback. The distinct files the build roles
load are the six coding files other than `git-workflow` (2,802) plus shared
`tasks` and `spawning` (604): 3,406 words.

## 4. Skill words a role must load

Skills reach a Pi session in two parts. The system prompt carries an index
(Pi's `formatSkillsForPrompt`: name, description, path per skill, plus three
lines of instructions). The agent reads a `SKILL.md` only when it decides to.
So this metric has three figures per role:

- **Available** (4a/4b): the `SKILL.md` words of every skill the role may
  load. Resolution follows `lib/agents/skills.ts` `buildSkillsOverride`: an
  explicit list is intersected with the project allowlist, `["*"]` becomes the
  allowlist itself. The effective allowlist is the names of
  `domains/shared/skills/` plus `.cosmonauts/config.json` `skills`
  (`resolveEffectiveProjectSkills`). The skill universe is everything under
  the loaded domains' `skills/` directories (`runtime.skillPaths`, 47 skills).
  User-level skill sources (`~/.cosmonauts`, Pi's own user and project skill
  directories) are excluded (`includeUserSources: false`).
- **Index** (in Totals): the words of the Pi skill index for the available
  skills; this text is in every Pi session whether or not a skill is read.
- **Directed** (4c): the `SKILL.md` words of skills the role's own prompt
  layers tell it to load on the normal build path in this repository (a
  TypeScript project). Conditional directives ("when the task involves X",
  "for detailed guidance") are excluded and listed below.

Rule for sub-files: only top-level `SKILL.md` text is counted. None of the
skills involved tells the agent to read a sub-file unconditionally:
`typescript`, `react` and `work-artifacts` route to `references/` from
"when you need X" tables. The one exception is not in a skill: the coding
`planner` and `plan-reviewer` personas name specific `work-artifacts`
references to read, so those reference files are counted in their directed
figure.

### lean

All four roles share `LEAN_SKILLS` (`bundled/lean/agent-skills.ts`, 23 names).

- Allowlisted (5): `tdd` 1,838, `git-workflow` 735, `contract` 204,
  `typescript` 1,280, `react` 1,519 = **5,576**. The 2 Ruby and 16 Rails
  skills are not in the project allowlist.
- Unfiltered (23): 5,576 + Ruby 1,343 + Rails 12,703 = **19,622**.
- Index: 314 words allowlisted, 1,071 unfiltered.
- Directed: `builder` "Load the `tdd` skill for the loop and your language's
  skill" → `tdd` 1,838 + `typescript` 1,280 = **3,118**. `lead` writes spec
  and plan "with the `contract` skill" → **204** (plan or spec tier; 0 for a
  direct fix). `code-reviewer` and `checker`: no directive, **0**.

### coding

| role | `skills` | available, allowlisted | unfiltered | index (allowlisted) | directed |
|---|---|---|---|---|---|
| planner | 9 names | 12,256 (9) | 12,256 | 488 | 3,711 |
| plan-reviewer | 6 names | 8,331 (6) | 8,331 | 309 | 2,012 |
| task-manager | `task`, `work-artifacts` | 2,583 (2) | 2,583 | 147 | 0 |
| coordinator | `[]` | 0 | 0 | 0 | 0 |
| worker | `*` | 30,348 (27) | 44,598 (47) | 1,362 | 3,118 |
| integration-verifier, quality-manager, reviewer, security-, performance-, ux-reviewer | `*` | 30,348 (27) | 44,598 (47) | 1,362 | reviewer 1,280; others 0 |

Directed arithmetic:

- planner: `work-artifacts` 516 + `references/workflow-tiers.md` 308 +
  `plan-format.md` 511 + `behavior-spine.md` 677 + `gate-contracts.md` 331
  (planner.md lines 30, 48) + `plan` 1,368 (line 65) = **3,711**.
- plan-reviewer: `work-artifacts` 516 + `workflow-tiers.md` 308 +
  `plan-format.md` 511 + `behavior-spine.md` 677 (plan-reviewer.md line 7;
  `architecture-format.md` only "when architecture is declared") = **2,012**.
- worker: `tdd` 1,838 ("when a task owns planned `B-###` behaviors", which
  the plan-and-build path always produces) + `typescript` 1,280 ("If the
  project uses TypeScript") = **3,118**.
- reviewer: "Load relevant skills for the repository stack" → `typescript`
  **1,280**.

Excluded conditional directives: worker → `work-artifacts`
`references/deviation-protocol.md` (on a plan/reality collision);
`engineering-discipline` capability → `engineering-principles` 1,654 ("for
detailed guidance"); `coding-readwrite` capability → `git-workflow` 735 (for
branch and commit procedures); planner → `reference-adaptation`,
`design-dialogue` (adaptation and dialogic modes); reviewer → `work-artifacts`
(when plan context is in scope).

## 5. Output grammars

A grammar is a format an agent must put in its final output so that host code
can parse it.

| domain | grammar | emitted by | instructed in | parsed in | status |
|---|---|---|---|---|---|
| lean | envelope: one JSON line, `outcome` done/blocked/failed | all four roles | each `bundled/lean/prompts/*.md` "Handing back"; `lib/lean-run/prompts.ts` | `lib/envelope/parse.ts` (`parseEnvelope`), wrapped by `lib/lean-run/envelope.ts` (`parseStageEnvelope`) | exists |
| coding | `outcome:` last line + fenced JSON report | worker under Drive | `lib/driver/prompt-template.ts` (`DRIVE_REPORT_CONTRACT`), not `bundled/coding/prompts/` | `lib/driver/report-parser.ts` (`parseReport`) | exists |
| coding | `Verdict:` report with fixed `##` headings and `- <ID>` bullets | quality-manager | `bundled/coding/prompts/quality-manager.md` | `lib/orchestration/quality-review-report.ts` | exists |
| coding | `COSMO_PLAN_REVIEW: {json}` line | plan-reviewer (plan-review stage) | appended by `lib/orchestration/stage-prompts.ts`, not in `bundled/coding/prompts/` | `lib/orchestration/review-revision.ts` (`parseReviewReportLine`, `parseTerminalReviewReport`) | exists |
| coding | `COSMO_REVIEW_REVISION: {json}` line | planner (revision stage) | `lib/orchestration/stage-prompts.ts` | `lib/orchestration/review-revision.ts` | exists; **not in the brief's list** |
| coding | `- id:` YAML-ish findings | plan-reviewer, reviewer, security-, performance-, ux-reviewer (also shown in verifier and integration-verifier prompts) | those `bundled/coding/prompts/*.md` | `lib/plans/review-rounds.ts` (plan-review round files) and `lib/orchestration/quality-review-models.ts` (reviewer text) | exists |
| coding | `Findings addressed:` list | fixer | `bundled/coding/prompts/fixer.md` line 71 | **no parser in `lib/`**; the calling agent reads it | prompt-only |

So coding has five machine-parsed grammars (the brief's four that still have
parsers, plus `COSMO_REVIEW_REVISION`), and one prompt-only format. `fixer` is
in no default chain. The `COSMO_QM_REPORT` comment and `[spawn_completion]`
lines are written by the host, not by agents, and are not counted.

## 6. Protocol sections

Detection rule, applied to each domain's `prompts/*.md` and
`capabilities/*.md` (and `domains/shared/capabilities/*.md` for roles that
load them), ignoring text inside fenced code blocks:

1. a `##`–`######` heading whose text matches
   `protocol|rules?|output|format|report(ing)?|hand(ing)? back|procedure|process|workflow|steps?|checklist|how you work|discipline|contract|verif(y|ication)|completion|failure|escalat*|deviation|constraints?|gates?`
   (word-bounded, case-insensitive);
2. a numbered list (`1.` at line start, at most 3 spaces of indent) whose
   highest item number is at least 3;
3. a run of at least 3 headings whose text starts with `N.` (numbered step
   headings), counted once.

| set | files | headings | numbered lists | total |
|---|---|---|---|---|
| lean prompts | 4 | 6 | 0 | 6 |
| lean capabilities | 0 | 0 | 0 | 0 |
| coding prompts | 18 | 52 | 34 | 86 |
| coding capabilities | 7 | 5 | 1 | 6 |
| shared capabilities | 4 | 1 | 0 | 1 |

Lean's six are `How you work` and `Handing back` in `builder` and `checker`,
and `Handing back` in `lead` and `code-reviewer`.

Per build role (persona + capability files it loads): lean `lead` 1,
`builder` 2, `code-reviewer` 1, `checker` 2. coding `planner` 6,
`plan-reviewer` 11, `task-manager` 8, `coordinator` 10, `worker` 8,
`integration-verifier` 10, `quality-manager` 3, `reviewer` 12,
`security-reviewer` 9, `performance-reviewer` 9, `ux-reviewer` 9.

The rule undercounts procedure written as prose under neutral headings:
`quality-manager.md` scores 1 (its `## Report` heading) although its
`## Setup`, `## Panel triage` and `## Assess` paragraphs carry most of the QM
procedure.

## 7. Per-backend variants

Counted as distinct prompt texts an agent can receive for the same role
depending on the execution backend (Pi, claude-cli, codex-cli). Harness-native
text (Pi's own system prompt, Claude Code's and Codex's built-in prompts and
their automatic `CLAUDE.md`/`AGENTS.md` loading) is outside the count.

### lean (`lib/lean-run/backends/`, `lib/agent-packages/`)

- **Pi** (`backends/pi.ts`): system prompt = base + persona + rendered
  sub-agent runtime block (builder 360, code-reviewer 339, checker 266
  words), plus the Pi skill index (314). Skills are read on demand.
- **claude-cli and codex-cli** (`backends/external.ts` →
  `buildAgentPackage`): system prompt = base + persona + `# Packaged Skills`
  (the full body of every available skill, frontmatter stripped) + `# Package
  Runtime Identity`. Claude gets it through `--append-system-prompt-file`,
  Codex through `-c model_instructions_file=…`. The two texts differ only in
  the `Package ID:` line. Packaged sizes: code-reviewer 5,644 and checker
  5,571 words allowlisted; 18,951 and 18,878 unfiltered.
- **Task prompts** (`lib/lean-run/prompts.ts`): one text per role for all
  three backends (builder 41 fixed words, reviewer 70, re-entry 26 plus the
  failing signals). 0 backend variants.
- **Pi-only behavior**: the `health-hook` extension appends a complexity note
  to edit/write tool results for `lean/builder` on Pi only; external
  harnesses get no equivalent text.

Count: 2 system-prompt wrappers per role (Pi, packaged), 1 task-prompt text;
the claude-cli and codex-cli packaged texts differ by one identifier line.

### coding (`lib/driver/`, Drive worker)

- **Pi** (`cosmonauts-subagent` backend): the worker's assembled system prompt
  (4,299 words) + skill index (1,362) + the Drive task prompt.
- **claude-cli and codex** (`lib/driver/backends/claude-cli.ts`, `codex.ts`):
  the Drive task prompt on stdin, nothing else. No worker persona, no
  capabilities, no cosmonauts skills. `lib/agent-packages/` is not used by
  Drive.
- **Drive task prompt** (`lib/driver/prompt-template.ts`), fixed text for a
  task with one acceptance criterion and three postflight commands,
  `driver-commits`: Pi 999 words, claude-cli and codex 1,087. Variants
  inside it:
  - Task Completion Protocol: 2 texts (Pi: `task_edit` with `checkAc`;
    external: `cosmonauts task edit --check-ac`).
  - `- Backend:` line: 3 values; it is the only difference between the
    claude-cli and codex texts.
  - Commit policy: 3 rendered instructions (`driver-commits`,
    `backend-commits`, `no-commit`) and 2 state-commit instructions. These
    are run configuration rendered into the prompt, not backend choices.
  - Envelope: default `lib/prompts/framework/drive/envelope.md` (398 words)
    or the opt-in `bundled/coding/drivers/templates/envelope.md` (399),
    which differs in its first two lines.
- **Branches inside `worker.md`** (Pi only, since external backends never see
  it): 5 sites that switch on backend or Drive context. Line 11 (notes via
  `task_edit` vs CLI on external backends), 15 (destructive-Git guard on Drive
  Pi workers), 98 (three commit policies), 108 (Drive vs non-Drive
  completion), 119 (notes via tool vs CLI).

Count: 2 persona variants (present on Pi, absent on claude-cli and codex) × 2
completion-protocol texts, plus 3 commit-policy renderings and 5 in-persona
branch sites. Prompt-text variants for the claude-cli and codex texts differ
by one line.

## Totals

Words an agent reads before its first tool call on the Pi backend:

T = A + B + C + D, where A is the assembled system prompt (base + capabilities
+ persona + runtime block), B the Pi skill index (allowlisted), C the fixed
host text in the task prompt (variable material such as the plan, diff or task
body excluded), and D the directed skill words (4c).

| role | A | B | C | D | T |
|---|---|---|---|---|---|
| lean lead (top-level) | 421 | 314 | 0 | 204 | **939** |
| lean builder | 360 | 314 | 41 | 3,118 | **3,833** |
| lean code-reviewer | 339 | 314 | 70 | 0 | **723** |
| lean checker | 266 | 314 | 0 | 0 | **580** |
| coding planner (first pass) | 4,780 | 488 | 8 | 3,711 | **8,987** |
| coding planner (revision pass) | 4,780 | 488 | 55 | 3,711 | 9,034 |
| coding plan-reviewer | 4,697 | 309 | 25 | 2,012 | **7,043** |
| coding task-manager | 2,414 | 147 | 8 | 0 | **2,569** |
| coding coordinator | 2,275 | 0 | 9 | 0 | **2,284** |
| coding worker (chain, spawned by coordinator) | 4,299 | 1,362 | 0 | 3,118 | **8,779** |
| coding worker (Drive, Pi backend) | 4,299 | 1,362 | 999 | 3,118 | **9,778** |
| coding integration-verifier | 1,735 | 1,362 | 12 | 0 | **3,109** |
| coding quality-manager | 2,130 | 1,362 | 20 | 0 | **3,512** |
| coding reviewer | 3,390 | 1,362 | 29 | 1,280 | **6,061** |
| coding security-reviewer | 2,799 | 1,362 | 29 | 0 | **4,190** |
| coding performance-reviewer | 2,847 | 1,362 | 29 | 0 | **4,238** |
| coding ux-reviewer | 2,754 | 1,362 | 29 | 0 | **4,145** |
| (coding cody, top-level) | 4,043 | 1,362 | 0 | 0 | 5,405 |

C sources: lean builder = "Implement this plan." + the envelope instruction
(`builderPrompt` without a context pack, which is how `lean_build` calls it at
this commit); lean code-reviewer = `reviewerPrompt` headings, placeholders and
envelope instruction; lean checker and coding worker (chain) are spawned with
an LLM-written prompt, so 0; coding chain stages = `buildStagePrompt` default
stage prompt plus purpose line; coding reviewers = the QM panel wrapper
(`buildQualityReviewPanelPrompt`); coding Drive worker = the Drive task prompt
minus the task section.

Per build (T2): lean `build` = builder 3,833 + code-reviewer 723 = **4,556**.
coding `implement` = task-manager 2,569 + coordinator 2,284 + worker 8,779 +
integration-verifier 3,109 + quality-manager 3,512 + reviewer 6,061 =
**26,314** (+8,779 per further task, +4,190/4,238/4,145 per specialist lens).
coding `plan-and-build` = 26,314 + planner 8,987 + plan-reviewer 7,043 +
planner revision 9,034 = **51,378**.

Not included: project context. Coding build roles other than
`task-manager` and `coordinator` set `projectContext: true`, so Pi also loads
`AGENTS.md`/`CLAUDE.md` (901 words for this repo's `AGENTS.md`). Lean
`builder`, `code-reviewer` and `checker` set `projectContext: false`; the
context pack (`lib/lean-run/context-pack.ts`) would carry `AGENTS.md` to the
builder once it is wired in.

External backends: lean code-reviewer 5,644 + 70 = 5,714 and checker 5,571
words (skills are inlined, so B and D fold into the package). Lean builder and
lead: not measurable, see the finding below. Coding Drive worker on
claude-cli or codex: 1,087 + the task section.

## Reading

Lean's standing prompt per role is 266–421 words against 1,735–4,780 for
coding's build roles, and it has one output grammar against five, 6
protocol sections against 92, and one task-prompt text for every backend.
Most of what remains for lean is skill text rather than prompt text: for the
builder, the two skills its persona sends it to (`tdd`, `typescript`, 3,118
words, both shared with coding) are 81% of its 3,833 words, and without them
the builder reads 715 words against the coding worker's 5,661. The skill
cost moves with the backend: on Pi a lean role pays a 314-word index and reads
skills on demand, while the packaged prompt for claude-cli and codex-cli
inlines all five allowlisted skills, so the packaged code-reviewer is 5,644
words, about 17 times its Pi system prompt, and 18,951 without the project
allowlist. A full lean build reads about 4,600 words before work starts;
coding's `implement` chain reads about 26,300 and `plan-and-build` about
51,400, before project context.

## Findings from the count

1. **Lean external backends cannot package `lean/builder` or `lean/lead`.**
   `buildAgentPackage` refuses raw source-agent prompts for agents with
   extensions or subagents (`lib/agent-packages/compatibility.ts`).
   `lean/builder` declares `extensions: ["health-hook"]` (added in
   `8abf3be4`), and `lean/lead` declares `orchestration`, `lean-run` and
   subagents. `leanPackageResolver` throws `Raw source-agent prompt export is
   not supported for "lean/builder" because it uses extensions
   (health-hook)` for both claude-cli and codex-cli. `lean_build` resolves
   the builder package when the builder stage starts, so on this commit a
   `lean_build` with `backend: "claude-cli"` or `"codex-cli"` fails at its
   first stage before any agent runs. No test calls `leanPackageResolver`.
2. **The brief's grammar list is stale in two ways.** `COSMO_REVIEW_REVISION`
   (planner revision stage) is a fifth machine-parsed grammar it does not
   list, and `Findings addressed:` has no parser in `lib/`: only the calling
   agent reads it, and `fixer` is in no default chain.
3. **Two of coding's grammars are not in `bundled/coding/prompts/`.** The
   `outcome:` contract and `COSMO_PLAN_REVIEW` are appended by host code
   (`lib/driver/prompt-template.ts`, `lib/orchestration/stage-prompts.ts`),
   so a count of the domain's prompt files alone misses them.
4. **The context pack is not wired into `lean_build`.** `buildContextPack` is
   exported but the `lean_build` tool does not pass `contextPack` to
   `runBuild`. When a pack is passed, `builderPrompt` returns the pack alone
   and the task prompt no longer carries the envelope instruction; the builder
   persona still does.

## Method

Run everything from the repository root after `bun install`. Word counts use
`wc -w` or the same whitespace split in Bun (the totals agree: lean prompts
1,178 and lean allowlisted skills 5,576 by both methods).

```sh
# 1. Agents
ls bundled/lean/agents/*.ts bundled/coding/agents/*.ts

# 2. Prompt words (domain totals and per role)
wc -w bundled/lean/prompts/*.md
wc -w bundled/coding/prompts/*.md

# 3. Capability words and the fixed framework layers
ls bundled/lean/capabilities            # absent on 793ee564
wc -w bundled/coding/capabilities/*.md domains/shared/capabilities/*.md
wc -w lib/prompts/framework/base.md lib/prompts/framework/runtime/sub-agent.md

# 4. Every SKILL.md (frontmatter included) and the referenced sub-files
find domains bundled -name SKILL.md | sort | xargs wc -w
find domains/shared/skills/work-artifacts/references -name '*.md' | xargs wc -w
cat .cosmonauts/config.json             # project skill allowlist

# 5. Output grammars: where each is instructed and parsed
grep -rn 'COSMO_PLAN_REVIEW\|COSMO_REVIEW_REVISION' lib bundled domains
grep -rln 'Findings addressed' lib bundled domains
grep -rn 'Verdict:' lib/orchestration/quality-review-report.ts bundled/coding/prompts/quality-manager.md
grep -rn 'outcome:' lib/driver/report-parser.ts lib/driver/prompt-template.ts
grep -rn -- '- id:' bundled/coding/prompts lib/plans/review-rounds.ts lib/orchestration/quality-review-models.ts
ls lib/envelope

# Drive envelopes
wc -w lib/prompts/framework/drive/envelope.md bundled/coding/drivers/templates/envelope.md
diff bundled/coding/drivers/templates/envelope.md lib/prompts/framework/drive/envelope.md

# Per-role assembled prompts, skills, packages, task prompts (metrics 2-4, 7, Totals)
bun "$TMPDIR/measure.ts"

# Protocol sections (metric 6)
bun "$TMPDIR/protocol.ts"
```

Save the two scripts below as `$TMPDIR/measure.ts` and `$TMPDIR/protocol.ts`
(any path outside the repository works; both resolve imports from the current
directory). `measure.ts` uses the real runtime: `CosmonautsRuntime` with the
framework's bundled packages and `includeUserSources: false`,
`assemblePrompts`, `buildSkillsOverride` + `resolveEffectiveProjectSkills`,
`leanPackageResolver`, `renderPromptForTask` and `buildStagePrompt`, so a
change to any of them shows up in the rerun. Directed-skill figures (4c) are
read from the prompt text by hand; rerun the `grep -n skill` over the role
prompts and capabilities to check them.

`measure.ts`:

```ts
// Lean vs coding contract inventory. Run from the repo root: bun <this file>
// Words = whitespace-separated tokens (same rule as `wc -w`).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const imp = (p: string) => import(join(root, p));
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const wc = (abs: string) => words(readFileSync(abs, "utf8"));
const rel = (abs: string) => abs.replace(`${root}/`, "");

const { CosmonautsRuntime } = await imp("lib/runtime.ts");
const { discoverFrameworkBundledPackageDirs } = await imp("lib/packages/dev-bundled.ts");
const { assemblePrompts } = await imp("lib/domains/prompt-assembly.ts");
const { buildSkillsOverride, resolveEffectiveProjectSkills } = await imp("lib/agents/skills.ts");
const { discoverPackageSkills } = await imp("lib/agent-packages/skills.ts");
const { leanPackageResolver } = await imp("lib/lean-run/backends/external.ts");
const { formatSkillsForPrompt } = await import("@earendil-works/pi-coding-agent");

const runtime = await CosmonautsRuntime.create({
	builtinDomainsDir: join(root, "domains"),
	projectRoot: root,
	bundledDirs: await discoverFrameworkBundledPackageDirs(root),
	includeUserSources: false,
});
const resolver = runtime.domainResolver;
const discovered = await discoverPackageSkills(runtime.skillPaths);
const effective = await resolveEffectiveProjectSkills({
	projectSkills: runtime.projectSkills,
	resolver,
	domainsDir: runtime.domainsDir,
});

const ROLES: Record<string, string[]> = {
	lean: ["lead", "builder", "code-reviewer", "checker"],
	coding: [
		"cody", "planner", "plan-reviewer", "task-manager", "coordinator", "worker",
		"integration-verifier", "quality-manager", "reviewer", "security-reviewer",
		"performance-reviewer", "ux-reviewer",
	],
};
const TOP_LEVEL = new Set(["lead", "cody"]);

function skillsFor(agentSkills: readonly string[], project: readonly string[] | undefined) {
	const override = buildSkillsOverride(agentSkills, project);
	const base = { skills: discovered.map((s: { name: string }) => ({ name: s.name })), diagnostics: [] };
	const allowed = override ? new Set(override(base).skills.map((s: { name: string }) => s.name)) : undefined;
	return discovered.filter((s: { name: string }) => !allowed || allowed.has(s.name));
}
type Pk = { name: string; description: string; sourcePath: string };
const skillWords = (list: Pk[]) => list.reduce((n, s) => n + wc(s.sourcePath), 0);
const indexWords = (list: Pk[]) =>
	words(formatSkillsForPrompt(list.map((s) => ({ name: s.name, description: s.description, filePath: s.sourcePath, baseDir: s.sourcePath, source: "x", disableModelInvocation: false }))));

console.log("## discovered skills", discovered.length, "effective allowlist names", effective?.length);
console.log("## framework base.md", wc(join(root, "lib/prompts/framework/base.md")), "sub-agent.md", wc(join(root, "lib/prompts/framework/runtime/sub-agent.md")));

for (const [domain, roles] of Object.entries(ROLES)) {
	console.log(`\n# ${domain}`);
	for (const id of roles) {
		const def = runtime.agentRegistry.resolve(id, domain);
		const caps = def.capabilities.map((c: string) => {
			const p = resolver.resolveCapabilityPath(c, domain);
			return { c, p: rel(p), w: wc(p) };
		});
		const persona = resolver.resolvePersonaPath(def.id, domain);
		const capW = caps.reduce((n: number, c: { w: number }) => n + c.w, 0);
		const sys = await assemblePrompts({
			agentId: def.id, domain, capabilities: def.capabilities, resolver, domainsDir: runtime.domainsDir,
			...(TOP_LEVEL.has(id) ? {} : { runtimeContext: { mode: "sub-agent", parentRole: "driver" } }),
		});
		const allow = skillsFor(def.skills, effective);
		const unf = skillsFor(def.skills, undefined);
		console.log(JSON.stringify({
			id, persona: rel(persona), personaW: wc(persona), capW, caps: caps.map((c: { c: string; p: string; w: number }) => `${c.c}=${c.w}(${c.p.split("/")[0]}/${c.p.split("/")[1]})`).join(" "),
			assembledSystemPromptW: words(sys),
			skillsAllow: allow.length, skillsAllowW: skillWords(allow), indexAllowW: indexWords(allow),
			skillsUnf: unf.length, skillsUnfW: skillWords(unf), indexUnfW: indexWords(unf),
			allowNames: def.skills.includes("*") || allow.length < 12 ? allow.map((s: Pk) => s.name).join(",") : "",
		}));
	}
}

console.log("\n# lean external packages (system prompt words)");
for (const kind of ["claude-cli", "codex-cli"] as const) {
	for (const project of [runtime.projectSkills, undefined]) {
		const pkgFor = leanPackageResolver({
			kind, registry: runtime.agentRegistry, resolver, domainsDir: runtime.domainsDir,
			...(project ? { projectSkills: project } : {}), skillPaths: runtime.skillPaths,
		});
		for (const role of ["lean/lead", "lean/builder", "lean/code-reviewer", "lean/checker"]) {
			try {
				const pkg = await pkgFor(role);
				console.log(kind, project ? "allowlisted" : "unfiltered", role, words(pkg.systemPrompt), "skills:", pkg.skills.map((s: { name: string }) => s.name).join(","));
			} catch (error) {
				console.log(kind, project ? "allowlisted" : "unfiltered", role, "REFUSED:", (error as Error).message.split(". ")[0]);
			}
		}
	}
}

console.log("\n# lean task prompts (fixed text)");
const lp = await imp("lib/lean-run/prompts.ts");
const emptyPlan = { raw: "" };
console.log("builderPrompt(no context pack, empty plan)", words(lp.builderPrompt({ plan: emptyPlan })));
console.log("reviewerPrompt(empty plan/diff/facts)", words(lp.reviewerPrompt({ plan: emptyPlan, facts: { passes: [] }, diff: "", changedFiles: [] })));
console.log("reentryPrompt(empty base, no signals)", words(lp.reentryPrompt("", [])));
console.log("AGENTS.md (project context; this repo)", wc(join(root, "AGENTS.md")));

console.log("\n# coding Drive worker prompt (fixed text, per backend)");
const { renderPromptForTask } = await imp("lib/driver/prompt-template.ts");
const { serializeTask } = await imp("lib/tasks/task-serializer.ts");
const task = {
	id: "TASK-1", title: "t", status: "To Do", labels: [], dependencies: [],
	createdAt: new Date(0), updatedAt: new Date(0),
	acceptanceCriteria: [{ index: 1, text: "c", checked: false }],
};
const taskW = words(`# Task\n\n${serializeTask(task)}`);
const envPath = join(root, "lib/prompts/framework/drive/envelope.md");
for (const backendName of ["cosmonauts-subagent", "claude-cli", "codex"]) {
	for (const commitPolicy of ["driver-commits", "backend-commits", "no-commit"]) {
		const workdir = mkdtempSync(join(tmpdir(), "lean-contracts-"));
		const path = await renderPromptForTask("TASK-1", { envelopePath: envPath, workdir }, { getTask: async () => task }, {
			runExpectations: {
				backendName, commitPolicy, stateCommitPolicy: commitPolicy === "driver-commits" ? "final-state-commit" : "none",
				preflightCommands: [], postflightCommands: ["bun run test", "bun run lint", "bun run typecheck"],
				projectRoot: "/repo", workdir: "/repo/run", branch: "feature/x",
			},
		});
		const total = words(readFileSync(path, "utf8"));
		console.log(backendName, commitPolicy, "total", total, "minus task section", total - taskW, "envelope", wc(envPath));
	}
}

console.log("\n# coding chain stage prompts (host text appended to the user prompt)");
const sp = await imp("lib/orchestration/stage-prompts.ts");
const stages: [string, unknown][] = [
	["planner", { kind: "default" }],
	["plan-reviewer", { kind: "plan-review" }],
	["planner", { kind: "revision", reviewKind: "plan", authorIdentity: "planner" }],
	["task-manager", { kind: "default" }],
	["coordinator", { kind: "default" }],
	["integration-verifier", { kind: "default" }],
	["quality-manager", { kind: "default" }],
	["worker", { kind: "default" }],
];
for (const [name, purpose] of stages) {
	console.log(name, JSON.stringify(purpose), words(sp.buildStagePrompt({ name }, { purpose })));
}
const qc = await imp("lib/orchestration/quality-review-context.ts");
console.log("QM reviewer panel wrapper", words(qc.buildQualityReviewPanelPrompt({ runId: "r", base: "b", changedFiles: [], materialsRoot: "/m" }, "")));
```

`protocol.ts`:

```ts
// Protocol-section count. Run from the repo root: bun <this file>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KEYWORDS =
	/\b(protocol|rules?|output|format|report(ing)?|hand(ing)? back|procedure|process|workflow|steps?|checklist|how you work|discipline|contract|verif(y|ication)|completion|failure|escalat\w*|deviation|constraints?|gates?)\b/i;

function count(text: string) {
	let fenced = false;
	let headings = 0;
	let lists = 0;
	let listMax = 0;
	let numberedHeadingRun = 0;
	const closeList = () => {
		if (listMax >= 3) lists++;
		listMax = 0;
	};
	const closeHeadingRun = () => {
		if (numberedHeadingRun >= 3) lists++;
		numberedHeadingRun = 0;
	};
	for (const line of text.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		const h = line.match(/^#{2,6}\s+(.*)$/);
		if (h) {
			if (KEYWORDS.test(h[1])) headings++;
			if (/^\d+\.\s/.test(h[1])) numberedHeadingRun++;
			else if (/^#{2}\s/.test(line) || numberedHeadingRun > 0) closeHeadingRun();
			continue;
		}
		const item = line.match(/^ {0,3}(\d+)\.\s/);
		if (item) {
			const n = Number(item[1]);
			if (n === 1) closeList();
			listMax = Math.max(listMax, n);
		}
	}
	closeList();
	closeHeadingRun();
	return { headings, lists, total: headings + lists };
}

const files = (dir: string) =>
	existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f)) : [];
const sets: Record<string, string[]> = {
	"lean prompts": files("bundled/lean/prompts"),
	"lean capabilities": files("bundled/lean/capabilities"),
	"coding prompts": files("bundled/coding/prompts"),
	"coding capabilities": files("bundled/coding/capabilities"),
	"shared capabilities": files("domains/shared/capabilities"),
};
const per: Record<string, number> = {};
for (const [name, list] of Object.entries(sets)) {
	let h = 0;
	let l = 0;
	for (const f of list) {
		const c = count(readFileSync(f, "utf8"));
		per[f] = c.total;
		h += c.headings;
		l += c.lists;
		console.log(`  ${f}: headings=${c.headings} lists=${c.lists}`);
	}
	console.log(`${name}: files=${list.length} headings=${h} lists=${l} total=${h + l}`);
}

// Per role: persona + every capability file the role loads (resolved domain-first, then shared).
const roles: Record<string, string[]> = {
	"lean/lead": [], "lean/builder": [], "lean/code-reviewer": [], "lean/checker": [],
};
for (const domain of ["lean", "coding"]) {
	for (const f of readdirSync(`bundled/${domain}/agents`).filter((f) => f.endsWith(".ts"))) {
		const def = (await import(join(process.cwd(), `bundled/${domain}/agents/${f}`))).default;
		roles[`${domain}/${def.id}`] = def.capabilities;
	}
}
for (const [role, caps] of Object.entries(roles)) {
	const [domain, id] = role.split("/");
	const paths = [`bundled/${domain}/prompts/${id}.md`, ...caps.map((c) =>
		existsSync(`bundled/${domain}/capabilities/${c}.md`) ? `bundled/${domain}/capabilities/${c}.md` : `domains/shared/capabilities/${c}.md`)];
	console.log(`role ${role}: ${paths.reduce((n, p) => n + (per[p] ?? 0), 0)}`);
}
```

Biome does not check this file: Biome 2 has no Markdown support, so the
`**` include in `biome.json` matches no `.md` files.
