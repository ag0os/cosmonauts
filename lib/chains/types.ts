import type { ChainStep } from "../orchestration/types.ts";

export type NamedChain = {
	name: string;
	description: string;
	episodes?: boolean;
} & (
	| { chain: string; stages?: never }
	| { stages: readonly ChainStep[]; chain?: never }
);
