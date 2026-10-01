import type { NamedChain } from "../../lib/chains/types.ts";

/**
 * Named chains for the lean domain: none. Builds go through the `lean_build`
 * tool so host verification and the review loop always run (ruling W3-OD-1),
 * and reviews of an existing change go through `lean_review`, because a chain
 * stage would get only the lead's prompt and the read-only reviewer could not
 * see the diff. Any future stage uses a qualified id so it never collides
 * with coding's roles.
 */
export const chains: NamedChain[] = [];

export default chains;
