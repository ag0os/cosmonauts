import { Type } from "typebox";

const ThinkingLevelLiterals = [
	Type.Literal("off"),
	Type.Literal("minimal"),
	Type.Literal("low"),
	Type.Literal("medium"),
	Type.Literal("high"),
	Type.Literal("xhigh"),
];

export function thinkingLevelSchema(description: string) {
	return Type.Optional(Type.Union(ThinkingLevelLiterals, { description }));
}
