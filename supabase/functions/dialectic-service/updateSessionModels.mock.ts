import type { UpdateSessionModelsPayload, SelectedModels } from "./dialectic.interface.ts";

const defaultUpdateSessionModelsPayload: UpdateSessionModelsPayload = {
    sessionId: "mock-update-session-models-default-session",
    selectedModels: [{ id: "mock-model-1", displayName: "Mock Model One" }],
};

export function mockUpdateSessionModelsPayload(
    override?: Partial<UpdateSessionModelsPayload> | null,
): UpdateSessionModelsPayload {
    if (override === undefined || override === null) {
        return {
            sessionId: defaultUpdateSessionModelsPayload.sessionId,
            selectedModels: defaultUpdateSessionModelsPayload.selectedModels.map((m) => ({
                id: m.id,
                displayName: m.displayName,
            })),
        };
    }
    return {
        ...defaultUpdateSessionModelsPayload,
        ...override,
        selectedModels: override.selectedModels !== undefined && override.selectedModels !== null
            ? override.selectedModels.map((m) => ({ id: m.id, displayName: m.displayName }))
            : defaultUpdateSessionModelsPayload.selectedModels.map((m) => ({
                id: m.id,
                displayName: m.displayName,
            })),
    };
}

export function mockUpdateSessionModelsUserId(override?: string | null): string {
    if (override === undefined || override === null) {
        return "mock-update-session-models-default-user";
    }
    return override;
}

export function mockUpdateSessionModelsSelectedModels(
    override?: Partial<{ ids: string[] }> | null,
): SelectedModels[] {
    const defaultIds: string[] = ["mock-model-1"];
    if (override === undefined || override === null) {
        return defaultIds.map((id) => ({ id, displayName: id }));
    }
    const ids: string[] = override.ids !== undefined && override.ids !== null
        ? override.ids
        : defaultIds;
    return ids.map((id) => ({ id, displayName: id }));
}
