import type { StartSessionDeps, StartSessionPayload } from "./dialectic.interface.ts";

const defaultMockStartSessionPayload: StartSessionPayload = {
    projectId: "mock-start-session-default-project",
    selectedModels: [{ id: "mock-model-1", displayName: "Mock Model One" }],
    idempotencyKey: "mock-start-session-default-idempotency",
};

export function mockStartSessionPayload(
    override?: Partial<StartSessionPayload> | null,
): StartSessionPayload {
    if (override === undefined || override === null) {
        return {
            projectId: defaultMockStartSessionPayload.projectId,
            selectedModels: defaultMockStartSessionPayload.selectedModels.map((m) => ({
                id: m.id,
                displayName: m.displayName,
            })),
            idempotencyKey: defaultMockStartSessionPayload.idempotencyKey,
        };
    }
    return {
        ...defaultMockStartSessionPayload,
        ...override,
        selectedModels: override.selectedModels !== undefined && override.selectedModels !== null
            ? override.selectedModels.map((m) => ({ id: m.id, displayName: m.displayName }))
            : defaultMockStartSessionPayload.selectedModels.map((m) => ({
                id: m.id,
                displayName: m.displayName,
            })),
    };
}

export function mockStartSessionPartialDeps(
    override?: Partial<StartSessionDeps> | null,
): Partial<StartSessionDeps> {
    if (override === undefined || override === null) {
        return {};
    }
    return { ...override };
}
