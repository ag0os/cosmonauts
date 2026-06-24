import type {
	DomainBindingResolver,
	LiveDomainBindingStore,
} from "../domains/bindings.ts";
import type { DomainRegistry } from "../domains/registry.ts";

const DOMAIN_BINDING_KEY = Symbol.for("cosmonauts:domain-bindings");

const globals = globalThis as Record<symbol, unknown>;

export interface SharedDomainBindingsSlot {
	readonly domainRegistry: DomainRegistry;
	readonly bindingResolver: DomainBindingResolver;
	readonly liveBindings: LiveDomainBindingStore;
}

export function setSharedDomainBindings(slot: SharedDomainBindingsSlot): void {
	globals[DOMAIN_BINDING_KEY] = slot;
}

export function getSharedDomainBindings():
	| SharedDomainBindingsSlot
	| undefined {
	return globals[DOMAIN_BINDING_KEY] as SharedDomainBindingsSlot | undefined;
}

export function clearSharedDomainBindings(): void {
	globals[DOMAIN_BINDING_KEY] = undefined;
}
