import { describe, expect, it } from "vitest";
import {
	DEFAULT_MAX_CONCURRENT_SPAWNS,
	DEFAULT_MAX_SPAWN_DEPTH,
	resolveMaxConcurrentSpawns,
	resolveMaxSpawnDepth,
} from "../../lib/orchestration/spawn-limits.ts";

describe("spawn-limits constants", () => {
	it("DEFAULT_MAX_CONCURRENT_SPAWNS is 5", () => {
		expect(DEFAULT_MAX_CONCURRENT_SPAWNS).toBe(5);
	});

	it("DEFAULT_MAX_SPAWN_DEPTH is 2", () => {
		expect(DEFAULT_MAX_SPAWN_DEPTH).toBe(2);
	});
});

describe("resolveMaxConcurrentSpawns", () => {
	it("returns default when called with no argument", () => {
		expect(resolveMaxConcurrentSpawns()).toBe(DEFAULT_MAX_CONCURRENT_SPAWNS);
	});

	it("returns a valid positive integer override", () => {
		expect(resolveMaxConcurrentSpawns(10)).toBe(10);
		expect(resolveMaxConcurrentSpawns(1)).toBe(1);
	});

	it("returns default for zero", () => {
		expect(resolveMaxConcurrentSpawns(0)).toBe(DEFAULT_MAX_CONCURRENT_SPAWNS);
	});

	it("returns default for negative values", () => {
		expect(resolveMaxConcurrentSpawns(-1)).toBe(DEFAULT_MAX_CONCURRENT_SPAWNS);
		expect(resolveMaxConcurrentSpawns(-100)).toBe(
			DEFAULT_MAX_CONCURRENT_SPAWNS,
		);
	});

	it("returns default for non-integer numbers", () => {
		expect(resolveMaxConcurrentSpawns(1.5)).toBe(DEFAULT_MAX_CONCURRENT_SPAWNS);
		expect(resolveMaxConcurrentSpawns(2.9)).toBe(DEFAULT_MAX_CONCURRENT_SPAWNS);
	});
});

describe("resolveMaxSpawnDepth", () => {
	it("returns default when called with no argument", () => {
		expect(resolveMaxSpawnDepth()).toBe(DEFAULT_MAX_SPAWN_DEPTH);
	});

	it("returns a valid positive integer override", () => {
		expect(resolveMaxSpawnDepth(5)).toBe(5);
		expect(resolveMaxSpawnDepth(1)).toBe(1);
	});

	it("returns default for zero", () => {
		expect(resolveMaxSpawnDepth(0)).toBe(DEFAULT_MAX_SPAWN_DEPTH);
	});

	it("returns default for negative values", () => {
		expect(resolveMaxSpawnDepth(-1)).toBe(DEFAULT_MAX_SPAWN_DEPTH);
		expect(resolveMaxSpawnDepth(-50)).toBe(DEFAULT_MAX_SPAWN_DEPTH);
	});

	it("returns default for non-integer numbers", () => {
		expect(resolveMaxSpawnDepth(1.5)).toBe(DEFAULT_MAX_SPAWN_DEPTH);
		expect(resolveMaxSpawnDepth(3.14)).toBe(DEFAULT_MAX_SPAWN_DEPTH);
	});
});
