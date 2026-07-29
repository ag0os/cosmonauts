# Plan Review: analysis-capabilities

## Findings

- id: PR-001
  dimension: behavior-spec
  severity: medium
  title: "Unsupported scopes have no modeled outcome"
  plan_refs: plan.md:203-211 (B-011), plan.md:345-353 (B-027), plan.md:400-423 (AnalysisScope and result contract)
  code_refs: bundled/coding/skills/fallow/references/cli-reference.md:50-55, bundled/coding/skills/fallow/references/cli-reference.md:145-166, bundled/coding/skills/fallow/references/cli-reference.md:315-350
  description: |
    The core advertises supported scope kinds on each `AnalysisBinding`, and request types include `paths`, but the public outcome vocabulary contains only completed, unbound, unsupported-metric, and tool error. There is no corresponding unsupported-scope result or behavior. This matters for the reference provider: Fallow dead-code supports repeated `--file`, while `dupes` and `health` expose changed/workspace scoping but no arbitrary file-path scope.

    B-027 proves only that empty scopes do not widen. It does not say what a non-empty but unsupported scope does. An implementation can therefore drop a requested path filter and run project-wide, or misreport a caller/provider contract mismatch as a provider runtime failure. The planner should give unsupported scope requests an explicit outcome and executable behavior before tasks split the core, adapter, and tool-registration work.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Trace and fix-preview are forced through a verdict they do not provide"
  plan_refs: plan.md:163-191 (B-007 through B-009), plan.md:420-423 (all completed results share verdict), spec.md:108-114 (AC-003)
  code_refs: bundled/coding/skills/fallow/references/cli-reference.md:53-55, bundled/coding/skills/fallow/references/cli-reference.md:224-246, bundled/coding/skills/fallow/references/cli-reference.md:1324-1335, bundled/coding/skills/fallow/SKILL.md:92-111
  description: |
    The plan requires every completed result—including trace evidence and fix proposals—to carry a verdict, while B-009 requires JSON that cannot support a verdict to throw. Fallow's trace operations return reachability/graph/clone evidence, and `fix --dry-run` returns a `changes` list plus `total_changes`; unlike `audit`, neither operation has a provider quality verdict. Inventing pass/fail from “trace found evidence” or “preview contains proposals” gives those values a meaning the provider did not assert. Refusing to invent one makes two required capabilities fail on every successful call.

    AC-003 itself lists verdict and findings as fields returned by every Fallow-supported capability, so correcting this may touch ratified ground rather than only derived design. The planner must establish whether operational variants have a neutral/non-applicable result contract or whether AC-003 needs a human-approved amendment; workers must not silently reinterpret the acceptance criterion.

- id: PR-003
  dimension: risk-blast-radius
  severity: high
  title: "Session discovery auto-executes a project-controlled binary outside Pi's trust boundary"
  plan_refs: plan.md:439-457 (project-local executable, provider runner, and status discovery), plan.md:213-221 (B-012), Decision D-012
  code_refs: domains/shared/extensions/project-tools/index.ts:20-48, domains/shared/extensions/project-tools/index.ts:65-73, node_modules/@earendil-works/pi-coding-agent/dist/core/trust-manager.js:7-15, node_modules/@earendil-works/pi-coding-agent/dist/core/trust-manager.js:114-139, node_modules/@earendil-works/pi-coding-agent/dist/core/project-trust.js:16-23
  description: |
    The current extension only reads project files during `before_agent_start`. The plan changes that seam to resolve and execute a project-local `fallow` binary for version/config/boundary introspection so it can inject complete status. Pi's trust detector gates `.pi` resources and `.agents/skills`; when those are absent, `resolveProjectTrusted` returns true before asking the user. A repository's Fallow config, package dependency, and `node_modules/.bin` executable are not trust-requiring resources in that implementation.

    Consequently, opening an otherwise untrusted checkout with a Fallow signal can run repository-controlled code before the agent chooses a capability. `shell: false`, `--no-cache`, and `--dry-run` constrain the official CLI's arguments, not what a replaced executable or loaded plugin can execute or mutate. This directly threatens ratified INV-5, not merely a defense-in-depth preference. The plan needs an owned trust/consent and provider-provenance behavior before automatic discovery may spawn anything; weakening INV-5 would require human escalation.

- id: PR-004
  dimension: user-experience
  severity: medium
  title: "Putting analysis in shared exposes it to wildcard agents that lack the tools"
  plan_refs: Decision D-011, plan.md:315-323 (B-024), plan.md:485-497 (shared skill and named consumers)
  code_refs: lib/agents/skills.ts:86-102, lib/agents/skills.ts:140-180, bundled/coding/agents/reviewer.ts:12-15, bundled/coding/agents/security-reviewer.ts:12-15, domains/main/agents/cosmo.ts:9-21
  description: |
    D-011 correctly observes that shared skills survive a project skill filter, but that mechanism is global: `resolveEffectiveProjectSkills` adds every shared skill name, and wildcard definitions retain every allowed shared skill. Reviewer-panel agents and `main/cosmo` use `skills: ["*"]` yet do not load `project-tools`; after this plan they can discover and load the analysis procedure but cannot call `analysis_status` or any capability tool.

    B-024 checks only the eight intended consumers, so it will pass while the new shared skill creates broken affordances for other wildcard agents. The planner should account for the complete shared-skill visibility blast radius and ensure every agent that can load the procedure either has its required surface or does not receive the skill.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "Pi cancellation is not connected to the new process runner contract"
  plan_refs: plan.md:365-373 (B-029), plan.md:445-451 (runner design), plan.md:501-506 (runner and extension test ownership)
  code_refs: node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:335-361, tests/helpers/mocks/extension-api.ts:68-75
  description: |
    Pi passes each registered tool an `AbortSignal` in `ToolDefinition.execute`. The plan tests that `process-runner.ts` can classify an abort, but B-029's seam stops at the runner and the design does not define a provider-executor signature carrying the Pi signal from `project-tools/index.ts` into that runner. The standard extension mock compounds the gap by always invoking tools with `signal: undefined`.

    Implemented literally, the runner unit test can pass while cancelling an actual `analysis_*` tool leaves its provider child running and keeps the agent waiting. The extension-to-provider-to-runner propagation needs a named integration behavior and test, not only a runner-level outcome test.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "The repository pin does not constrain the project-local executable"
  plan_refs: plan.md:325-333 (B-025), plan.md:439-443 (detection and root package pin), spec.md:143-148 (AC-011)
  code_refs: package.json:34-48, domains/shared/extensions/project-tools/index.ts:28-48
  description: |
    B-025 combines an exact pin in this repository's `package.json` with resolution of a project-local executable. Those are different installation scopes. Detection reads the target project's package/config signals, and the revised design says it reads the executable's actual version but never says a non-2.54.2 version is rejected or left unbound. A consumer project with `fallow: "^2"` can therefore bind and run 2.55.x even though this repository pins 2.54.2.

    That contradicts ratified AC-011's promise that the provider engine is pinned so every agent runs the same version, and it exposes normalization to unplanned schema drift. The planner should specify and test the executable resolution/version-mismatch policy. Relaxing the “every agent” promise would require a human-approved spec amendment.

## Missing Coverage

- The spec promises an agent-visible status block at session start, but B-004 requests status explicitly; no behavior proves that `before_agent_start` injects all seven rows or resolves the tension with “first status/tool call” lazy discovery.
- A config/package signal with no executable has no specified state: the plan distinguishes explicit unavailable providers from failed spawn/discovery, but does not say whether this common auto-detection case is unbound or failed-to-run.
- Timeout is a runner outcome, but the plan does not define the timeout bound used by real capability calls or the bounded termination/escalation behavior when a child ignores the first signal.
- Eager status discovery is cached only per session. The plan does not quantify the repeated version/config/boundary subprocess cost across the many short-lived planner, worker, verifier, fixer, and reviewer sessions in a chain.

## Assessment

The plan is substantially improved and remains viable, but it is not task-ready. The first issue to resolve is the automatic project-local execution boundary: without an explicit trust/provenance behavior, session discovery can violate the plan's highest-ranked no-mutation invariant before any capability is intentionally invoked.
