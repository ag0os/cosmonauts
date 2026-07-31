# Analysis Provider Validation

This record validates the delivered generic analysis result contract against
real tool surfaces. The reference evidence is the reviewed Fallow 2.54.2
capture set in `tests/fixtures/fallow-2.54.2/`; every independent mapping points
to a second real tool. A mapping is structural, not a claim that two tools use
identical names or policies: adapters may derive a verdict, message, or local
ID only from classifiable tool evidence and configured thresholds.

Primary independent references:

- [Knip reporters](https://knip.dev/features/reporters) document JSON issues,
  issue-type keys, paths, names, positions, Code Climate severity and
  fingerprints.
- [Knip rules and filters](https://knip.dev/features/rules-and-filters)
  document selecting the issue types included in a run.
- [Knip trace arguments](https://knip.dev/reference/cli#--trace) document
  export-name, file, and dependency targets; an export name can be traced
  alone or combined with a file target.
- [jscpd JSON reporting](https://github.com/kucherenko/jscpd/blob/master/packages/finder/src/reporters/json.ts)
  documents clone pairs, fragments, file ranges, token/line counts, and
  statistics.
- [Radon command-line output](https://radon.readthedocs.io/en/stable/commandline.html)
  documents JSON cyclomatic-complexity output over selected paths.
- [dependency-cruiser output](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)
  documents JSON dependency graphs, rule violations, severities, baselines,
  focus/include scopes, and exit behavior.
- [Semgrep diff-aware scanning](https://semgrep.dev/docs/semgrep-ci/sample-ci-configs)
  documents findings limited to changes from an explicit baseline ref.
- [ESLint formatters](https://eslint.org/docs/latest/use/formatters/) and
  [`--fix-dry-run`](https://eslint.org/docs/latest/use/command-line-interface#--fix-dry-run)
  document JSON findings, locations, severities, suggestions/fixes, version,
  exit codes, and preview-only output.

## Delivered reference validation

The shipped Fallow adapter and fixtures exercise all seven capabilities. The
package and lockfile pin Fallow `2.54.2`, and the adapter validates each
completed envelope against the schema versions captured from that engine.
Completed provider exits `0` and `1` remain results when their JSON is
classifiable; other execution exits, signals, timeouts, aborts, invalid JSON,
error envelopes, and unsupported schema versions are failures.

The adapter advertises only native scope support:

| Capability | Delivered Fallow binding |
|---|---|
| `dead-code` | `project`, `paths` |
| `duplication` | `project` |
| `complexity` | `project`; `cyclomatic`, `cognitive`, and `crap` metrics |
| `boundary-conformance` | `project`, `paths` only when zones and rules are configured; otherwise `provider-not-configured` |
| `changed-scope-audit` | `changed` with a required explicit base |
| `trace` | `target`; symbol requires `path`, duplicate location requires `line`, file and dependency require no additional identity |
| `fix-preview` | `project`; dry-run only |

The generic trace union deliberately keeps symbol `path` and duplicate
location `line` optional. Fallow advertises both as required and the resolver
degrades an underspecified request before provider execution. Knip demonstrates
why symbol paths cannot be globally required: it traces an export name alone
and optionally combines that name with a file. A jscpd-backed adapter can use
its clone-pair file ranges to resolve duplicate groups for a path and treat a
supplied line as a disambiguator, while a dependency-cruiser adapter can
advertise only file and dependency targets. Each provider therefore exposes
only the generic target forms it can honor.

Every analysis, config-introspection, and preview invocation disables the
provider cache; version detection uses its intrinsically read-only operation.
The live no-write checks snapshot the whole worktree, including ignored
provider state. The live dirty-scope fixture proves that the changed-scope
audit covers tracked, staged, and untracked files without widening beyond its
explicit base.

## Generic result field evidence

| Generic field | Reference provider evidence | Independent tool evidence | Decision |
|---|---|---|---|
| `kind` | Fallow 2.54.2: captured command/envelope class distinguishes findings, trace, and dry-run fixes. | ESLint JSON: lint results and dry-run fix output are distinct documented operations. | generic |
| `capability` | Fallow 2.54.2: seven reviewed captures are tied to seven explicit operations. | Knip JSON: issue-type keys distinguish dead-code categories and trace is a separate operation. | generic |
| `provider.id` | Fallow 2.54.2: capture provenance identifies the package as `fallow`. | Knip CLI: the invoked installed package supplies a stable implementation ID. | generic |
| `provider.name` | Fallow 2.54.2: capture provenance records the provider display name. | jscpd CLI: the installed tool has a stable display identity. | generic |
| `provider.version` | Fallow 2.54.2: every capture records engine version `2.54.2`. | ESLint CLI: `--version` reports the installed implementation version. | generic |
| `scope.kind` | Fallow 2.54.2: project, path-capable, changed-base, and target operations are distinct. | dependency-cruiser CLI: source arguments, include/focus options, and graph targets distinguish scope forms. | generic |
| `scope.paths[]` | Fallow 2.54.2: path-capable operations accept selected project paths. | Radon CLI: commands walk or analyze explicitly supplied files and directories. | generic |
| `scope.base` | Fallow 2.54.2: audit capture records `base_ref: "HEAD"`. | Semgrep diff-aware scan: `SEMGREP_BASELINE_REF` supplies the explicit comparison base. | generic |
| `scope.target` | Fallow 2.54.2: trace capture targets an export in a file. | dependency-cruiser CLI: focus/include options select a module and its dependency neighborhood. | generic |
| `metric` | Fallow 2.54.2: complexity findings discriminate cyclomatic, cognitive, and CRAP threshold violations. | Radon CLI: complexity commands and reports identify cyclomatic as the requested metric. | generic |
| `verdict` | Fallow 2.54.2: audit asserts `fail`; other analysis verdicts are classifiable from findings while trace/fix assert none. | dependency-cruiser CLI: rule violations and configured severity determine a failing or clean validation outcome. | generic |
| `coverage[]` | Fallow 2.54.2: provider operation and configuration determine the evaluated gate categories, and the captured single-capability and audit envelopes expose the analyzer outputs used to derive that set. | Knip CLI: `--include` names the issue types reported by a run and JSON retains issue-type keys, providing an independent category set an adapter can expose as evaluated coverage. | generic |
| `findings[].id` | Fallow 2.54.2: category, location, and message inputs support an adapter-local ID. | Knip Code Climate: each issue includes a fingerprint; JSON issue fields also support a local ID. | generic |
| `findings[].category` | Fallow 2.54.2: payload collections distinguish dead code, clones, complexity, and boundary violations. | Knip JSON: enabled issue types are distinct keys for files, exports, dependencies, cycles, and related categories. | generic |
| `findings[].severity` | Fallow 2.54.2: complexity findings carry native severity and unranked findings can be preserved as unknown. | ESLint JSON: every lint message carries warning or error severity. | generic |
| `findings[].message` | Fallow 2.54.2: findings and actions provide classifiable descriptions. | ESLint JSON: every lint finding carries a message. | generic |
| `findings[].locations[].path` | Fallow 2.54.2: findings and clone instances carry project-relative paths. | Knip JSON: every issue group carries a file path. | generic |
| `findings[].locations[].line` | Fallow 2.54.2: export, complexity, boundary, and clone findings carry line positions. | Knip JSON: symbol issues carry 1-based line positions. | generic |
| `findings[].locations[].column` | Fallow 2.54.2: export, complexity, boundary, and clone findings carry columns. | Knip JSON: symbol issues carry 1-based columns. | generic |
| `findings[].locations[].endLine` | Fallow 2.54.2: clone instances carry end lines. | jscpd JSON: each side of a duplication carries start and end lines. | generic |
| `findings[].locations[].endColumn` | Fallow 2.54.2: clone instances carry end columns. | jscpd JSON: each side carries an end token location with line and column. | generic |
| `findings[].actions[].description` | Fallow 2.54.2: findings include human-readable action descriptions. | ESLint JSON: suggestions include descriptions paired with edits. | generic |
| `findings[].actions[].providerDetails.providerId` | Fallow 2.54.2: every preserved action detail is tagged `fallow`. | ESLint JSON: rule-specific suggestion data can be tagged `eslint`. | generic |
| `findings[].actions[].providerDetails.data` | Fallow 2.54.2: action type, fixability, notes, comments, and placement remain native detail. | ESLint JSON: rule IDs, message IDs, edit ranges, and replacement text remain implementation detail. | generic |
| `findings[].providerDetails.providerId` | Fallow 2.54.2: finding-only measurements are tagged `fallow`. | Radon JSON: complexity-only measurements can be tagged `radon`. | generic |
| `findings[].providerDetails.data` | Fallow 2.54.2: subtype flags and measurements remain structured provider data. | Radon JSON: ranks and raw complexity block metadata remain structured provider data. | generic |
| `trace.nodes[]` | Fallow 2.54.2: traced file/export and its references form graph nodes. | dependency-cruiser JSON: modules form dependency graph nodes. | generic |
| `trace.edges[].from` | Fallow 2.54.2: direct references and re-export chains provide edge sources. | dependency-cruiser JSON: each module is the source of its dependency edges. | generic |
| `trace.edges[].to` | Fallow 2.54.2: direct references and re-export chains provide edge targets. | dependency-cruiser JSON: each dependency has a resolved target module. | generic |
| `trace.evidence[].message` | Fallow 2.54.2: trace includes a human-readable reachability reason. | Knip trace: its documented reverse graph explains how exports are consumed. | generic |
| `trace.evidence[].locations[].path` | Fallow 2.54.2: trace identifies the target file and reference paths. | dependency-cruiser JSON: graph modules and violations identify source and target paths. | generic |
| `trace.evidence[].locations[].line` | Fallow 2.54.2: trace targets and reference evidence can retain source lines when supplied. | Knip trace: cycle and reference edges display import locations with lines. | generic |
| `trace.evidence[].locations[].column` | Fallow 2.54.2: trace targets and reference evidence can retain source columns when supplied. | Knip trace: cycle and reference edges display import locations with columns. | generic |
| `trace.evidence[].locations[].endLine` | Fallow 2.54.2: duplicate-location trace targets reuse captured clone end lines. | jscpd JSON: duplicate targets carry exact end lines for both instances. | generic |
| `trace.evidence[].locations[].endColumn` | Fallow 2.54.2: duplicate-location trace targets reuse captured clone end columns. | jscpd JSON: duplicate targets carry exact ending token columns. | generic |
| `trace.evidence[].providerDetails.providerId` | Fallow 2.54.2: reachability flags and chains are tagged `fallow`. | dependency-cruiser JSON: graph rule, cycle, and via evidence can be tagged `dependency-cruiser`. | generic |
| `trace.evidence[].providerDetails.data` | Fallow 2.54.2: reachability booleans and re-export chains remain provider data. | dependency-cruiser JSON: dependency types, cycle arrays, and via arrays remain provider data. | generic |
| `proposals[].description` | Fallow 2.54.2: dry-run fixes identify removal operations and affected names. | ESLint JSON: suggestions and dry-run fixes provide messages or descriptions. | generic |
| `proposals[].locations[].path` | Fallow 2.54.2: each captured fix names a path. | ESLint JSON: every result names its file path. | generic |
| `proposals[].locations[].line` | Fallow 2.54.2: each captured fix names a source line. | ESLint JSON: fixable messages carry starting lines. | generic |
| `proposals[].locations[].column` | Fallow 2.54.2: a normalized proposal may reuse the finding column when the fix payload omits it. | ESLint JSON: fixable messages carry starting columns. | generic |
| `proposals[].locations[].endLine` | Fallow 2.54.2: a normalized proposal may reuse the source finding range when available. | ESLint JSON: ranged fixable messages carry end lines. | generic |
| `proposals[].locations[].endColumn` | Fallow 2.54.2: a normalized proposal may reuse the source finding range when available. | ESLint JSON: ranged fixable messages carry end columns. | generic |
| `proposals[].providerDetails.providerId` | Fallow 2.54.2: raw fix records are tagged `fallow`. | ESLint JSON: raw edit records can be tagged `eslint`. | generic |
| `proposals[].providerDetails.data` | Fallow 2.54.2: raw fix type and symbol name remain provider data. | ESLint JSON: edit byte ranges and replacement text remain provider data. | generic |
| `native.providerId` | Fallow 2.54.2: the native envelope is explicitly tagged `fallow`. | jscpd JSON: a preserved native report can be tagged `jscpd`. | generic |
| `native.exitCode` | Fallow 2.54.2: captures preserve code `0` or `1` for completed analysis. | dependency-cruiser CLI: documented validation exits distinguish clean and error-level violations. | generic |
| `native.payload` | Fallow 2.54.2: complete parsed payload is retained without flattening. | Knip JSON: complete machine-readable issue groups can be retained unchanged. | generic |
| `native.stderr` | Fallow 2.54.2: capture envelopes preserve stderr without truncation. | ESLint CLI: process stderr is independent evidence that an adapter can retain unchanged. | generic |

Optional location coordinates remain absent when a tool does not supply them;
adapters never invent coordinates. The two Fallow proposal rows that mention
reusing a finding range apply only when the preview can be losslessly joined
to that finding; otherwise the optional coordinate is omitted.

## Provider-tagged aspects

| Provider-only aspect | Sole evidence | Placement |
|---|---|---|
| Envelope schema versions, elapsed timings, entry-point source counts, and raw summary counters | Fallow 2.54.2: captured dead-code, complexity, and audit envelopes expose these exact fields. | `native.payload` |
| Dead-code span offsets, type-only and re-export flags, and suppression comment syntax | Fallow 2.54.2: captured dead-code findings expose these exact representations. | `providerDetails.data` |
| Clone families, token counts, fragments, estimated savings, and family suggestions | Fallow 2.54.2: captured duplication envelope exposes these aggregation choices. | `providerDetails.data` |
| CRAP coverage tiers, vital-sign profiles, percentile and maintainability aggregates | Fallow 2.54.2: captured complexity envelope exposes these measurements. | `providerDetails.data` |
| Zone names, import specifier spelling, and provider boundary action notes | Fallow 2.54.2: captured boundary envelope exposes these rule-engine details. | `providerDetails.data` |
| Audit head SHA, changed-file count, and embedded per-analyzer summaries | Fallow 2.54.2: captured audit envelope exposes this composition. | `native.payload` |
| Audit subsection names used to derive declared coverage | Fallow 2.54.2: the native audit payload uses `dead_code`, `duplication`, and `complexity` sections and nests `boundary_violations` under `dead_code`; those exact composition keys are not generic coverage members. | `native.payload` |
| Reachability booleans, entry-point flags, direct-reference shape, and re-export-chain shape | Fallow 2.54.2: captured trace envelope exposes these exact semantics. | `providerDetails.data` |
| Raw fix type, symbol name, `dry_run`, and `total_fixed` counters | Fallow 2.54.2: captured fix-preview envelope exposes these exact fields. | `providerDetails.data` |
| Any unenumerated provider field preserved for losslessness | Fallow 2.54.2: the reviewed captures contain additional native structure not promoted generically. | `native.payload` |

## Capability coverage

| Capability | Reference provider evidence | Independent tool evidence |
|---|---|---|
| `dead-code` | Fallow 2.54.2: captured unused files and exports with locations and actions. | Knip JSON: unused files, exports, types, dependencies, and positions. |
| `duplication` | Fallow 2.54.2: captured clone groups with paired locations. | jscpd JSON: duplicates with two file ranges, fragments, and statistics. |
| `complexity` | Fallow 2.54.2: captured findings with cyclomatic, cognitive, and CRAP measurements. | Radon JSON: per-block cyclomatic complexity over Python paths. |
| `boundary-conformance` | Fallow 2.54.2: captured forbidden zone crossing. | dependency-cruiser JSON: configured rule violations with from, to, rule, and severity. |
| `changed-scope-audit` | Fallow 2.54.2: captured audit from `HEAD` covers tracked, staged, and untracked changes. | Semgrep diff-aware scan: findings are limited to changes from `SEMGREP_BASELINE_REF`. |
| `trace` | Fallow 2.54.2: captured target reachability, references, chains, and reason. | dependency-cruiser JSON: module nodes, dependency edges, cycles, and via paths. |
| `fix-preview` | Fallow 2.54.2: captured dry-run removal proposals with no applied fixes. | ESLint `--fix-dry-run`: JSON reports proposed output without writing files. |

## Delivered contract decision

Every leaf field in `ANALYSIS_RESULT_GENERIC_FIELDS` has reference and
independent evidence above. The generic contract intentionally excludes every
richer field listed in the provider-tagged table. Adding one later requires a
second real-tool mapping; preserving it under a provider tag does not.
