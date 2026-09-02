import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, posix } from "node:path";
import matter from "gray-matter";
import { createDurableMachineFiles } from "./durable-files.ts";
import {
	readSafeRegularText,
	writeSafeExclusiveText,
} from "./proposal-files.ts";
import type {
	ConsolidationEvidenceRef,
	ConsolidationObservation,
	ConsolidationProposalStore,
	ConsolidationProposalView,
	JudgedProposal,
} from "./types.ts";

const PROPOSAL_ROOT = "memory/agent/proposals/living-memory";

export function createConsolidationProposalStore(options: {
	readonly projectRoot: string;
	readonly durableFiles?: ReturnType<typeof createDurableMachineFiles>;
}): ConsolidationProposalStore {
	const durableFiles = options.durableFiles ?? createDurableMachineFiles();
	return {
		async readEvidence() {
			return readProposalEvidence(options.projectRoot);
		},
		async persist(input) {
			validateProposalInput(input.observation, input.proposal);
			const key = validateKey(input.batchKey);
			const relativePath = `${PROPOSAL_ROOT}/${proposalFileName({
				proposalKind: input.proposal.proposalKind,
				observation: input.observation,
				key,
			})}`;
			const rendered = renderConsolidationProposal({
				key,
				observation: input.observation,
				proposal: input.proposal,
			});
			const contentDigest = sha256(rendered);
			if (input.dryRun) {
				return view({
					proposalKind: input.proposal.proposalKind,
					key,
					inputs: input.observation.inputs,
					contentDigest,
					status: "preview",
				});
			}

			const existing = await readSafeRegularText({
				root: options.projectRoot,
				relativePath,
				label: "Living-memory proposal",
			});
			if (existing !== undefined) {
				if (existing !== rendered) {
					throw new Error(
						`Living-memory proposal identity conflict at ${relativePath}.`,
					);
				}
				return view({
					proposalKind: input.proposal.proposalKind,
					key,
					path: absolutePath(options.projectRoot, relativePath),
					inputs: input.observation.inputs,
					contentDigest,
					status: "existing",
				});
			}
			const written = await writeSafeExclusiveText({
				root: options.projectRoot,
				relativePath,
				content: rendered,
				durableFiles,
				label: "Living-memory proposal",
				...(input.signal === undefined ? {} : { signal: input.signal }),
			});
			return view({
				proposalKind: input.proposal.proposalKind,
				key,
				path: written.path,
				inputs: input.observation.inputs,
				contentDigest,
				status: "written",
			});
		},
	};
}

async function readProposalEvidence(
	projectRoot: string,
): Promise<readonly ConsolidationEvidenceRef[]> {
	const directory = absolutePath(projectRoot, PROPOSAL_ROOT);
	let entries: Dirent[];
	try {
		const metadata = await lstat(directory);
		if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
			throw new Error(
				`Living-memory proposal root is not a regular directory: ${directory}.`,
			);
		}
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return Object.freeze([]);
		throw error;
	}

	const evidence: ConsolidationEvidenceRef[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith(".") || !entry.name.endsWith(".md")) continue;
		if (entry.isSymbolicLink() || !entry.isFile()) {
			throw new Error(
				`Living-memory proposal occupant is not a regular file: ${entry.name}.`,
			);
		}
		const relativePath = `${PROPOSAL_ROOT}/${entry.name}`;
		const raw = await readSafeRegularText({
			root: projectRoot,
			relativePath,
			label: "Living-memory proposal",
		});
		if (raw === undefined) {
			throw new Error(`Living-memory proposal disappeared: ${relativePath}.`);
		}
		const data = matter(raw).data;
		if (
			data.kind !== "living-memory-proposal" ||
			data.schemaVersion !== 1 ||
			!Array.isArray(data.inputs)
		) {
			throw new Error(`Living-memory proposal is malformed: ${relativePath}.`);
		}
		for (const input of data.inputs) {
			if (!isEvidenceRef(input)) {
				throw new Error(
					`Living-memory proposal has invalid evidence: ${relativePath}.`,
				);
			}
			evidence.push(Object.freeze({ ...input }));
		}
	}
	return Object.freeze(evidence);
}

export function renderConsolidationProposal(options: {
	readonly key: string;
	readonly observation: ConsolidationObservation;
	readonly proposal: JudgedProposal;
}): string {
	const body = proposalBody(options.proposal);
	return matter.stringify(body, {
		kind: "living-memory-proposal",
		schemaVersion: 1,
		proposalKind: options.proposal.proposalKind,
		status: "open",
		key: options.key,
		observation: {
			id: options.observation.id,
			kind: options.observation.kind,
			reason: options.observation.reason,
		},
		inputs: options.observation.inputs.map((input) => ({ ...input })),
	});
}

function proposalBody(proposal: JudgedProposal): string {
	switch (proposal.proposalKind) {
		case "create":
			return recordBody("Proposed record", proposal.record);
		case "merge":
			return recordBody("Proposed replacement", proposal.replacement);
		case "retire":
			return `# Proposed retirement\n\nReason: ${proposal.reason}\n`;
		case "improve":
			return [
				"# Proposed improvement",
				"",
				"| Observed problem | What happened | Suggested improvement | Why it helps |",
				"|---|---|---|---|",
				`| ${tableCell(proposal.observedProblem)} | ${tableCell(proposal.whatHappened)} | ${tableCell(proposal.suggestedImprovement)} | ${tableCell(proposal.whyItHelps)} |`,
				"",
			].join("\n");
	}
}

function recordBody(
	heading: string,
	record: Extract<JudgedProposal, { proposalKind: "create" }>["record"],
): string {
	return [
		`# ${heading}`,
		"",
		"```json",
		JSON.stringify(record, null, 2),
		"```",
		"",
	].join("\n");
}

function proposalFileName(options: {
	readonly proposalKind: JudgedProposal["proposalKind"];
	readonly observation: ConsolidationObservation;
	readonly key: string;
}): string {
	const trailing = /(?:^|[-_])(\d+)$/u.exec(options.observation.id)?.[1];
	const slot = trailing
		? trailing.padStart(3, "0")
		: createHash("sha256")
				.update(options.observation.id)
				.digest("hex")
				.slice(0, 6);
	return `${options.proposalKind}-${slot}-${options.key}.md`;
}

function validateProposalInput(
	observation: ConsolidationObservation,
	proposal: JudgedProposal,
): void {
	if (observation.inputs.length === 0) {
		throw new Error("Living-memory proposals require evidence inputs.");
	}
	if (proposal.proposalKind === "merge" && observation.inputs.length < 1) {
		throw new Error(
			"Living-memory merge proposals require replacement inputs.",
		);
	}
}

function isEvidenceRef(value: unknown): value is ConsolidationEvidenceRef {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	const keys = Object.keys(candidate).sort();
	if (
		keys.join("\0") !== ["digest", "id", "path", "scope", "sourceId"].join("\0")
	) {
		return false;
	}
	return (
		typeof candidate.id === "string" &&
		candidate.id.length > 0 &&
		typeof candidate.sourceId === "string" &&
		candidate.sourceId.length > 0 &&
		(candidate.scope === "project" || candidate.scope === "user") &&
		typeof candidate.path === "string" &&
		isSafeRelativePath(candidate.path) &&
		typeof candidate.digest === "string" &&
		/^[a-f0-9]{64}$/u.test(candidate.digest)
	);
}

function isSafeRelativePath(value: string): boolean {
	return (
		value.length > 0 &&
		!value.includes("\\") &&
		!value.includes("\0") &&
		!isAbsolute(value) &&
		posix.normalize(value) === value &&
		!value
			.split("/")
			.some((segment) => !segment || segment === "." || segment === "..")
	);
}

function validateKey(value: string): string {
	if (!/^[a-f0-9]{64}$/u.test(value)) {
		throw new Error("Living-memory proposal keys must be SHA-256 digests.");
	}
	return value;
}

function view(options: {
	readonly proposalKind: JudgedProposal["proposalKind"];
	readonly key: string;
	readonly path?: string;
	readonly inputs: readonly ConsolidationEvidenceRef[];
	readonly contentDigest: string;
	readonly status: ConsolidationProposalView["status"];
}): ConsolidationProposalView {
	return Object.freeze({
		proposalKind: options.proposalKind,
		key: options.key,
		...(options.path === undefined ? {} : { path: options.path }),
		inputs: Object.freeze(
			options.inputs.map((input) => Object.freeze({ ...input })),
		),
		contentDigest: options.contentDigest,
		status: options.status,
	});
}

function absolutePath(root: string, relativePath: string): string {
	return `${root.replace(/\/$/u, "")}/${relativePath}`;
}

function tableCell(value: string): string {
	return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, "<br>");
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
