/**
 * Domain-role binding resolution.
 *
 * A role is a consumer-facing domain qualifier. By default it resolves to the
 * same-named domain, but project config and live session state may redirect it.
 */

import { resolve } from "node:path";
import type { DomainRegistry } from "./registry.ts";

export interface DomainBindingResolution {
	readonly role: string;
	readonly domainId: string;
	readonly source: "default" | "project" | "live";
}

export interface QualifiedAgentReference {
	readonly role: string;
	readonly agentId: string;
	readonly qualifiedId: string;
}

export interface ResolvedAgentReference {
	readonly requested: QualifiedAgentReference;
	readonly resolved: QualifiedAgentReference;
	readonly binding: DomainBindingResolution;
}

export type DomainBindingErrorCode =
	| "target-domain-missing"
	| "role-domain-missing";

export interface DomainBindingErrorDetail {
	readonly code: DomainBindingErrorCode;
	readonly role: string;
	readonly targetDomain: string;
	readonly message: string;
}

export interface LiveDomainBindingStore {
	get(role: string): string | undefined;
	set(role: string, targetDomain: string): void;
	clear(role: string): void;
	snapshot(): Readonly<Record<string, string>>;
}

export interface DomainBindingResolverOptions {
	readonly registry: DomainRegistry;
	readonly projectBindings?: Readonly<Record<string, string>>;
	readonly liveBindings?: LiveDomainBindingStore;
}

export class DomainBindingTargetError
	extends Error
	implements DomainBindingErrorDetail
{
	readonly code: DomainBindingErrorCode;
	readonly role: string;
	readonly targetDomain: string;

	constructor(
		role: string,
		targetDomain: string,
		code: DomainBindingErrorCode = "target-domain-missing",
	) {
		super(formatDomainBindingError({ role, targetDomain, code }));
		this.name = "DomainBindingTargetError";
		this.code = code;
		this.role = role;
		this.targetDomain = targetDomain;
	}
}

export class DomainBindingResolver {
	private readonly registry: DomainRegistry;
	private readonly projectBindings: Readonly<Record<string, string>>;
	private readonly liveBindings: LiveDomainBindingStore | undefined;

	constructor(options: DomainBindingResolverOptions) {
		this.registry = options.registry;
		this.projectBindings = options.projectBindings ?? {};
		this.liveBindings = options.liveBindings;
	}

	resolveRole(role: string): DomainBindingResolution {
		const liveTarget = this.liveBindings?.get(role);
		if (liveTarget !== undefined) {
			return this.validateResolution({
				role,
				domainId: liveTarget,
				source: "live",
			});
		}

		const projectTarget = this.projectBindings[role];
		if (projectTarget !== undefined) {
			return this.validateResolution({
				role,
				domainId: projectTarget,
				source: "project",
			});
		}

		return this.validateResolution({
			role,
			domainId: role,
			source: "default",
		});
	}

	resolveKnownRole(role: string): DomainBindingResolution | undefined {
		if (
			this.liveBindings?.get(role) === undefined &&
			this.projectBindings[role] === undefined &&
			!this.registry.has(role)
		) {
			return undefined;
		}

		return this.resolveRole(role);
	}

	resolveAgentReference(qualifiedId: string): ResolvedAgentReference {
		const requested = parseQualifiedAgentReference(qualifiedId);
		const binding = this.resolveRole(requested.role);
		const resolved = makeQualifiedAgentReference(
			binding.domainId,
			requested.agentId,
		);

		return { requested, resolved, binding };
	}

	bindLiveRole(role: string, targetDomain: string): DomainBindingResolution {
		if (!this.liveBindings) {
			throw new Error("Live domain bindings are not available.");
		}
		const resolution = this.validateResolution({
			role,
			domainId: targetDomain,
			source: "live",
		});
		this.liveBindings.set(role, targetDomain);
		return resolution;
	}

	validateProjectBindings(): void {
		for (const role of Object.keys(this.projectBindings)) {
			this.resolveRole(role);
		}
	}

	private validateResolution(
		resolution: DomainBindingResolution,
	): DomainBindingResolution {
		if (this.registry.has(resolution.domainId)) {
			return resolution;
		}

		throw new DomainBindingTargetError(
			resolution.role,
			resolution.domainId,
			resolution.source === "default"
				? "role-domain-missing"
				: "target-domain-missing",
		);
	}
}

export function getLiveDomainBindingStore(
	projectRoot: string,
): LiveDomainBindingStore {
	const key = resolve(projectRoot);
	const stores = getLiveStoresByProjectRoot();
	let store = stores.get(key);
	if (!store) {
		store = new MemoryLiveDomainBindingStore();
		stores.set(key, store);
	}
	return store;
}

function parseQualifiedAgentReference(
	qualifiedId: string,
): QualifiedAgentReference {
	const slashIndex = qualifiedId.indexOf("/");
	if (slashIndex <= 0 || slashIndex === qualifiedId.length - 1) {
		throw new Error(
			`Expected a qualified agent reference in the form "<domain-role>/<agent-id>", got "${qualifiedId}".`,
		);
	}

	return makeQualifiedAgentReference(
		qualifiedId.slice(0, slashIndex),
		qualifiedId.slice(slashIndex + 1),
	);
}

function makeQualifiedAgentReference(
	role: string,
	agentId: string,
): QualifiedAgentReference {
	return {
		role,
		agentId,
		qualifiedId: `${role}/${agentId}`,
	};
}

function formatDomainBindingError(options: {
	readonly role: string;
	readonly targetDomain: string;
	readonly code: DomainBindingErrorCode;
}): string {
	if (options.code === "role-domain-missing") {
		return `Domain role "${options.role}" resolves to target domain "${options.targetDomain}", but that domain is not active or installed.`;
	}

	return `Domain binding target "${options.targetDomain}" for role "${options.role}" is not active or installed.`;
}

class MemoryLiveDomainBindingStore implements LiveDomainBindingStore {
	private readonly bindings = new Map<string, string>();

	get(role: string): string | undefined {
		return this.bindings.get(role);
	}

	set(role: string, targetDomain: string): void {
		this.bindings.set(role, targetDomain);
	}

	clear(role: string): void {
		this.bindings.delete(role);
	}

	snapshot(): Readonly<Record<string, string>> {
		return Object.freeze(Object.fromEntries(this.bindings));
	}
}

const LIVE_STORES_KEY = Symbol.for("cosmonauts:live-domain-binding-stores");
const globals = globalThis as Record<symbol, unknown>;

function getLiveStoresByProjectRoot(): Map<string, LiveDomainBindingStore> {
	const existing = globals[LIVE_STORES_KEY];
	if (existing instanceof Map) {
		return existing as Map<string, LiveDomainBindingStore>;
	}

	const stores = new Map<string, LiveDomainBindingStore>();
	globals[LIVE_STORES_KEY] = stores;
	return stores;
}
