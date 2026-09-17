import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	mkdir,
	open,
	readFile,
	rename,
	unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { AUDIT_VOCABULARY, type TestSurface } from "./schema.ts";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._-]+$/;
export interface EpochManifest {
	readonly schemaVersion: 1;
	readonly methodVersion: string;
	readonly epochId: string;
	readonly evaluatedRevision: string;
	readonly createdAt: string;
	readonly materialInputs: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
	readonly commandDefinitions: readonly {
		readonly id: string;
		readonly surface: TestSurface;
		readonly argv: readonly string[];
		readonly cwd?: string;
		readonly configFile?: string;
		readonly filters?: readonly string[];
	}[];
	readonly sourceCensusDigest: string;
}
export interface AuditIndex {
	readonly currentEpochId: string;
	readonly epochIds: readonly string[];
}

export async function openAuditEpoch(
	root: string,
	input: EpochManifest,
): Promise<void> {
	validateManifest(input);
	await ensureReadableDirectory(root);
	let prior: AuditIndex | undefined;
	try {
		prior = await readAuditIndex(root);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
	if (prior?.epochIds.includes(input.epochId))
		throw new Error(
			`epoch ${input.epochId} already exists and manifests are immutable`,
		);
	const manifestPath = join(root, "epochs", input.epochId, "manifest.json");
	await mkdir(join(root, "epochs"), { recursive: true });
	await mkdir(dirname(manifestPath), { recursive: false });
	const handle = await open(manifestPath, "wx");
	try {
		await handle.writeFile(`${JSON.stringify(input, null, 2)}\n`);
	} finally {
		await handle.close();
	}
	await writeIndexAtomic(root, {
		currentEpochId: input.epochId,
		epochIds: [...(prior?.epochIds ?? []), input.epochId],
	});
}
export async function readAuditIndex(root: string): Promise<AuditIndex> {
	await ensureReadableDirectory(root);
	const parsed = JSON.parse(
		await readFile(join(root, "index.json"), "utf8"),
	) as unknown;
	return validateIndex(parsed);
}
export async function readCurrentEpochManifest(
	root: string,
): Promise<EpochManifest> {
	const index = await readAuditIndex(root);
	const parsed = JSON.parse(
		await readFile(
			join(root, "epochs", index.currentEpochId, "manifest.json"),
			"utf8",
		),
	) as unknown;
	return validateManifest(parsed);
}
async function writeIndexAtomic(
	root: string,
	index: AuditIndex,
): Promise<void> {
	const temporary = join(root, `.index.json.${randomUUID()}.tmp`);
	try {
		const handle = await open(temporary, "wx");
		try {
			await handle.writeFile(`${JSON.stringify(index, null, 2)}\n`);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await rename(temporary, join(root, "index.json"));
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
}
async function ensureReadableDirectory(root: string): Promise<void> {
	await access(root, constants.R_OK | constants.W_OK);
}
function validateManifest(input: unknown): EpochManifest {
	if (
		!isRecord(input) ||
		input.schemaVersion !== 1 ||
		!nonEmpty(input.methodVersion) ||
		!nonEmpty(input.epochId) ||
		!SAFE_ID.test(input.epochId) ||
		!nonEmpty(input.evaluatedRevision) ||
		!nonEmpty(input.createdAt) ||
		!SHA256.test(String(input.sourceCensusDigest)) ||
		!Array.isArray(input.materialInputs) ||
		!Array.isArray(input.commandDefinitions)
	)
		throw new Error("invalid epoch manifest");
	for (const item of input.materialInputs)
		if (
			!isRecord(item) ||
			!nonEmpty(item.path) ||
			!SHA256.test(String(item.sha256))
		)
			throw new Error("invalid epoch manifest material input");
	for (const command of input.commandDefinitions)
		if (
			!isRecord(command) ||
			!nonEmpty(command.id) ||
			!SAFE_ID.test(command.id) ||
			!AUDIT_VOCABULARY.testSurfaces.includes(command.surface as TestSurface) ||
			!Array.isArray(command.argv) ||
			command.argv.length === 0 ||
			!command.argv.every(nonEmpty)
		)
			throw new Error("invalid epoch manifest command definition");
	if (
		new Set(
			input.commandDefinitions.map((command) =>
				isRecord(command) ? command.id : undefined,
			),
		).size !== input.commandDefinitions.length
	)
		throw new Error("invalid epoch manifest duplicate command id");
	return input as unknown as EpochManifest;
}
function validateIndex(input: unknown): AuditIndex {
	if (
		!isRecord(input) ||
		!nonEmpty(input.currentEpochId) ||
		!SAFE_ID.test(input.currentEpochId) ||
		!Array.isArray(input.epochIds) ||
		!input.epochIds.every(nonEmpty) ||
		!input.epochIds.every((epochId) => SAFE_ID.test(epochId)) ||
		input.epochIds.at(-1) !== input.currentEpochId ||
		new Set(input.epochIds).size !== input.epochIds.length
	)
		throw new Error("invalid audit index");
	return input as unknown as AuditIndex;
}
function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null && !Array.isArray(input);
}
function nonEmpty(input: unknown): input is string {
	return typeof input === "string" && input.length > 0;
}
function isMissing(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}
