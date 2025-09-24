import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../../types_db.ts";
import { renderPrompt } from "../prompt-renderer.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { DynamicContextVariables, ProjectContext, SessionContext, StageContext, RenderPromptFunctionType, ContributionOverride, AssemblerSourceDocument } from "./prompt-assembler.interface.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { Messages } from "../types.ts";
import type { IPromptAssembler } from "./prompt-assembler.interface.ts";
import { gatherInputsForStage, GatherInputsForStageFn } from "./gatherInputsForStage.ts";
import { gatherContext, GatherContextFn } from "./gatherContext.ts";
import { render, RenderFn } from "./render.ts";
import { gatherContinuationInputs, GatherContinuationInputsFn } from "./gatherContinuationInputs.ts";
import { assemble, AssembleFn } from "./assemble.ts";

export class PromptAssembler implements IPromptAssembler {
    private dbClient: SupabaseClient<Database>;
    private storageBucket: string;
    private renderPromptFn: RenderPromptFunctionType;
    private downloadFromStorageFn: (bucket: string, path: string) => Promise<DownloadStorageResult>;
    private assembleFn: AssembleFn;
    private gatherContextFn: GatherContextFn;
    private renderFn: RenderFn;
    private gatherInputsForStageFn: GatherInputsForStageFn;
    private gatherContinuationInputsFn: GatherContinuationInputsFn;

    constructor(
        dbClient: SupabaseClient<Database>,
        downloadFn?: (bucket: string, path: string) => Promise<DownloadStorageResult>,
        renderPromptFn?: RenderPromptFunctionType,
        assembleFn?: AssembleFn,
        gatherContextFn?: GatherContextFn,
        renderFn?: RenderFn,
        gatherInputsForStageFn?: GatherInputsForStageFn,
        gatherContinuationInputsFn?: GatherContinuationInputsFn
    ) {
        this.dbClient = dbClient;
        this.renderPromptFn = renderPromptFn || renderPrompt;
        this.downloadFromStorageFn = downloadFn || ((bucket, path) => downloadFromStorage(this.dbClient, bucket, path));
        this.assembleFn = assembleFn || assemble;
        this.gatherContextFn = gatherContextFn || gatherContext;
        this.renderFn = renderFn || render;
        this.gatherInputsForStageFn = gatherInputsForStageFn || gatherInputsForStage;
        this.gatherContinuationInputsFn = gatherContinuationInputsFn || gatherContinuationInputs;

        const bucketFromEnv = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
        if (!bucketFromEnv) {
            throw new Error("SB_CONTENT_STORAGE_BUCKET environment variable is not set.");
        }
        this.storageBucket = bucketFromEnv;
    }

    async assemble(
        project: ProjectContext, 
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number,
        continuationContent?: string
    ): Promise<string> {
        return this.assembleFn(
            this.dbClient,
            this.downloadFromStorageFn,
            this.gatherInputsForStageFn,
            this.renderPromptFn,
            project,
            session,
            stage,
            projectInitialUserPrompt,
            iterationNumber,
            continuationContent
        );
    }

    async gatherContext(
        project: ProjectContext,
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number,
        overrideContributions?: ContributionOverride[]
    ): Promise<DynamicContextVariables> {
        return this.gatherContextFn(
            this.dbClient,
            this.downloadFromStorageFn,
            this.gatherInputsForStageFn,
            project,
            session,
            stage,
            projectInitialUserPrompt,
            iterationNumber,
            overrideContributions
        );
    }

    render(
        stage: StageContext,
        context: DynamicContextVariables,
        userProjectOverlayValues: Json | null = null
    ): string {
        return this.renderFn(
            this.renderPromptFn,
            stage,
            context,
            userProjectOverlayValues
        );
    }

    public async gatherInputsForStage(stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number): Promise<AssemblerSourceDocument[]> {
        return this.gatherInputsForStageFn(
            this.dbClient,
            this.downloadFromStorageFn,
            stage,
            project,
            session,
            iterationNumber
        );
    }

    public async gatherContinuationInputs(rootContributionId: string): Promise<Messages[]> {
        return this.gatherContinuationInputsFn(
            this.dbClient,
            this.downloadFromStorageFn,
            rootContributionId
        );
    }
}