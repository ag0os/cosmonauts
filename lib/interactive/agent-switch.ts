const SWITCH_KEY = Symbol.for("cosmonauts:agent-switch");

interface SwitchSlot {
	agentId: string;
}

function getSlot(): SwitchSlot | undefined {
	return (globalThis as Record<symbol, unknown>)[SWITCH_KEY] as
		| SwitchSlot
		| undefined;
}

function setSlot(value: SwitchSlot | undefined): void {
	(globalThis as Record<symbol, unknown>)[SWITCH_KEY] = value;
}

export function setPendingSwitch(agentId: string): void {
	setSlot({ agentId });
}

export function consumePendingSwitch(): string | undefined {
	const slot = getSlot();
	if (slot === undefined) return undefined;
	setSlot(undefined);
	return slot.agentId;
}

export function clearPendingSwitch(): void {
	setSlot(undefined);
}
