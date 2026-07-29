export interface AnalysisProviderErrorProcessEvidence {
	readonly exitCode?: number;
	readonly signal?: string;
	readonly reason?: string;
	readonly stderrSummary?: string;
}

export interface AnalysisProviderErrorOptions {
	readonly capability: string;
	readonly provider: string;
	readonly failureClass: string;
	readonly process: AnalysisProviderErrorProcessEvidence;
}

function evidenceValue(value: string | number | undefined): string {
	return value === undefined ? "none" : String(value);
}

function formatAnalysisProviderError(
	options: AnalysisProviderErrorOptions,
): string {
	const process = [
		`exit=${evidenceValue(options.process.exitCode)}`,
		`signal=${evidenceValue(options.process.signal)}`,
		`reason=${evidenceValue(options.process.reason)}`,
		`stderr=${evidenceValue(options.process.stderrSummary)}`,
	].join("; ");
	return [
		"Analysis failed to run.",
		`Capability: ${options.capability}`,
		`Provider: ${options.provider}`,
		`Failure class: ${options.failureClass}`,
		`Process evidence: ${process}`,
	].join("\n");
}

export class AnalysisProviderError extends Error {
	readonly capability: string;
	readonly provider: string;
	readonly failureClass: string;
	readonly process: AnalysisProviderErrorProcessEvidence;

	constructor(options: AnalysisProviderErrorOptions) {
		super(formatAnalysisProviderError(options));
		this.name = "AnalysisProviderError";
		this.capability = options.capability;
		this.provider = options.provider;
		this.failureClass = options.failureClass;
		this.process = options.process;
	}
}
