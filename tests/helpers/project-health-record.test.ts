import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	type ProjectHealthRecordV1,
	parseProjectHealthRecordV1,
} from "./project-health-record.ts";

const digest = "a".repeat(64);
const identity = "unused-export\tlib/example.ts\texample";

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

const identityDigest = sha256(`${identity}\n`);
const configurationDigest = sha256(`fallow.toml\0${digest}\0`);

function snapshot(): ProjectHealthRecordV1["before"] {
	return {
		commit: "16d1d3b53a3f5a39f75e355b9bcb479df5305d61",
		executionRoot: { canonicalPathSha256: digest, consent: "recorded" },
		provider: { id: "fallow", name: "Fallow", version: "2.54.2" },
		analysisConfiguration: {
			files: [{ path: "fallow.toml", sha256: digest }],
			digest: configurationDigest,
		},
		bindings: [
			...(
				[
					"dead-code",
					"duplication",
					"complexity",
					"changed-scope-audit",
					"trace",
					"fix-preview",
				] as const
			).map((capability) => ({
				capability,
				state: "bound" as const,
				provider: { id: "fallow", version: "2.54.2" },
				scopes: ["project", "paths"],
			})),
			{
				capability: "boundary-conformance",
				state: "unbound",
				reason: "provider-not-configured",
			},
		],
		invocations: [
			{
				id: "before.dead-code.1",
				source: {
					kind: "surface",
					tool: "analysis_dead_code",
					arguments: {},
				},
				outcome: {
					state: "completed-fail",
					count: 1,
					identities: [identity],
					identityDigest,
				},
			},
		],
		findings: [
			{
				identity,
				category: "dead-code",
				disposition: {
					kind: "remediated",
					taskId: "TASK-768",
					trace: { invocationId: "before.trace.1" },
				},
			},
		],
		suppressions: { inline: 0, registered: 0, stale: 0 },
	};
}

function record(): ProjectHealthRecordV1 {
	return {
		schemaVersion: 1,
		generatedFor: "project-health-audit",
		identityAlgorithm: "sha256/utf-8/tab-joined-v1",
		before: snapshot(),
		after: snapshot(),
		reproduction: { commit: "source", matched: true, mismatches: [] },
		closeout: {
			analyzedCommit: "source",
			artifactPaths: [".fallow-baselines/dead-code.json"],
			floorConfiguration: {
				files: [{ path: ".fallow-baselines/dead-code.json", sha256: digest }],
				digest: sha256(`.fallow-baselines/dead-code.json\0${digest}\0`),
			},
			gateOwnedFilesChanged: [],
		},
		downstream: { executionLiveness: [] },
	};
}

function serialize(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

describe("project health record schema v1", () => {
	it("accepts canonical schema-v1 JSON", () => {
		expect(parseProjectHealthRecordV1(serialize(record()))).toEqual(record());
	});

	it("rejects noncanonical JSON formatting", () => {
		expect(() => parseProjectHealthRecordV1(JSON.stringify(record()))).toThrow(
			"canonical two-space JSON ending with LF",
		);
	});

	it("rejects absolute paths and invalid digests", () => {
		const absolutePath = record();
		absolutePath.before.analysisConfiguration = {
			...absolutePath.before.analysisConfiguration,
			files: [{ path: "/Users/example/fallow.toml", sha256: digest }],
		};
		expect(() => parseProjectHealthRecordV1(serialize(absolutePath))).toThrow(
			"project-relative path",
		);

		const invalidDigest = record();
		invalidDigest.before.executionRoot.canonicalPathSha256 = "not-a-digest";
		expect(() => parseProjectHealthRecordV1(serialize(invalidDigest))).toThrow(
			"lowercase SHA-256",
		);
	});

	it("rejects unavailable outcomes without a diagnostic reason", () => {
		const invalid = record() as unknown as {
			before: { invocations: Array<Record<string, unknown>> };
		};
		invalid.before.invocations[0] = {
			id: "before.boundary.1",
			source: {
				kind: "surface",
				tool: "analysis_boundaries",
				arguments: {},
			},
			outcome: { state: "unbound", identityDigest: digest },
		};
		expect(() => parseProjectHealthRecordV1(serialize(invalid))).toThrow(
			"outcome.reason",
		);
	});

	it("rejects the superseded closeout commit field", () => {
		const invalid = record() as unknown as {
			closeout: Record<string, unknown>;
		};
		invalid.closeout.closeoutCommit = "closeout";
		expect(() => parseProjectHealthRecordV1(serialize(invalid))).toThrow(
			"closeout.closeoutCommit is not allowed",
		);
	});

	it("rejects identity and configuration digests that do not match their rows", () => {
		const invalidIdentityDigest = record();
		const [invocation] = invalidIdentityDigest.before.invocations;
		if (!invocation) throw new Error("fixture invocation is required");
		invocation.outcome.identityDigest = digest;
		expect(() =>
			parseProjectHealthRecordV1(serialize(invalidIdentityDigest)),
		).toThrow("identityDigest must match identities");

		const invalidConfigurationDigest = record();
		invalidConfigurationDigest.before.analysisConfiguration.digest = digest;
		expect(() =>
			parseProjectHealthRecordV1(serialize(invalidConfigurationDigest)),
		).toThrow("digest must match files");
	});

	it("rejects incomplete capability binding inventories", () => {
		const invalid = record();
		invalid.before.bindings = invalid.before.bindings.slice(1);
		expect(() => parseProjectHealthRecordV1(serialize(invalid))).toThrow(
			"bindings must contain each capability exactly once",
		);
	});
});
