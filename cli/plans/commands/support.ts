import { PlanManager } from "../../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";

export function createPlanManagers(projectRoot: string): {
	readonly planManager: PlanManager;
	readonly taskManager: TaskManager;
} {
	return {
		planManager: new PlanManager(projectRoot),
		taskManager: new TaskManager(projectRoot),
	};
}

export function failPlanCommand(options: {
	readonly message: string;
	readonly json: boolean;
	readonly consolePrefix?: string;
}): never {
	if (options.json) {
		console.log(JSON.stringify({ error: options.message }, null, 2));
	} else {
		console.error(`${options.consolePrefix ?? ""}${options.message}`);
	}
	process.exit(1);
}
