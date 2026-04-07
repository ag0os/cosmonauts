/**
 * Session directory resolution, transcript generation, and file writing.
 *
 * Dependency rule: this module imports only from node:fs/promises, node:path,
 * and lib/sessions/types.ts. It does NOT import from lib/orchestration/.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_BASE = join("missions", "sessions");

// ============================================================================
// Directory Resolution
// ============================================================================

/**
 * Returns the absolute path to the sessions directory for a given plan.
 * Result: <projectRoot>/missions/sessions/<planSlug>
 */
export function sessionsDirForPlan(
	projectRoot: string,
	planSlug: string,
): string {
	return join(projectRoot, SESSIONS_BASE, planSlug);
}

// ============================================================================
// Transcript Generation (pure)
// ============================================================================

/** Extract plain text from a user message's content field (string or block array). */
function extractUserContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const block of content) {
			if (block && typeof block === "object" && "type" in block) {
				const b = block as { type: unknown; text?: unknown };
				if (b.type === "text" && typeof b.text === "string") {
					parts.push(b.text);
				}
			}
		}
		return parts.join("\n");
	}
	return "";
}

interface AssistantParts {
	texts: string[];
	thinkings: string[];
	toolNames: string[];
}

/** Partition an assistant message's content array into text, thinking, and tool-call names. */
function extractAssistantParts(content: unknown): AssistantParts {
	const texts: string[] = [];
	const thinkings: string[] = [];
	const toolNames: string[] = [];

	if (!Array.isArray(content)) {
		return { texts, thinkings, toolNames };
	}

	for (const block of content) {
		if (!block || typeof block !== "object" || !("type" in block)) continue;

		const b = block as {
			type: unknown;
			text?: unknown;
			thinking?: unknown;
			name?: unknown;
		};

		if (b.type === "text" && typeof b.text === "string") {
			texts.push(b.text);
		} else if (b.type === "thinking" && typeof b.thinking === "string") {
			thinkings.push(b.thinking);
		} else if (b.type === "toolCall" && typeof b.name === "string") {
			toolNames.push(b.name);
		}
	}

	return { texts, thinkings, toolNames };
}

/**
 * Generates a human-readable markdown transcript from an array of agent messages.
 * Pure function — no I/O, no side effects.
 *
 * Included in output:
 *   - User prompt messages
 *   - Assistant text content
 *   - Assistant thinking content
 *   - Tool call names (not arguments)
 *
 * Excluded from output:
 *   - Tool result messages (content is too noisy)
 *   - Tool call arguments
 *
 * Unknown or malformed message shapes are silently skipped — does not throw.
 */
export function generateTranscript(messages: unknown[], role: string): string {
	const lines: string[] = [`# Session Transcript: ${role}`, ""];

	for (const message of messages) {
		if (!message || typeof message !== "object" || !("role" in message)) {
			continue;
		}

		const msg = message as { role: unknown; content?: unknown };

		if (msg.role === "user") {
			const text = extractUserContent(msg.content);
			if (!text.trim()) continue;

			lines.push("---", "", "## User", "", text, "");
		} else if (msg.role === "assistant") {
			const { texts, thinkings, toolNames } = extractAssistantParts(
				msg.content,
			);

			if (
				texts.length === 0 &&
				thinkings.length === 0 &&
				toolNames.length === 0
			) {
				continue;
			}

			lines.push("---", "", "## Assistant", "");

			for (const thinking of thinkings) {
				lines.push("<thinking>", "", thinking, "", "</thinking>", "");
			}

			for (const text of texts) {
				lines.push(text, "");
			}

			if (toolNames.length > 0) {
				const list = toolNames.map((n) => `\`${n}\``).join(", ");
				lines.push(`**Tool calls:** ${list}`, "");
			}
		}
		// toolResult messages are intentionally skipped — content is too noisy
	}

	return lines.join("\n");
}

// ============================================================================
// File Writing
// ============================================================================

/**
 * Writes a transcript string to <sessionsDir>/<filename>, creating the
 * directory (and any parents) as needed.
 */
export async function writeTranscript(
	sessionsDir: string,
	filename: string,
	content: string,
): Promise<void> {
	await mkdir(sessionsDir, { recursive: true });
	await writeFile(join(sessionsDir, filename), content, "utf-8");
}
