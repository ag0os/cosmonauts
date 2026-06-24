import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { DomainBindingTargetError } from "../../../../lib/domains/bindings.ts";
import { getSharedDomainBindings } from "../../../../lib/interactive/domain-bindings.ts";

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

export default function domainBindingsExtension(pi: ExtensionAPI): void {
	// fallow-ignore-next-line complexity
	pi.on("session_start", async (_event, ctx) => {
		const shared = getSharedDomainBindings();
		if (!shared) return;

		const entries = ctx.sessionManager.getEntries() as SessionEntry[];
		const latestValidByRole = new Map<string, DomainBindEntry>();

		for (const entry of entries) {
			if (
				entry.type !== "custom" ||
				entry.customType !== DOMAIN_BINDING_CUSTOM_TYPE
			) {
				continue;
			}

			if (!isDomainBindEntry(entry.data)) {
				ctx.ui.notify(
					"Skipping malformed stale domain binding entry.",
					"warning",
				);
				continue;
			}

			try {
				shared.bindingResolver.bindLiveRole(
					entry.data.role,
					entry.data.targetDomain,
				);
				latestValidByRole.set(entry.data.role, entry.data);
			} catch (error: unknown) {
				const message =
					error instanceof DomainBindingTargetError
						? unavailableTargetMessage(error)
						: error instanceof Error
							? error.message
							: String(error);
				ctx.ui.notify(
					`Skipping invalid stale domain binding entry for \`${entry.data.role}\`: ${message}`,
					"warning",
				);
			}
		}

		for (const [role, entry] of latestValidByRole) {
			shared.liveBindings.set(role, entry.targetDomain);
		}
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
			} catch (error: unknown) {
				if (error instanceof DomainBindingTargetError) {
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
