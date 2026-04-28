import type { AgentRegistry } from "../agents/resolver.ts";

// ============================================================================
// Process-global slots via Symbol.for() to cross jiti module boundaries
// ============================================================================

const SWITCH_KEY = Symbol.for("cosmonauts:agent-switch");
const REGISTRY_KEY = Symbol.for("cosmonauts:agent-registry");

const globals = globalThis as Record<symbol, unknown>;

// ============================================================================
// Pending agent switch
// ============================================================================

interface SwitchSlot {
	agentId: string;
}

export function setPendingSwitch(agentId: string): void {
	globals[SWITCH_KEY] = { agentId } satisfies SwitchSlot;
}

export function consumePendingSwitch(): string | undefined {
	const slot = globals[SWITCH_KEY] as SwitchSlot | undefined;
	if (slot === undefined) return undefined;
	globals[SWITCH_KEY] = undefined;
	return slot.agentId;
}

export function clearPendingSwitch(): void {
	globals[SWITCH_KEY] = undefined;
}

// ============================================================================
// Shared agent registry (set by CLI, read by extensions)
// ============================================================================

interface SharedRegistrySlot {
	registry: AgentRegistry;
	domainContext: string | undefined;
}

/** Set the shared registry at CLI startup so extensions can validate agent IDs
 *  against the same registry the factory uses for resolution. */
export function setSharedRegistry(
	registry: AgentRegistry,
	domainContext: string | undefined,
): void {
	globals[REGISTRY_KEY] = {
		registry,
		domainContext,
	} satisfies SharedRegistrySlot;
}

/** Read the shared registry. Returns undefined if the CLI hasn't set it. */
export function getSharedRegistry(): SharedRegistrySlot | undefined {
	return globals[REGISTRY_KEY] as SharedRegistrySlot | undefined;
}
