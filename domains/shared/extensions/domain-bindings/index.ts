import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { DomainBindingTargetError } from "../../../../lib/domains/bindings.ts";
import { getSharedDomainBindings } from "../../../../lib/interactive/domain-bindings.ts";

interface DomainBindEntry {
	role: string;
	targetDomain: string;
	previousTargetDomain?: string;
	timestamp: number;
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

export default function domainBindingsExtension(pi: ExtensionAPI): void {
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
			pi.appendEntry("domain-binding", entry);
			ctx.ui.notify(
				`Bound domain role \`${parsed.role}\` to \`${parsed.targetDomain}\`.`,
				"info",
			);
		},
	});
}
