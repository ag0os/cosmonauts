import type { DomainResolver } from "./resolver.ts";
import type { LoadedDomain } from "./types.ts";

export interface ResolveDefaultDomainOptions {
	/** Already-known resource domain from the declaration or caller. */
	readonly explicitDomain?: string;
	/** Explicit fallback for directory-only callers. */
	readonly defaultDomain?: string;
	readonly resolver?: DomainResolver;
	readonly purpose?: string;
}

export class NoDefaultDomainError extends Error {
	constructor(purpose = "default-domain resolution") {
		super(
			`[no-default-domain] No default domain is declared; ${purpose} requires an explicit domain or a declared default.`,
		);
		this.name = "NoDefaultDomainError";
	}
}

export class AmbiguousDefaultDomainError extends Error {
	constructor(readonly domains: readonly string[]) {
		super(
			`Multiple default domains are declared: ${domains.join(", ")}. Declare at most one active default domain.`,
		);
		this.name = "AmbiguousDefaultDomainError";
	}
}

/** Selection uses declared traits, never a preferred domain spelling. */
export function selectDefaultDomain(
	domains: readonly LoadedDomain[],
): LoadedDomain | undefined {
	const defaults = domains.filter((domain) => domain.manifest.default);
	if (defaults.length > 1)
		throw new AmbiguousDefaultDomainError(
			defaults.map((domain) => domain.manifest.id),
		);
	return defaults[0];
}

export function resolveDefaultDomain(
	options: ResolveDefaultDomainOptions = {},
): string {
	const explicitDomain = options.explicitDomain?.trim();
	if (explicitDomain) return explicitDomain;
	const selected = options.resolver
		? selectDefaultDomain(options.resolver.registry.listAll())?.manifest.id
		: options.defaultDomain?.trim();
	if (!selected) throw new NoDefaultDomainError(options.purpose);
	return selected;
}
