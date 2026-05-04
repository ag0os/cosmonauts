import type { WorkflowDefinition } from "../../lib/workflows/types.ts";

/** Main domain does not define static workflows; Cosmo delegates dynamically. */
export const workflows: WorkflowDefinition[] = [];

export default workflows;
