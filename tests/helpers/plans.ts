import type { PlanManager } from "../../lib/plans/plan-manager.ts";
import type { Plan, PlanCreateInput } from "../../lib/plans/plan-types.ts";

let planFixtureNumber = 1;

export async function createPlanFixture(
	manager: PlanManager,
	overrides: Partial<PlanCreateInput> = {},
): Promise<Plan> {
	const fixtureNumber = planFixtureNumber;
	planFixtureNumber += 1;

	return manager.createPlan({
		slug: `fixture-plan-${fixtureNumber}`,
		title: `Fixture Plan ${fixtureNumber}`,
		...overrides,
	});
}
