export const AUTHORED_RECORD_TYPES = ["note", "profile", "playbook"] as const;
export type AuthoredRecordType = (typeof AUTHORED_RECORD_TYPES)[number];

export const PROFILE_WRITE_MAX_BYTES = 4_000;
export const PROFILE_TITLE = "User profile";
export const PROFILE_DESCRIPTION = "Durable user profile and preferences.";

const PLAYBOOK_KEY_MAX_CODE_POINTS = 80;

export function canonicalizePlaybookName(title: string): string {
	const normalized = title
		.normalize("NFKC")
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return [...normalized]
		.slice(0, PLAYBOOK_KEY_MAX_CODE_POINTS)
		.join("")
		.replace(/^-+|-+$/g, "");
}
