import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	type DomainBindingTargetError,
	isDomainBindingTargetError,
} from "../../domains/bindings.ts";
import { getSharedDomainBindings } from "../../interactive/domain-bindings.ts";

/** Pi loads this directory; CLI imports the mount path as an explicit runtime dependency. */
export const domainBindingsExtensionPath = dirname(
	fileURLToPath(import.meta.url),
);

const DOMAIN_BINDING_CUSTOM_TYPE = "cosmonauts.domain-binding";

interface DomainBindEntry {
	role: string;
	targetDomain: string;
	previousTargetDomain?: string;
	timestamp: number;
}

interface SessionEntry {
	type?: string;
	customType?: string;
	data?: unknown;
}

function unavailableTargetMessage(error: DomainBindingTargetError): string {
	return `${error.message} Install or activate "${error.targetDomain}" before binding "${error.role}" to it.`;
}

function parseArgs(
	args: string,
): { role: string; targetDomain: string } | undefined {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (parts.length !== 2) return undefined;
	const [role, targetDomain] = parts;
	if (!role || !targetDomain) return undefined;
	return { role, targetDomain };
}

function getArgumentCompletions(prefix: string) {
	const shared = getSharedDomainBindings();
	if (!shared) return null;
	const ids = shared.domainRegistry
		.listIds()
		.filter((id) => id !== "shared" && id.startsWith(prefix));
	return ids.length > 0 ? ids.map((id) => ({ value: id, label: id })) : null;
}

function notifyUnavailable(
	ctx: ExtensionCommandContext,
	error: DomainBindingTargetError,
): void {
	ctx.ui.notify(unavailableTargetMessage(error), "error");
}

function isDomainBindEntry(data: unknown): data is DomainBindEntry {
	if (!data || typeof data !== "object") return false;
	const candidate = data as Partial<DomainBindEntry>;
	return (
		typeof candidate.role === "string" &&
		candidate.role.trim().length > 0 &&
		typeof candidate.targetDomain === "string" &&
		candidate.targetDomain.trim().length > 0
	);
}

/** Replay only validated binding entries; a later stale target leaves the last valid one live. */
function restoreBinding(options: {
	entry: SessionEntry;
	shared: NonNullable<ReturnType<typeof getSharedDomainBindings>>;
	ctx: Pick<ExtensionCommandContext, "ui">;
}): void {
	const { entry, shared, ctx } = options;
	if (
		entry.type !== "custom" ||
		entry.customType !== DOMAIN_BINDING_CUSTOM_TYPE
	)
		return;
	if (!isDomainBindEntry(entry.data)) {
		ctx.ui.notify("Skipping malformed stale domain binding entry.", "warning");
		return;
	}
	try {
		shared.bindingResolver.bindLiveRole(
			entry.data.role,
			entry.data.targetDomain,
		);
		shared.liveBindings.set(entry.data.role, entry.data.targetDomain);
	} catch (error: unknown) {
		const message = restoreFailureMessage(error);
		ctx.ui.notify(
			`Skipping invalid stale domain binding entry for \`${entry.data.role}\`: ${message}`,
			"warning",
		);
	}
}

function restoreFailureMessage(error: unknown): string {
	if (isDomainBindingTargetError(error)) return unavailableTargetMessage(error);
	return error instanceof Error ? error.message : String(error);
}

export default function domainBindingsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		const shared = getSharedDomainBindings();
		if (!shared) return;
		const entries = ctx.sessionManager.getEntries() as SessionEntry[];
		for (const entry of entries) restoreBinding({ entry, shared, ctx });
	});

	pi.registerCommand("domain-bind", {
		description: "Bind a domain role to another active domain for this project",
		getArgumentCompletions,
		handler: async (args, ctx) => {
			const parsed = parseArgs(args);
			if (!parsed) {
				ctx.ui.notify("Usage: /domain-bind <role> <target-domain>", "error");
				return;
			}

			const shared = getSharedDomainBindings();
			if (!shared) {
				ctx.ui.notify(
					"Domain binding is not available in this session.",
					"error",
				);
				return;
			}

			const previousTargetDomain = shared.bindingResolver.resolveKnownRole(
				parsed.role,
			)?.domainId;

			try {
				shared.bindingResolver.bindLiveRole(parsed.role, parsed.targetDomain);
				shared.liveBindings.set(parsed.role, parsed.targetDomain);
			} catch (error: unknown) {
				if (isDomainBindingTargetError(error)) {
					notifyUnavailable(ctx, error);
					return;
				}
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Domain binding failed: ${message}`, "error");
				return;
			}

			const entry: DomainBindEntry = {
				role: parsed.role,
				targetDomain: parsed.targetDomain,
				...(previousTargetDomain !== undefined && { previousTargetDomain }),
				timestamp: Date.now(),
			};
			pi.appendEntry(DOMAIN_BINDING_CUSTOM_TYPE, entry);
			ctx.ui.notify(
				`Bound domain role \`${parsed.role}\` to \`${parsed.targetDomain}\`.`,
				"info",
			);
		},
	});
}
