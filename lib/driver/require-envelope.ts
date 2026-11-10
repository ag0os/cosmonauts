const DRIVE_ENVELOPE_REQUIRED_MESSAGE =
	"Drive needs an envelope. Pass --envelope <path> (CLI) or envelopePath (run_driver).";

/** Cosmonauts ships no Drive envelope; every run names its own. */
export function requireDriveEnvelope(path: string | undefined): string {
	if (path) return path;
	throw new Error(DRIVE_ENVELOPE_REQUIRED_MESSAGE);
}
