import { writeFileSync } from "node:fs";
import type {
	ReportedHookContext,
	Reporter,
	SerializedError,
	TestCase,
	TestModule,
	TestRunEndReason,
	TestSuite,
} from "vitest/node";
import type { EvidenceBasis, TestSurface } from "./schema.ts";

export interface CommandIdentity {
	readonly id: string;
	readonly surface: TestSurface;
	readonly argv: readonly string[];
}
export interface PublicErrorEvidence {
	readonly entityId: string;
	readonly entityType: "module" | "suite" | "test" | "run";
	readonly phase: "collection" | "unknown";
	readonly phaseBasis: EvidenceBasis;
	readonly limitation?: string;
	readonly publicPayload: unknown;
}
export interface PublicCaseInput {
	readonly id: string;
	readonly name: string;
	readonly fullName: string;
	readonly state: string;
	readonly errors: readonly unknown[];
	readonly location?: { readonly line: number; readonly column: number };
}
export interface PublicSuiteInput {
	readonly id: string;
	readonly name: string;
	readonly fullName: string;
	readonly state: string;
	readonly errors: readonly unknown[];
}
export interface PublicModuleInput {
	readonly id: string;
	readonly moduleId: string;
	readonly state: string;
	readonly errors: readonly unknown[];
	readonly suites: readonly PublicSuiteInput[];
	readonly cases: readonly PublicCaseInput[];
}
export interface PublicHookEvent {
	readonly name: string;
	readonly entityId: string;
	readonly entityType: string;
	readonly event: "start" | "end";
}
export interface PublicRunInput {
	readonly command: CommandIdentity;
	readonly root: string;
	readonly configFile: string;
	readonly reason: string;
	readonly exitCode: number;
	readonly modules: readonly PublicModuleInput[];
	readonly unhandledErrors: readonly unknown[];
	readonly hooks?: readonly PublicHookEvent[];
	readonly filters?: readonly string[];
	readonly stderr?: string;
	readonly termination?: "natural" | "harness-watch-stop";
}
export interface RuntimeEvidence extends PublicRunInput {
	readonly reporterVersion: 1;
	readonly errors: readonly PublicErrorEvidence[];
	readonly limitations: readonly string[];
}

export function capturePublicRun(input: PublicRunInput): RuntimeEvidence {
	const errors: PublicErrorEvidence[] = [];
	for (const module of input.modules) {
		for (const error of module.errors)
			errors.push(
				errorEvidence(module.id, "module", "collection", "observed", error),
			);
		for (const suite of module.suites)
			for (const error of suite.errors)
				errors.push(ambiguousError(suite.id, "suite", error));
		for (const testCase of module.cases)
			for (const error of testCase.errors)
				errors.push(ambiguousError(testCase.id, "test", error));
	}
	for (const error of input.unhandledErrors)
		errors.push(ambiguousError("run", "run", error));
	return {
		...input,
		reporterVersion: 1,
		errors,
		limitations: errors.flatMap((error) =>
			error.limitation ? [error.limitation] : [],
		),
	};
}
function ambiguousError(
	entityId: string,
	entityType: PublicErrorEvidence["entityType"],
	payload: unknown,
): PublicErrorEvidence {
	return errorEvidence(
		entityId,
		entityType,
		"unknown",
		"blocked",
		payload,
		"Vitest public reporter payload does not establish whether this failure came from a hook or the test body",
	);
}
function errorEvidence(
	entityId: string,
	entityType: PublicErrorEvidence["entityType"],
	phase: PublicErrorEvidence["phase"],
	phaseBasis: EvidenceBasis,
	publicPayload: unknown,
	limitation?: string,
): PublicErrorEvidence {
	return {
		entityId,
		entityType,
		phase,
		phaseBasis,
		publicPayload: jsonValue(publicPayload),
		...(limitation ? { limitation } : {}),
	};
}
function jsonValue(value: unknown): unknown {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			...(value.stack ? { stack: value.stack } : {}),
			...Object.fromEntries(Object.entries(value)),
		};
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return { serializationError: String(value) };
	}
}
function serializeCase(testCase: TestCase): PublicCaseInput {
	const result = testCase.result();
	return {
		id: testCase.id,
		name: testCase.name,
		fullName: testCase.fullName,
		state: result.state,
		errors: result.state === "failed" ? result.errors : [],
		...(testCase.location ? { location: testCase.location } : {}),
	};
}
function serializeSuite(suite: TestSuite): PublicSuiteInput {
	return {
		id: suite.id,
		name: suite.name,
		fullName: suite.fullName,
		state: suite.state(),
		errors: suite.errors(),
	};
}
function serializeModule(module: TestModule): PublicModuleInput {
	return {
		id: module.id,
		moduleId: module.moduleId,
		state: module.state(),
		errors: module.errors(),
		suites: [...module.children.allSuites()].map(serializeSuite),
		cases: [...module.children.allTests()].map(serializeCase),
	};
}

export class AuditRuntimeReporter implements Reporter {
	private readonly hooks: PublicHookEvent[] = [];
	onHookStart(context: ReportedHookContext): void {
		this.hooks.push(hookEvent(context, "start"));
	}
	onHookEnd(context: ReportedHookContext): void {
		this.hooks.push(hookEvent(context, "end"));
	}
	onTestRunEnd(
		modules: readonly TestModule[],
		unhandledErrors: readonly SerializedError[],
		reason: TestRunEndReason,
	): void {
		const destination = process.env.COSMONAUTS_AUDIT_REPORT_PATH;
		const command = process.env.COSMONAUTS_AUDIT_COMMAND;
		if (!destination || !command)
			throw new Error(
				"audit reporter requires COSMONAUTS_AUDIT_REPORT_PATH and COSMONAUTS_AUDIT_COMMAND",
			);
		const evidence = capturePublicRun({
			command: JSON.parse(command) as CommandIdentity,
			root: process.env.COSMONAUTS_AUDIT_PROJECT_ROOT ?? process.cwd(),
			configFile: process.env.COSMONAUTS_AUDIT_CONFIG_FILE ?? "",
			reason,
			exitCode: Number(
				process.env.COSMONAUTS_AUDIT_EXIT_CODE ?? (reason === "passed" ? 0 : 1),
			),
			modules: modules.map(serializeModule),
			unhandledErrors,
			hooks: this.hooks,
			filters: JSON.parse(process.env.COSMONAUTS_AUDIT_FILTERS ?? "[]"),
		});
		writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`, {
			flag: "wx",
		});
	}
}
function hookEvent(
	context: ReportedHookContext,
	event: "start" | "end",
): PublicHookEvent {
	return {
		name: context.name,
		entityId: context.entity.id,
		entityType: context.entity.type,
		event,
	};
}
export default AuditRuntimeReporter;
