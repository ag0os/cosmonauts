import type { DomainResolver } from "./resolver.ts";

export const FRAMEWORK_DEFAULT_DOMAIN = "main";

export interface ResolveDefaultDomainOptions {
	/** Already-known domain from an agent definition, project config, or caller. */
	readonly explicitDomain?: string;
	/** Resolver whose registry can prove whether the framework default is installed. */
	readonly resolver?: DomainResolver;
	/** Human-readable operation included in no-default-domain diagnostics. */
	readonly purpose?: string;
}

export class NoDefaultDomainError extends Error {
	readonly code = "no-default-domain";
	readonly domain: string;

	constructor(domain: string, purpose = "default-domain resolution") {
		super(
			`[no-default-domain] No default domain "${domain}" is installed; ${purpose} requires an explicit domain. Install or activate the "${domain}" domain, or set an explicit domain.`,
		);
		this.name = "NoDefaultDomainError";
		this.domain = domain;
	}
}

/**
 * Resolve the framework fallback domain for domainless definitions.
 *
 * Resolver-backed paths can prove whether `main` is installed, so absence is
 * an actionable configuration error. Resolver-less paths cannot distinguish a
 * missing default from a simple file fixture, so they return the framework
 * default and let resource lookup produce path-specific diagnostics.
 */
export function resolveDefaultDomain(
	options: ResolveDefaultDomainOptions = {},
): string {
	const explicitDomain = options.explicitDomain?.trim();
	if (explicitDomain) return explicitDomain;

	if (
		options.resolver &&
		!options.resolver.registry.has(FRAMEWORK_DEFAULT_DOMAIN)
	) {
		throw new NoDefaultDomainError(FRAMEWORK_DEFAULT_DOMAIN, options.purpose);
	}

	return FRAMEWORK_DEFAULT_DOMAIN;
}
