> Checked 2026-09-30 by an independent pass; corrections and omissions are in `check.md` and folded into `README.md`.

# Spike: lean domain packaging

Method: I read the code, then ran a real-runtime probe on a scratch copy of the repo (outside the repo) with a minimal `bundled/lean/`: four agents, prompts, `chains.ts`, `skills/contract`, and `extensions/health-hook`. The real repo was not modified.

## 1. No framework change

**Verified.** In dev mode, `discoverFrameworkBundledPackageDirs` picks up every `bundled/*` directory that has a `cosmonauts.json` (`lib/packages/dev-bundled.ts:38-79`). It is added at precedence 0.5 (`lib/packages/scanner.ts:68-71`) and loaded by `loader.ts:99-151`. In the probe, `--list-domains` printed `shared, coding, lean, main`, and `--list-agents` printed `lean/{lead,builder,reviewer,verifier}`. `-d lean` picks up `manifest.lead` (`lib/agents/resolve-default-lead.ts`). The domain, skills, prompts, packages, agents and `cli/main` suites passed with lean present. The one failure came from my scratch copy, which omits `missions/`.

**Hardcoded `coding` assumptions that bite:**
- **Name ambiguity (the main one).** Unqualified ids resolve by scanning every domain and give up when more than one matches (`lib/agents/resolver.ts:251-275`). The spawn tool passes the caller's domain only for visibility, not for resolution (`domains/shared/extensions/orchestration/spawn-tool.ts:563-567`). This repo's config sets no `domain`. The probe showed that with lean present, `coding/cody` spawning `reviewer` or `verifier` returns **"unknown target"**, which breaks coding. Setting lean's `manifest.internal.agents: ["reviewer","verifier"]` restored coding. Lean's own chains and spawns then have to use qualified ids (`lean/reviewer`).
- `ARCHITECTURE_MEMORY_CONSUMERS` (`lib/agents/session-assembly.ts:51-57`, duplicated in `lib/extensions/architecture-memory/index.ts:27-33`) lists only `coding/*`. Lean agents cannot be authorized for `architecture_map_read`.
- The installed (non-dev) catalog lists only `coding` (`lib/packages/catalog.ts:28-35`), so `cosmonauts install lean` by name fails. Installing by path works.

**Verdict: confirmed with caveat.** Lean gets discovered, but it breaks coding's unqualified `reviewer` and `verifier` unless lean marks them internal or renames them.

## 2. Minimum shapes

**Verified.**
- `domain.ts` needs `{id, description}`; `lead` is optional (`lib/domains/types.ts:13-26`).
- An agent needs `id`, `description`, `capabilities`, `model`, `tools`, `extensions`, `skills`, `projectContext`, `session` and `loop`. `subagents` and `thinkingLevel` are optional (`lib/agents/types.ts:19-46`). The loader only checks that `id` is a string and defaults `skills` to `["*"]` (`loader.ts:153-172`).
- The validator raises an error when:
  - the lead is not an agent in the domain (`validator.ts:193`)
  - `prompts/<id>.md` is missing (`:261`)
  - a capability cannot be resolved (`:305`)
  - an extension cannot be resolved (`:343`)
- An unresolved chain stage only produces a warning (`:228`).
- `chains.ts` exports `NamedChain[]` as `{name, description, chain}` (`lib/chains/types.ts`). Chain names from all domains are merged into one map by name (`lib/chains/loader.ts:47-58`). `build` and `review` do not collide with coding's chain names.
- `cosmonauts.json` needs `name`, `version`, `description` and `domains[]` (`lib/packages/manifest.ts:67-70`), for example `[{name:"lean",path:"."}]`.

What each tool set grants (`lib/orchestration/definition-resolution.ts:21-32`), plus any tools registered by extensions (`:46-55`):

| Tool set | Built-in tools |
|---|---|
| `coding` | read, bash, edit, write (no grep, find or ls) |
| `readonly` | read, grep, find, ls (**no bash**, so the reviewer cannot run `git diff`; the host must supply the diff) |
| `verification` | read, bash, grep, find, ls (no edit or write, though bash can still write files; "never edits" is enforced only by the prompt) |

**Verdict: confirmed.**

## 3. Prompt assembly

**Verified.** The layers are `base.md` (28 words, always included), then capabilities, then the persona, then `runtime/sub-agent.md` (33 words, sub-agents only), then an identity marker (`lib/domains/prompt-assembly.ts:85-128`, `session-assembly.ts:198-202`). In the probe, a builder with `capabilities: []` produced 65 words in total. Pi then adds its own sections (`node_modules/.../core/system-prompt.js:95-110`):
- AGENTS.md (901 words) when `projectContext: true`
- a skills index of about 45–60 words per visible skill
- the cwd

Spawned sessions replace Pi's preamble (`session-factory.ts:190`). The interactive lead appends to it (`cli/session.ts:110`), so it also carries Pi's default preamble, tools, rules and docs (inferred: about 300–400 words).

Opt-outs: `capabilities: []`, `projectContext: false`, and a narrow `skills` list. `base.md` and the sub-agent layer cannot be removed.

**Verdict: confirmed.** The overhead is about 60 words from cosmonauts, plus AGENTS.md and the skill index if enabled.

## 4. Skills (D-5)

**Verified.**
- `allSkillDirs()` puts every domain's `skills/` on Pi's path (`lib/domains/resolver.ts:88-106`, `lib/runtime.ts:190`).
- Pi discovers skills by frontmatter `name`, so `languages/typescript` becomes `typescript`.
- Filtering is a name intersection of the agent's list, the project `skills` list, and the domain's internal deny-list (`lib/agents/skills.ts:144-203`).
- Shared skill names are always added to the project list (`skills.ts:93-105`).

So a lean agent can load coding's `tdd` by name with no copy, as long as coding is installed. Probe caveat: lean/builder asked for `tdd, git-workflow, contract` and got only **`tdd`**. This repo's `.cosmonauts/config.json` `skills` allowlist omits `git-workflow` and would omit a new `contract` skill. That is a config edit, not a framework change. If both domains shipped a skill with the same name, one copy would win silently (inferred).

**Verdict: confirmed with caveat.** Cross-domain use depends on coding being installed and on the project allowlist.

## 5. Extensions

**Verified.** `resolveExtensionPath` looks in the agent's own domain first, then portable domains, then shared (`resolver.ts:73-79`, `136-161`). In the probe, lean/builder resolved `bundled/lean/extensions/health-hook`. An extension loads only for agents that list it, because sessions use `noExtensions: true` plus explicit paths (`session-factory.ts:192-195`). Precedent: `bundled/coding/extensions/execution-probe`, which is used only by `worker.ts`.

**Verdict: confirmed.**

## 6. Post-edit hook

**Verified in Pi 0.87.1** (`dist/core/extensions/types.d.ts`). The hook signature is `pi.on("tool_result", (event: ToolResultEvent, ctx) => ToolResultEventResult | void)` (`:1015`). Narrow the event with `isEditToolResult` or `isWriteToolResult` (`:840-842`). `event.input.path` is the file.

There are two ways to inject a finding:
1. Return `{content: [...event.content, finding]}` to replace the tool result (`:907-912`).
2. Call `pi.sendMessage({customType, content, display})`. During a run this becomes a steer (`agent-session.js:1494-1500`), and custom messages reach the LLM as user messages (`messages.js:89-95`).

Returning nothing keeps the hook silent.

Caveats:
- Files written through `bash` do not trigger an edit or write `tool_result`.
- External harnesses do not load Pi extensions.

Fallow today: project-tools runs either `health --complexity` on the whole project, filtered by path afterwards (`fallow-provider.ts:2341-2343`), or `audit --base <ref>` with the three baselines (`:2321-2366`). No cosmonauts CLI exposes either. Run from the shell, `fallow audit --base <rev> --health-baseline …` took 0.55 s for 53 changed files and returns per-function findings (`path, name, line, cyclomatic, cognitive, crap`). Fallow scopes by file and suppresses by baseline identity. Filtering to changed functions still needs new code that intersects findings with `git diff -U0` hunks.

**Verdict: confirmed with caveat.** The hook and injection work as described; the per-function regression filter and the CLI are new work.

## 7. Model and thinking level

**Verified.** `model` and `thinkingLevel` are set per agent. Resolution order is override, then definition, then `anthropic/claude-opus-4-7` (`session-assembly.ts:292-297`). `DomainManifest.defaultModel` is never read. Coding uses `openai-codex/gpt-5.6-sol` for every agent except `worker` (`gpt-6-sol`, `high`). Thinking levels run from `xhigh` (cody, reviewers, planner) down to `low` (explorer).

**Verdict: confirmed.**

## Required framework changes

None are needed for discovery or listing. Three are needed if lean should behave well:
1. Avoid the `reviewer`/`verifier` ambiguity. Either use `internal.agents` inside lean (no framework change) or change the framework so an unqualified id resolves in the caller's domain first.
2. Add lean agents to `ARCHITECTURE_MEMORY_CONSUMERS`, or make that list declarative.
3. Add a catalog entry so lean can be installed outside dev mode.

The shared health CLI is new code, in `bin/`, `cli/` or `bundled/lean/`.

## Open decisions for the human

- Rename lean's roles (for example `lean-reviewer`), mark them internal, or fix resolution to prefer the caller's domain.
- D-5: keep cross-domain skill references plus the allowlist edit (`git-workflow`, `contract`), or move `tdd` and `git-workflow` to shared.
- Where the health CLI lives, and whether the hook should also catch writes made through `bash` (for example by checking `git diff` on bash `tool_result`).
- Whether lean agents set `projectContext: false` to stay lean. That drops AGENTS.md, about 900 words.
