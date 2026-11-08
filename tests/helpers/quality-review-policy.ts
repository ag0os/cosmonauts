import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { SessionPolicy } from "../../lib/agents/session-policy.ts";
import { getQualityReviewSession } from "../../lib/orchestration/quality-review-context.ts";

export function reviewContextForPolicy(policy: SessionPolicy | undefined) {
	const sessionId = crypto.randomUUID();
	policy?.onCreated?.({ sessionId } as AgentSession);
	const context = getQualityReviewSession(sessionId);
	policy?.onDisposed?.(sessionId);
	return context;
}
