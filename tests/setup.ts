/**
 * Global test setup for Vitest.
 *
 * Centralizes lifecycle cleanup so individual test files do not need to
 * remember to restore mocks or timers. Runs automatically via the
 * `setupFiles` entry in vitest.config.ts.
 */

import { afterEach, vi } from "vitest";

afterEach(() => {
	// Restore all mocked implementations and spies to originals.
	// Safe to call even when no mocks are active.
	vi.restoreAllMocks();

	// If fake timers were installed during a test, revert to real timers
	// so subsequent tests are not affected.
	vi.useRealTimers();
});
