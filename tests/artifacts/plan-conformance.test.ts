import { describe, expect, test } from "vitest";
import { checkPlanConformance } from "../../lib/artifacts/index.ts";

describe("plan conformance", () => {
	test("flags unresolved decision citations and undated supersession pointers", () => {
		const result = checkPlanConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Original decision**
  - Decision: choose the original path
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Undated amendment**
  - Decision: replace part of the original path
  - Decided by: planner-proposed
  - Supersedes: D-001

- **D-003 - Dated annotation** *(superseded by D-001, 2026-07-28)*
  - Decision: preserve dated heading annotations
  - Decided by: planner-proposed, 2026-07-28

## Overview

The implementation still cites D-001, but this pointer to D-099 is unresolved.

## Behaviors

### B-011 - Checker resolves decisions

- Source: AC-010
- Context: decision citations and supersession pointers appear in a plan
- Action: the checker resolves and dates them
- Expected: unresolved citations and undated pointers are distinct issues
`,
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-099",
			}),
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "Supersedes: D-001",
			}),
		]);
	});

	test("ignores citations and annotations quoted as code", () => {
		const result = checkPlanConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Only decision**
  - Decision: keep it
  - Decided by: planner-proposed, 2026-07-28

## Overview

Another plan's \`D-098\`/\`D-099\` are mentions, not citations, and so are the
annotation grammar template \`*(withdrawn by D-###, <date>)*\` and the undated
example \`*(superseded by D-097, <date>)*\`.

\`\`\`ts
// D-096 inside a fenced block is also a mention
// *(withdrawn by D-095)*
\`\`\`

## Behaviors

### B-011 - Checker resolves decisions

- Source: AC-010
- Context: quoted citations appear in prose spans and fenced blocks
- Action: the checker scans the plan
- Expected: quoted mentions produce no citation or supersession issues
`,
		});

		expect(result.issues).toEqual([]);
	});

	test("masks same-paragraph multiline spans but never across block boundaries", () => {
		const result = checkPlanConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Only decision**
  - Decision: keep it
  - Decided by: planner-proposed, 2026-07-28

## Overview

A valid span may continue \`across a soft
line break mentioning D-097\` without creating a citation.

A stray backtick \` sits in this paragraph.

This paragraph cites D-099 and must still be flagged.

Another stray backtick \` sits here.

- first bullet holds a stray backtick \`
- second bullet cites D-098 and must be flagged
- third bullet holds another stray backtick \`

## Behaviors

### B-011 - Checker resolves decisions

- Source: AC-010
- Context: multiline spans and stray backticks appear in prose
- Action: the checker scans the plan
- Expected: same-paragraph spans mask; block-crossing pairs never mask
`,
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-099",
			}),
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-098",
			}),
		]);
	});

	test("keeps the entry date visible when a fenced decision example splits the entry", () => {
		const result = checkPlanConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Original**
  - Decision: keep the original ground
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Amendment quoting an example entry**
  - Decision: document the entry grammar
  - Decided by: planner-proposed, 2026-07-28

\`\`\`md
- **D-999 - Example**
\`\`\`

  - Supersedes: the original descriptive ground
`,
		});

		expect(
			result.issues.filter((issue) => issue.kind === "undated-supersession"),
		).toEqual([]);
	});

	test("flags a descriptive Supersedes ground whose decision entry carries no date", () => {
		const result = checkPlanConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Original**
  - Decision: keep the original ground
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Undated amendment**
  - Decision: replace it
  - Decided by: planner-proposed
  - Supersedes: D-001 because it changed
`,
		});

		expect(result.issues).toContainEqual(
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "Supersedes: D-001 because it changed",
			}),
		);
	});

	test("masks Markdown code spans and fences before decision declaration and citation scans", () => {
		const result = checkPlanConformance({
			planSlug: "markdown-masking",
			planMarkdown: `# Markdown masking

\`\`\`md
## Decision Log
- **D-777 - Fenced fake decision section**
\`\`\`

## Decision Log

- **D-001 - Real decision**
  - Decision: keep the real declaration
  - Decided by: user-directed, 2026-07-28

\`\`- **D-097 - Inline quoted declaration**\`\`

\`\`\`\`md
- **D-098 - Backtick-fenced declaration**
  - Supersedes: D-001
\`\`\`
## Fake section inside the outer fence
\`\`\`\`

~~~~md
- **D-099 - Tilde-fenced declaration** *(withdrawn by D-001)*
~~~
## Another fake section
~~~~

## Overview

Real citations D-097, D-098, and D-099 must remain unresolved.

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-001, 2026-07-28)*

## Appendix

\`\`\`
D-096 and *(withdrawn by D-095)* remain masked through an unmatched fence.

## Decision Log
- **D-096 - Also masked**
`,
		});

		expect(result.issues.map((issue) => [issue.kind, issue.actual])).toEqual([
			["unresolved-decision-citation", "D-097"],
			["unresolved-decision-citation", "D-098"],
			["unresolved-decision-citation", "D-099"],
		]);
	});

	test("preserves inline code span delimiters across lines", () => {
		const quotedDeclaration = checkPlanConformance({
			planSlug: "multiline-code-span",
			planMarkdown: `## Decision Log

The quoted declaration sits in a fence:

\`\`\`md
- **D-097 - Quoted declaration**
\`\`\`

## Overview

The real citation D-097 remains unresolved.

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-097, 2026-07-28)*
`,
		});
		expect(
			quotedDeclaration.issues.filter(
				(issue) => issue.kind === "unresolved-decision-citation",
			),
		).toEqual([
			expect.objectContaining({
				actual: "D-097",
			}),
		]);

		const quotedCitation = checkPlanConformance({
			planSlug: "multiline-code-span",
			planMarkdown: `## Decision Log

- **D-001 - Real declaration**
  - Decision: preserve multiline quoting
  - Decided by: user-directed, 2026-07-28

## Overview

The quoted citation starts here: \`\`
D-099 is only sample text
and closes here.\`\`

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-001, 2026-07-28)*
`,
		});
		expect(quotedCitation.issues).toEqual([]);
	});

	test("requires the supersession pointer itself to carry an ISO date", () => {
		const result = checkPlanConformance({
			planSlug: "supersession-pointer",
			planMarkdown: `## Decision Log

- **D-001 - Original**
  - Decision: original path
  - Decided by: user-directed, 2026-07-27

- **D-002 - Replacement**
  - Decision: replacement path
  - Decided by: user-directed, 2026-07-28
  - Supersedes: D-001

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-001, 2026-07-28)*
`,
		});

		expect(result.issues).toContainEqual(
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "Supersedes: D-001",
			}),
		);
	});

	test("validates dates on structured multi-decision Supersedes pointers", () => {
		const undatedPointers = [
			"D-001 and D-002",
			"D-001/D-002",
			"D-001,D-002",
		] as const;

		for (const pointer of undatedPointers) {
			const result = checkPlanConformance({
				planSlug: "supersession-pointer",
				planMarkdown: supersessionPlan(pointer),
			});
			expect(result.issues, pointer).toContainEqual(
				expect.objectContaining({
					kind: "undated-supersession",
					actual: `Supersedes: ${pointer}`,
				}),
			);
		}

		for (const pointer of undatedPointers) {
			const datedPointer = `${pointer}, 2026-07-28`;
			const result = checkPlanConformance({
				planSlug: "supersession-pointer",
				planMarkdown: supersessionPlan(datedPointer),
			});
			expect(
				result.issues.filter((issue) => issue.kind === "undated-supersession"),
				datedPointer,
			).toEqual([]);
		}
	});

	test("accepts descriptive legacy Supersedes grounds without pointer dates", () => {
		for (const pointer of [
			"D-005 and Design's `pi.exec` mechanism",
			"prior provider-discovery-error unbound reason",
			"B-013/B-016/Design delegation through Verifier",
		]) {
			const result = checkPlanConformance({
				planSlug: "supersession-pointer",
				planMarkdown: supersessionPlan(pointer),
			});
			expect(
				result.issues.filter((issue) => issue.kind === "undated-supersession"),
				pointer,
			).toEqual([]);
		}
	});

	test("flags a supersession annotation that carries no date", () => {
		const planWith = (annotation: string) => `## Decision Log

- **D-001 - Replacement**
  - Decision: replace the old ground
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Old ground** ${annotation}
  - Decision: the original path
  - Decided by: planner-proposed, 2026-07-27
`;

		const dated = checkPlanConformance({
			planSlug: "annotations",
			planMarkdown: planWith("*(superseded by D-001, 2026-07-28)*"),
		});
		expect(dated.issues).toEqual([]);

		const undated = checkPlanConformance({
			planSlug: "annotations",
			planMarkdown: planWith("*(superseded by D-001)*"),
		});
		expect(undated.issues).toEqual([
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "*(superseded by D-001)*",
			}),
		]);
	});

	test("checks decision citations when the Decision Log is absent", () => {
		const noCitation = checkPlanConformance({
			planSlug: "no-decision-log",
			planMarkdown: "## Overview\n\nNothing is cited here.\n",
		});
		expect(noCitation.ok).toBe(true);
		expect(noCitation.behaviorCount).toBe(0);
		expect(noCitation.issues).toEqual([]);

		const unresolvedCitation = checkPlanConformance({
			planSlug: "no-decision-log",
			planMarkdown: "## Overview\n\nThe implementation relies on D-404.\n",
		});
		expect(unresolvedCitation.ok).toBe(false);
		expect(unresolvedCitation.issues).toEqual([
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-404",
			}),
		]);
	});

	test("counts behavior headings only inside the real Behaviors section", () => {
		const result = checkPlanConformance({
			planSlug: "section-scan",
			planMarkdown: `\`\`\`md
## Behaviors
### B-999 - Fenced fake behavior
\`\`\`

## Behaviors
### B-001 - Real behavior

\`\`\`md
## Files to Change
\`\`\`

### B-002 - Still in the real behavior section

## Files to Change
### B-003 - Not a behavior
`,
		});

		expect(result.behaviorCount).toBe(2);
		expect(result.advisories).toEqual([]);
	});

	test("advises splitting only when the behavior count exceeds the guidance", () => {
		const planWith = (count: number) =>
			`## Behaviors\n\n${Array.from(
				{ length: count },
				(_, index) => `### B-${String(index + 1).padStart(3, "0")} - Behavior`,
			).join("\n\n")}\n`;

		const atGuidance = checkPlanConformance({
			planSlug: "sized",
			planMarkdown: planWith(12),
		});
		expect(atGuidance.advisories).toEqual([]);

		const overGuidance = checkPlanConformance({
			planSlug: "sized",
			planMarkdown: planWith(13),
		});
		expect(overGuidance.ok).toBe(true);
		expect(overGuidance.advisories).toEqual([
			expect.objectContaining({
				kind: "behavior-count-guidance",
				count: 13,
				guidance: 12,
			}),
		]);
	});
});
function supersessionPlan(pointer: string): string {
	return `## Decision Log

- **D-001 - Original one**
  - Decision: preserve the first ground
  - Decided by: user-directed, 2026-07-26

- **D-002 - Original two**
  - Decision: preserve the second ground
  - Decided by: user-directed, 2026-07-27

- **D-003 - Amendment**
  - Decision: replace the exact named ground
  - Decided by: planner-proposed, amend-on-record, 2026-07-28
  - Supersedes: ${pointer}

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-003, 2026-07-28)*
`;
}
