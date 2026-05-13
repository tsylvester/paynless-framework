import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.43.4";
import type { Database } from "../types_db.ts";
import type { IFileManager } from "../_shared/types/file_manager.types.ts";

export type MockCloneProjectArgs = {
    supabaseClient: SupabaseClient<Database>;
    userClient: SupabaseClient<Database>;
    fileManager: IFileManager;
    originalProjectId: string;
    newProjectName: string | undefined;
    cloningUserId: string;
};

const defaultOriginalProjectId = "orig-project-uuid";
const defaultNewProjectName: string | undefined = undefined;
const defaultCloningUserId = "user-uuid-cloner";

type MockCloneProjectParamOverrides = {
    originalProjectId?: string | null;
    newProjectName?: string | null;
    cloningUserId?: string | null;
};

export function mockCloneProject(
    override: Pick<MockCloneProjectArgs, "supabaseClient" | "userClient" | "fileManager"> & MockCloneProjectParamOverrides,
): MockCloneProjectArgs {
    const newProjectName: string | undefined = override.newProjectName === null
        ? undefined
        : (override.newProjectName !== undefined ? override.newProjectName : defaultNewProjectName);
    const originalProjectId: string = override.originalProjectId !== undefined && override.originalProjectId !== null
        ? override.originalProjectId
        : defaultOriginalProjectId;
    const cloningUserId: string = override.cloningUserId !== undefined && override.cloningUserId !== null
        ? override.cloningUserId
        : defaultCloningUserId;
    return {
        supabaseClient: override.supabaseClient,
        userClient: override.userClient,
        fileManager: override.fileManager,
        originalProjectId,
        newProjectName,
        cloningUserId,
    };
}
