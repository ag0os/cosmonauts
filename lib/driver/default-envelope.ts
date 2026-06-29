import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH = join(
	"lib",
	"prompts",
	"framework",
	"drive",
	"envelope.md",
);

interface ResolveDefaultDriveEnvelopePathOptions {
	frameworkRoot?: string;
}

export function resolveDefaultDriveEnvelopePath(
	options: ResolveDefaultDriveEnvelopePathOptions = {},
): string {
	const frameworkRoot = options.frameworkRoot ?? resolveFrameworkRoot();
	const envelopePath = join(
		frameworkRoot,
		DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
	);
	if (existsSync(envelopePath)) {
		return envelopePath;
	}

	throw new Error(
		`Missing default Drive envelope at ${envelopePath}. Pass --envelope <path> to provide an explicit envelope.`,
	);
}

function resolveFrameworkRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
