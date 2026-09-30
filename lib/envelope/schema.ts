import { type Static, Type } from "typebox";

export const ENVELOPE_OUTCOMES = ["done", "blocked", "failed"] as const;
export const EVIDENCE_KINDS = ["test", "command", "file", "claim"] as const;
export const EVIDENCE_RESULTS = ["pass", "fail", "n/a"] as const;
export const FINDING_SEVERITIES = ["high", "medium", "low"] as const;

const strict = { additionalProperties: false } as const;

export const EvidenceSchema = Type.Object(
	{
		kind: Type.Enum(EVIDENCE_KINDS),
		ref: Type.String(),
		result: Type.Enum(EVIDENCE_RESULTS),
		note: Type.Optional(Type.String()),
	},
	strict,
);

export const FindingSchema = Type.Object(
	{
		id: Type.String(),
		severity: Type.Enum(FINDING_SEVERITIES),
		file: Type.String(),
		summary: Type.String(),
		fix: Type.String(),
	},
	strict,
);

/**
 * `reason` is optional here because the schema cannot tie it to `outcome`;
 * `parseEnvelope` rejects `blocked`/`failed` envelopes that lack one.
 */
export const EnvelopeSchema = Type.Object(
	{
		outcome: Type.Enum(ENVELOPE_OUTCOMES),
		summary: Type.Optional(Type.String()),
		evidence: Type.Optional(Type.Array(EvidenceSchema)),
		findings: Type.Optional(Type.Array(FindingSchema)),
		touched: Type.Optional(Type.Array(Type.String())),
		reason: Type.Optional(Type.String()),
	},
	strict,
);

export type EnvelopeOutcome = (typeof ENVELOPE_OUTCOMES)[number];
export type Evidence = Static<typeof EvidenceSchema>;
export type Finding = Static<typeof FindingSchema>;
export type Envelope = Static<typeof EnvelopeSchema>;
