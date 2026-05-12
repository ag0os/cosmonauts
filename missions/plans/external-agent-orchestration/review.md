# Plan Review: external-agent-orchestration

## Findings

- id: PR-001
  dimension: user-experience
  severity: high
  title: "The planned `coding/planner` export packages spawning instructions without any spawning runtime"
  plan_refs: plan.md:25-32, plan.md:302-316, spec.md:171-177
  code_refs: bundled/coding/coding/agents/planner.ts:7-31, domains/shared/capabilities/spawning.md:1-12, lib/orchestration/definition-resolution.ts:45-53
  description: |
    The plan excludes external subagent allowlist mapping and chain integration, but its primary success example exports `coding/planner`. The current planner definition includes the `spawning` capability, `orchestration` extension, and a non-empty `subagents` allowlist. The `spawning` capability prompt explicitly tells the model that `chain_run` and `spawn_agent` tools are available.

    Internal Pi sessions make that coherent by loading extensions and then unioning extension tool names into the active allowlist via `buildToolAllowlist()`. The Phase 1 package shape does not include extensions or subagent/runtime dispatch, and the Claude mapping only maps `AgentToolSet` to Claude built-ins. The exported planner will therefore carry instructions for tools that cannot exist in the exported binary, producing confusing or failed behavior.

    The planner should resolve this conflict before tasking: either Phase 1 must restrict/export-test only leaf agents, define how packaging strips or replaces spawning capability content for external exports, or include a minimal external behavior for these orchestration instructions. The current plan's B-001 target is not compatible with its exclusions.

- id: PR-002
  dimension: interface-fidelity
  severity: medium
  title: "Export runtime bootstrap omits the bundled-domain seam needed for `coding/planner` in dev/dogfood runs"
  plan_refs: plan.md:253-267, plan.md:302-316, plan.md:450-452
  code_refs: cli/main.ts:341-357, cli/drive/subcommand.ts:736-745, lib/runtime.ts:115-121, bundled/coding/cosmonauts.json:1-6, bundled/coding/coding/domain.ts:4-9
  description: |
    The plan says the export subcommand bootstraps `CosmonautsRuntime` and resolves `coding/planner`, but it does not specify passing `bundledDirs`. In the current CLI, the normal top-level path explicitly calls `discoverFrameworkBundledPackageDirs(frameworkRoot)` and passes the result to `CosmonautsRuntime.create()`. Drive's internal `cosmonauts-subagent` path does the same.

    That detail matters because the coding domain is not under `domains/`; it is a bundled package (`bundled/coding/cosmonauts.json` points to `bundled/coding/coding`, whose manifest id is `coding`). `CosmonautsRuntime.create()` only scans bundled packages when `bundledDirs` is provided. A new `cli/export/subcommand.ts` that computes only `builtinDomainsDir`/`projectRoot` will not see the dogfooded coding agents and B-001's `coding/planner` example will fail as unknown in the framework repo.

    The plan should make the bootstrap contract explicit and include an integration-style test that exercises the real subcommand bootstrap with bundled-domain discovery, not only mocked runtime/package-builder calls.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "Packaged skill filtering does not preserve internal shared-skill behavior when project skills are configured"
  plan_refs: plan.md:119-140, plan.md:263-266, plan.md:329-339
  code_refs: lib/agents/session-assembly.ts:172-183, lib/agents/skills.ts:38-72, lib/runtime.ts:156-161, lib/domains/resolver.ts:113-130
  description: |
    The plan's `resolvePackagedSkills()` contract accepts `agentSkills`, `projectSkills`, and `skillPaths`, and the CLI passes `runtime.projectSkills` and `runtime.skillPaths`. Internal session assembly does not pass `projectSkills` directly into `buildSkillsOverride()`: when project skills are configured, it expands the effective list with all shared skill names first, then appends the project list.

    That means a project-level skill filter still preserves shared skills for internal agents. The planned package builder can easily produce a different skill set: `buildSkillsOverride(def.skills, runtime.projectSkills)` would filter out shared skills unless each shared skill is repeated in `.cosmonauts/config.json`. This is especially relevant for agents such as planner whose allowlist includes shared skills like `pi` and `plan`.

    The plan should either expose an already-expanded effective project skill list to `resolvePackagedSkills()` or specify the same shared-skill expansion used by `buildSessionParams()`.

- id: PR-004
  dimension: interface-fidelity
  severity: medium
  title: "Pi v0.74 skill helpers do not by themselves provide inline skill markdown content"
  plan_refs: plan.md:42-45, plan.md:119-140, plan.md:329-339, spec.md:150-155
  code_refs: node_modules/@earendil-works/pi-coding-agent/dist/core/skills.d.ts:9-16, node_modules/@earendil-works/pi-coding-agent/dist/core/skills.d.ts:35-44, lib/skills/discovery.ts:14-24, lib/skills/discovery.ts:90-130
  description: |
    The plan requires selected skill markdown to be embedded inline, but says `lib/agent-packages/skills.ts` may use Pi helpers `loadSkillsFromDir` and `formatSkillsForPrompt`. In Pi v0.74, `Skill` contains metadata (`name`, `description`, `filePath`, `baseDir`, etc.) but not the markdown body, and `formatSkillsForPrompt()` formats a skill index for the prompt rather than returning full skill content. Cosmonauts' `discoverSkills()` similarly returns metadata and a path, not content.

    This is implementable only if the package code explicitly reads each selected skill's `filePath` (or `SKILL.md` under the discovered directory) and embeds that content. The current behavior spec only says the prompt includes a `# Packaged Skills` section and selected metadata; it does not require an assertion that the actual skill body is present.

    The plan should tighten the contract and tests around reading and embedding the full markdown content, including flat `.md` skills and directory `SKILL.md` skills, so a worker does not accidentally ship only Pi's skill index.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "Claude tool mapping expands the current readonly tool policy with web tools"
  plan_refs: plan.md:203-212, plan.md:341-351, spec.md:122-128
  code_refs: lib/agents/types.ts:10-26, lib/orchestration/definition-resolution.ts:20-30
  description: |
    The planned Claude mapping treats `tools: "readonly"` as `Read,Glob,Grep,WebSearch,WebFetch`. The current internal meaning of the same `AgentToolSet` is narrower: `resolveTools("readonly")` returns Pi built-ins `read`, `grep`, `find`, and `ls`; there is no web-search/web-fetch capability in that tool set.

    Because `AgentPackage.tools` is described as the portable tool policy, this mapping changes the permissions of exported readonly agents relative to internal agents. That may be intentional for Claude Code, but the plan does not call it out as a semantic difference or include a behavior/risk for it. It is particularly relevant because B-004 hard-codes the expanded readonly argv as expected behavior.

    The planner should decide whether external readonly is allowed to include web access, and if so document/test that as an explicit cross-runtime policy difference rather than an accidental translation.

- id: PR-006
  dimension: behavior-spec
  severity: low
  title: "CLI behavior tests are scoped to mocks and may miss real `cli/main.ts` dispatch"
  plan_refs: plan.md:316-327, plan.md:430, plan.md:450-452, plan.md:501-503
  code_refs: cli/main.ts:650-682
  description: |
    The plan's CLI tests are described as using a mocked runtime/package builder/compile helper. That covers command action behavior, but the actual executable reaches subcommands through the hard-coded dispatch block in `cli/main.ts`, where the subcommand name must be added to both the `if` predicate and the `programs` map.

    A mocked `cli/export/subcommand.ts` test can pass while `cosmonauts export ...` still falls through to the normal prompt parser if `cli/main.ts` registration is incomplete. The plan should add at least one test or verification step around the real main dispatch path, or make reviewer inspection of both dispatch sites an explicit QC item.

## Missing Coverage

- Exporting agents with `extensions` or `subagents` is not handled, even though the main example exports `coding/planner`, which has both.
- Project-context behavior is only stored as `projectContext` metadata; the plan does not state whether exported binaries intentionally omit `AGENTS.md`/`CLAUDE.md` content under `--bare` or should embed project context at export time.
- The package skill tests do not require full markdown body embedding, flat `.md` skill coverage, or shared-skill preservation under project skill filters.
- The export command bootstrap does not explicitly cover dev-mode bundled packages, `--domain`, or `--plugin-dir` parity with the top-level CLI runtime.
- Hermeticity is tested through generated-entry inspection and mocked compile only; there is no test that the runner path avoids runtime reads from Cosmonauts source files after compilation.

## Assessment

The Phase 1 plan is viable with revisions, but the `coding/planner` target is currently inconsistent with the no-subagent/no-extension-runtime scope. Fix that export target/tooling mismatch first; otherwise the slice can compile a binary that immediately gives the model unusable orchestration instructions.
