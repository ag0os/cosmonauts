import { createHash } from "node:crypto";

type Sha256Hex = string;

interface FileDigest {
	path: string;
	sha256: Sha256Hex;
}

interface CapabilityBindingRecord {
	capability:
		| "dead-code"
		| "duplication"
		| "complexity"
		| "boundary-conformance"
		| "changed-scope-audit"
		| "trace"
		| "fix-preview";
	state: "bound" | "unbound" | "failed";
	provider?: { id: string; version: string };
	scopes?: readonly string[];
	metrics?: readonly string[];
	reason?: string;
}

type InvocationSource =
	| { kind: "surface"; tool: string; arguments: Record<string, unknown> }
	| {
			kind: "direct";
			label: "surface-missing" | "diagnostic";
			executable: string;
			args: readonly string[];
	  };

type CapabilityOutcome =
	| {
			state: "completed-pass" | "completed-fail";
			count: number;
			identities: readonly string[];
			identityDigest: Sha256Hex;
	  }
	| {
			state: "unbound" | "unsupported" | "failed";
			reason: string;
			identityDigest: Sha256Hex;
	  };

interface InvocationRecord {
	id: string;
	source: InvocationSource;
	outcome: CapabilityOutcome;
	native?: {
		exitCode: number;
		stderrSha256: Sha256Hex;
		payloadSha256: Sha256Hex;
	};
	failure?: { kind: string; message: string; exitCode?: number };
}

interface EvidenceRef {
	invocationId: string;
	identity?: string;
}

type FindingDisposition =
	| { kind: "remediated"; taskId: string; trace: EvidenceRef }
	| { kind: "baselined"; reason: string; files: readonly string[] }
	| { kind: "unresolved"; reason: string; evidence: EvidenceRef }
	| {
			kind: "false-positive";
			reason: string;
			reference: string;
			evidence: EvidenceRef;
	  }
	| { kind: "escalated"; reason: string; evidence: EvidenceRef };

interface FindingRecord {
	identity: string;
	category: string;
	severity?: string;
	family?: string;
	disposition: FindingDisposition;
}

interface HealthSnapshot {
	commit: string;
	executionRoot: {
		canonicalPathSha256: Sha256Hex;
		consent: "recorded" | "withheld";
	};
	provider: {
		id: string;
		name: string;
		version: string;
		executableSha256?: Sha256Hex;
		executablePackage?: string;
	};
	analysisConfiguration: {
		files: readonly FileDigest[];
		digest: Sha256Hex;
	};
	floorConfiguration?: {
		files: readonly FileDigest[];
		digest: Sha256Hex;
	};
	bindings: readonly CapabilityBindingRecord[];
	invocations: readonly InvocationRecord[];
	findings: readonly FindingRecord[];
	suppressions: { inline: number; registered: number; stale: number };
}

export interface ProjectHealthRecordV1 {
	schemaVersion: 1;
	generatedFor: "project-health-audit";
	identityAlgorithm: "sha256/utf-8/tab-joined-v1";
	before: HealthSnapshot;
	after: HealthSnapshot;
	reproduction: {
		commit: string;
		matched: boolean;
		mismatches: readonly string[];
	};
	closeout: {
		analyzedCommit: string;
		artifactPaths: readonly string[];
		floorConfiguration: {
			files: readonly FileDigest[];
			digest: Sha256Hex;
		};
		gateOwnedFilesChanged: readonly {
			path: string;
			justification: string;
		}[];
	};
	downstream: {
		executionLiveness: readonly {
			path: string;
			changes: readonly string[];
		}[];
	};
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CAPABILITIES = [
	"dead-code",
	"duplication",
	"complexity",
	"boundary-conformance",
	"changed-scope-audit",
	"trace",
	"fix-preview",
] as const;

export function parseProjectHealthRecordV1(
	serialized: string,
): ProjectHealthRecordV1 {
	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new Error("project health record must be valid JSON");
	}
	if (`${JSON.stringify(value, null, 2)}\n` !== serialized) {
		throw new Error(
			"project health record must use canonical two-space JSON ending with LF",
		);
	}
	assertRecord(value, "record");
	assertKeys(
		value,
		[
			"schemaVersion",
			"generatedFor",
			"identityAlgorithm",
			"before",
			"after",
			"reproduction",
			"closeout",
			"downstream",
		],
		"record",
	);
	assertEqual(value.schemaVersion, 1, "schemaVersion");
	assertEqual(value.generatedFor, "project-health-audit", "generatedFor");
	assertEqual(
		value.identityAlgorithm,
		"sha256/utf-8/tab-joined-v1",
		"identityAlgorithm",
	);
	assertSnapshot(value.before, "before");
	assertSnapshot(value.after, "after");
	assertReproduction(value.reproduction);
	assertCloseout(value.closeout);
	assertDownstream(value.downstream);
	return value as unknown as ProjectHealthRecordV1;
}

function assertSnapshot(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(
		value,
		[
			"commit",
			"executionRoot",
			"provider",
			"analysisConfiguration",
			"bindings",
			"invocations",
			"findings",
			"suppressions",
		],
		field,
		["floorConfiguration"],
	);
	assertString(value.commit, `${field}.commit`);
	assertExecutionRoot(value.executionRoot, `${field}.executionRoot`);
	assertProvider(value.provider, `${field}.provider`);
	assertConfiguration(
		value.analysisConfiguration,
		`${field}.analysisConfiguration`,
	);
	if (value.floorConfiguration !== undefined) {
		assertConfiguration(
			value.floorConfiguration,
			`${field}.floorConfiguration`,
		);
	}
	assertArray(value.bindings, `${field}.bindings`, assertBinding);
	assertCompleteBindings(value.bindings, `${field}.bindings`);
	assertArray(value.invocations, `${field}.invocations`, assertInvocation);
	assertArray(value.findings, `${field}.findings`, assertFinding);
	assertSorted(
		value.findings.map((finding) => {
			assertRecord(finding, `${field}.findings`);
			assertString(finding.identity, `${field}.findings.identity`);
			return finding.identity;
		}),
		`${field}.findings`,
	);
	assertSuppressions(value.suppressions, `${field}.suppressions`);
}

function assertExecutionRoot(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["canonicalPathSha256", "consent"], field);
	assertSha256(value.canonicalPathSha256, `${field}.canonicalPathSha256`);
	assertOneOf(value.consent, ["recorded", "withheld"], `${field}.consent`);
}

function assertProvider(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["id", "name", "version"], field, [
		"executableSha256",
		"executablePackage",
	]);
	assertString(value.id, `${field}.id`);
	assertString(value.name, `${field}.name`);
	assertString(value.version, `${field}.version`);
	if (value.executableSha256 !== undefined) {
		assertSha256(value.executableSha256, `${field}.executableSha256`);
	}
	if (value.executablePackage !== undefined) {
		assertString(value.executablePackage, `${field}.executablePackage`);
	}
}

function assertConfiguration(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["files", "digest"], field);
	assertArray(value.files, `${field}.files`, (item, itemField) => {
		assertRecord(item, itemField);
		assertKeys(item, ["path", "sha256"], itemField);
		assertRelativePath(item.path, `${itemField}.path`);
		assertSha256(item.sha256, `${itemField}.sha256`);
	});
	const files = value.files as FileDigest[];
	assertSorted(
		files.map((file) => file.path),
		`${field}.files`,
	);
	assertSha256(value.digest, `${field}.digest`);
	const framing = files
		.map((file) => `${file.path}\0${file.sha256}\0`)
		.join("");
	if (value.digest !== sha256(framing)) {
		throw new Error(`${field}.digest must match files`);
	}
}

function assertBinding(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["capability", "state"], field, [
		"provider",
		"scopes",
		"metrics",
		"reason",
	]);
	assertOneOf(value.capability, CAPABILITIES, `${field}.capability`);
	assertOneOf(value.state, ["bound", "unbound", "failed"], `${field}.state`);
	if (value.provider !== undefined) {
		assertRecord(value.provider, `${field}.provider`);
		assertKeys(value.provider, ["id", "version"], `${field}.provider`);
		assertString(value.provider.id, `${field}.provider.id`);
		assertString(value.provider.version, `${field}.provider.version`);
	}
	assertOptionalStringArray(value.scopes, `${field}.scopes`);
	assertOptionalStringArray(value.metrics, `${field}.metrics`);
	if (value.reason !== undefined) assertString(value.reason, `${field}.reason`);
}

function assertCompleteBindings(bindings: unknown[], field: string): void {
	const counts = new Map<string, number>();
	for (const binding of bindings) {
		assertRecord(binding, field);
		assertString(binding.capability, `${field}.capability`);
		counts.set(binding.capability, (counts.get(binding.capability) ?? 0) + 1);
	}
	if (CAPABILITIES.some((capability) => counts.get(capability) !== 1)) {
		throw new Error(`${field} must contain each capability exactly once`);
	}
}

function assertInvocation(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["id", "source", "outcome"], field, ["native", "failure"]);
	assertString(value.id, `${field}.id`);
	assertInvocationSource(value.source, `${field}.source`);
	assertOutcome(value.outcome, `${field}.outcome`);
	if (value.native !== undefined) assertNative(value.native, `${field}.native`);
	if (value.failure !== undefined) {
		assertRecord(value.failure, `${field}.failure`);
		assertKeys(value.failure, ["kind", "message"], `${field}.failure`, [
			"exitCode",
		]);
		assertString(value.failure.kind, `${field}.failure.kind`);
		assertString(value.failure.message, `${field}.failure.message`);
		if (value.failure.exitCode !== undefined) {
			assertInteger(value.failure.exitCode, `${field}.failure.exitCode`);
		}
	}
}

function assertInvocationSource(value: unknown, field: string): void {
	assertRecord(value, field);
	if (value.kind === "surface") {
		assertKeys(value, ["kind", "tool", "arguments"], field);
		assertString(value.tool, `${field}.tool`);
		assertRecord(value.arguments, `${field}.arguments`);
		return;
	}
	assertEqual(value.kind, "direct", `${field}.kind`);
	assertKeys(value, ["kind", "label", "executable", "args"], field);
	assertOneOf(value.label, ["surface-missing", "diagnostic"], `${field}.label`);
	assertString(value.executable, `${field}.executable`);
	assertStringArray(value.args, `${field}.args`);
}

function assertOutcome(value: unknown, field: string): void {
	assertRecord(value, field);
	if (value.state === "completed-pass" || value.state === "completed-fail") {
		assertKeys(
			value,
			["state", "count", "identities", "identityDigest"],
			field,
		);
		assertNonNegativeInteger(value.count, `${field}.count`);
		assertStringArray(value.identities, `${field}.identities`);
		if (value.count !== value.identities.length) {
			throw new Error(`${field}.count must match identities.length`);
		}
		assertSorted(value.identities, `${field}.identities`);
		assertSha256(value.identityDigest, `${field}.identityDigest`);
		const serialized =
			value.identities.length === 0 ? "" : `${value.identities.join("\n")}\n`;
		if (value.identityDigest !== sha256(serialized)) {
			throw new Error(`${field}.identityDigest must match identities`);
		}
		return;
	}
	assertOneOf(
		value.state,
		["unbound", "unsupported", "failed"],
		`${field}.state`,
	);
	assertKeys(value, ["state", "reason", "identityDigest"], field);
	assertString(value.reason, `${field}.reason`);
	assertSha256(value.identityDigest, `${field}.identityDigest`);
}

function assertNative(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["exitCode", "stderrSha256", "payloadSha256"], field);
	assertInteger(value.exitCode, `${field}.exitCode`);
	assertSha256(value.stderrSha256, `${field}.stderrSha256`);
	assertSha256(value.payloadSha256, `${field}.payloadSha256`);
}

function assertFinding(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["identity", "category", "disposition"], field, [
		"severity",
		"family",
	]);
	assertString(value.identity, `${field}.identity`);
	assertString(value.category, `${field}.category`);
	if (value.severity !== undefined)
		assertString(value.severity, `${field}.severity`);
	if (value.family !== undefined) assertString(value.family, `${field}.family`);
	assertDisposition(value.disposition, `${field}.disposition`);
}

function assertDisposition(value: unknown, field: string): void {
	assertRecord(value, field);
	if (value.kind === "remediated") {
		assertKeys(value, ["kind", "taskId", "trace"], field);
		assertString(value.taskId, `${field}.taskId`);
		assertEvidenceRef(value.trace, `${field}.trace`);
		return;
	}
	if (value.kind === "baselined") {
		assertKeys(value, ["kind", "reason", "files"], field);
		assertString(value.reason, `${field}.reason`);
		assertArray(value.files, `${field}.files`, (path, pathField) =>
			assertRelativePath(path, pathField),
		);
		return;
	}
	if (value.kind === "false-positive") {
		assertKeys(value, ["kind", "reason", "reference", "evidence"], field);
		assertString(value.reference, `${field}.reference`);
	} else {
		assertOneOf(value.kind, ["unresolved", "escalated"], `${field}.kind`);
		assertKeys(value, ["kind", "reason", "evidence"], field);
	}
	assertString(value.reason, `${field}.reason`);
	assertEvidenceRef(value.evidence, `${field}.evidence`);
}

function assertEvidenceRef(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["invocationId"], field, ["identity"]);
	assertString(value.invocationId, `${field}.invocationId`);
	if (value.identity !== undefined)
		assertString(value.identity, `${field}.identity`);
}

function assertSuppressions(value: unknown, field: string): void {
	assertRecord(value, field);
	assertKeys(value, ["inline", "registered", "stale"], field);
	assertNonNegativeInteger(value.inline, `${field}.inline`);
	assertNonNegativeInteger(value.registered, `${field}.registered`);
	assertNonNegativeInteger(value.stale, `${field}.stale`);
}

function assertReproduction(value: unknown): void {
	assertRecord(value, "reproduction");
	assertKeys(value, ["commit", "matched", "mismatches"], "reproduction");
	assertString(value.commit, "reproduction.commit");
	if (typeof value.matched !== "boolean") {
		throw new Error("reproduction.matched must be a boolean");
	}
	assertStringArray(value.mismatches, "reproduction.mismatches");
}

function assertCloseout(value: unknown): void {
	assertRecord(value, "closeout");
	assertKeys(
		value,
		[
			"analyzedCommit",
			"artifactPaths",
			"floorConfiguration",
			"gateOwnedFilesChanged",
		],
		"closeout",
	);
	assertString(value.analyzedCommit, "closeout.analyzedCommit");
	assertArray(value.artifactPaths, "closeout.artifactPaths", (path, field) =>
		assertRelativePath(path, field),
	);
	assertConfiguration(value.floorConfiguration, "closeout.floorConfiguration");
	assertArray(
		value.gateOwnedFilesChanged,
		"closeout.gateOwnedFilesChanged",
		(item, field) => {
			assertRecord(item, field);
			assertKeys(item, ["path", "justification"], field);
			assertRelativePath(item.path, `${field}.path`);
			assertString(item.justification, `${field}.justification`);
		},
	);
}

function assertDownstream(value: unknown): void {
	assertRecord(value, "downstream");
	assertKeys(value, ["executionLiveness"], "downstream");
	assertArray(
		value.executionLiveness,
		"downstream.executionLiveness",
		(item, field) => {
			assertRecord(item, field);
			assertKeys(item, ["path", "changes"], field);
			assertRelativePath(item.path, `${field}.path`);
			assertStringArray(item.changes, `${field}.changes`);
		},
	);
}

function assertRecord(
	value: unknown,
	field: string,
): asserts value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${field} must be an object`);
	}
}

function assertKeys(
	value: Record<string, unknown>,
	required: readonly string[],
	field: string,
	optional: readonly string[] = [],
): void {
	for (const key of required) {
		if (!(key in value)) throw new Error(`${field}.${key} is required`);
	}
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) throw new Error(`${field}.${key} is not allowed`);
	}
}

function assertArray(
	value: unknown,
	field: string,
	assertItem: (item: unknown, field: string) => void,
): asserts value is unknown[] {
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	value.forEach((item, index) => {
		assertItem(item, `${field}[${index}]`);
	});
}

function assertString(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${field} must be a non-empty string`);
	}
}

function assertStringArray(
	value: unknown,
	field: string,
): asserts value is string[] {
	assertArray(value, field, assertString);
}

function assertOptionalStringArray(value: unknown, field: string): void {
	if (value !== undefined) assertStringArray(value, field);
}

function assertRelativePath(value: unknown, field: string): void {
	assertString(value, field);
	if (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value)) {
		throw new Error(`${field} must be a project-relative path`);
	}
}

function assertSha256(value: unknown, field: string): void {
	if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
		throw new Error(`${field} must be a lowercase SHA-256 digest`);
	}
}

function assertInteger(value: unknown, field: string): asserts value is number {
	if (!Number.isInteger(value)) throw new Error(`${field} must be an integer`);
}

function assertNonNegativeInteger(value: unknown, field: string): void {
	assertInteger(value, field);
	if (value < 0) throw new Error(`${field} must be non-negative`);
}

function assertEqual<T>(
	value: unknown,
	expected: T,
	field: string,
): asserts value is T {
	if (value !== expected)
		throw new Error(`${field} must equal ${String(expected)}`);
}

function assertOneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
	field: string,
): asserts value is T {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		throw new Error(`${field} must be one of ${allowed.join(", ")}`);
	}
}

function assertSorted(values: readonly string[], field: string): void {
	const sorted = [...values].sort((left, right) => left.localeCompare(right));
	if (values.some((value, index) => value !== sorted[index])) {
		throw new Error(`${field} must be lexically sorted`);
	}
}

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
