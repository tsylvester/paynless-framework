import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../../types_db.ts";
import { renderPrompt } from "../prompt-renderer.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import {
    DynamicContextVariables,
    ProjectContext,
    SessionContext,
    StageContext,
    RenderPromptFunctionType,
    AssemblePromptOptions,
    AssembledPrompt,
    AssembleSeedPromptDeps,
    AssemblePlannerPromptDeps,
    AssembleTurnPromptDeps,
    AssembleContinuationPromptDeps
} from "./prompt-assembler.interface.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { Messages } from "../types.ts";
import type { IPromptAssembler } from "./prompt-assembler.interface.ts";
import { gatherInputsForStage, GatherInputsForStageFn } from "./gatherInputsForStage.ts";
import { gatherContext, GatherContextFn } from "./gatherContext.ts";
import { gatherContinuationInputs, GatherContinuationInputsFn } from "./gatherContinuationInputs.ts";
import { assembleSeedPrompt } from "./assembleSeedPrompt.ts";
import { assemblePlannerPrompt } from "./assemblePlannerPrompt.ts";
import { assembleTurnPrompt } from "./assembleTurnPrompt.ts";
import { assembleContinuationPrompt } from "./assembleContinuationPrompt.ts";
import { IFileManager } from "../types/file_manager.types.ts";
import { isRecord } from "../utils/type_guards.ts";
import { RenderFn } from "./prompt-assembler.interface.ts";

export class PromptAssembler implements IPromptAssembler {
    private dbClient: SupabaseClient<Database>;
    private fileManager: IFileManager;
    private storageBucket: string;
    private renderPromptFn: RenderPromptFunctionType;
    private downloadFromStorageFn: (bucket: string, path: string) => Promise<DownloadStorageResult>;
    private assembleSeedPromptFn: (deps: AssembleSeedPromptDeps) => Promise<AssembledPrompt>;
    private assemblePlannerPromptFn: (deps: AssemblePlannerPromptDeps) => Promise<AssembledPrompt>;
    private assembleTurnPromptFn: (deps: AssembleTurnPromptDeps) => Promise<AssembledPrompt>;
    private assembleContinuationPromptFn: (deps: AssembleContinuationPromptDeps) => Promise<AssembledPrompt>;
    private gatherContextFn: GatherContextFn;
    private renderFn: RenderFn;
    private gatherInputsForStageFn: GatherInputsForStageFn;
    private gatherContinuationInputsFn: GatherContinuationInputsFn;

    constructor(
        dbClient: SupabaseClient<Database>,
        fileManager: IFileManager,
        downloadFn?: (bucket: string, path: string) => Promise<DownloadStorageResult>,
        renderPromptFn?: RenderPromptFunctionType,
        assembleSeedPromptFn?: (deps: AssembleSeedPromptDeps) => Promise<AssembledPrompt>,
        assemblePlannerPromptFn?: (deps: AssemblePlannerPromptDeps) => Promise<AssembledPrompt>,
        assembleTurnPromptFn?: (deps: AssembleTurnPromptDeps) => Promise<AssembledPrompt>,
        assembleContinuationPromptFn?: (deps: AssembleContinuationPromptDeps) => Promise<AssembledPrompt>,
        gatherContextFn?: GatherContextFn,
        renderFn?: RenderFn,
        gatherInputsForStageFn?: GatherInputsForStageFn,
        gatherContinuationInputsFn?: GatherContinuationInputsFn
    ) {
        this.dbClient = dbClient;
        this.fileManager = fileManager;
        this.renderPromptFn = renderPromptFn || renderPrompt;
        this.downloadFromStorageFn = downloadFn || ((bucket, path) => downloadFromStorage(this.dbClient, bucket, path));
        this.assembleSeedPromptFn = assembleSeedPromptFn || assembleSeedPrompt;
        this.assemblePlannerPromptFn = assemblePlannerPromptFn || assemblePlannerPrompt;
        this.assembleTurnPromptFn = assembleTurnPromptFn || assembleTurnPrompt;
        this.assembleContinuationPromptFn = assembleContinuationPromptFn || assembleContinuationPrompt;
        this.gatherContextFn = gatherContextFn || gatherContext;
        this.renderFn = renderFn || ((renderPromptFn: RenderPromptFunctionType, stage: StageContext, context: DynamicContextVariables, userProjectOverlayValues: Json | null) => renderPromptFn(stage.system_prompts!.prompt_text, context, stage.domain_specific_prompt_overlays[0]?.overlay_values, userProjectOverlayValues));
        this.gatherInputsForStageFn = gatherInputsForStageFn || ((dbClient: SupabaseClient<Database>, downloadFromStorageFn: (bucket: string, path: string) => Promise<DownloadStorageResult>, stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number) => gatherInputsForStage(dbClient, downloadFromStorageFn, stage, project, session, iterationNumber));
        this.gatherContinuationInputsFn = gatherContinuationInputsFn || gatherContinuationInputs;

        const bucketFromEnv = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
        if (!bucketFromEnv) {
            throw new Error("SB_CONTENT_STORAGE_BUCKET environment variable is not set.");
        }
        this.storageBucket = bucketFromEnv;
    }

    async assemble(options: AssemblePromptOptions): Promise<AssembledPrompt> {
        const sourceContributionId = this.resolveSourceContributionId(options);

        if (options.job) {
            if (options.continuationContent) {
                return this.assembleContinuationPrompt({
                    dbClient: this.dbClient,
                    fileManager: this.fileManager,
                    job: options.job,
                    project: options.project,
                    session: options.session,
                    stage: options.stage,
                    continuationContent: options.continuationContent,
                    gatherContext: this.gatherContextFn,
                    sourceContributionId
                });
            } 
            
            if (options.stage.recipe_step.job_type === 'PLAN') {
                return this.assemblePlannerPrompt({
                    dbClient: this.dbClient,
                    fileManager: this.fileManager,
                    job: options.job,
                    project: options.project,
                    session: options.session,
                    stage: options.stage,
                    projectInitialUserPrompt: options.projectInitialUserPrompt,
                    gatherContext: this.gatherContextFn,
                    render: this.renderFn,
                    sourceContributionId
                });
            } else {
                return this.assembleTurnPrompt({
                    dbClient: this.dbClient,
                    fileManager: this.fileManager,
                    job: options.job,
                    project: options.project,
                    session: options.session,
                    stage: options.stage,
                    gatherContext: this.gatherContextFn,
                    render: this.renderFn,
                    sourceContributionId
                });
            }
        } else {
            return this.assembleSeedPrompt({
                dbClient: this.dbClient,
                fileManager: this.fileManager,
                project: options.project,
                session: options.session,
                stage: options.stage,
                projectInitialUserPrompt: options.projectInitialUserPrompt,
                iterationNumber: options.iterationNumber,
                downloadFromStorageFn: this.downloadFromStorageFn,
                gatherInputsForStageFn: this.gatherInputsForStageFn,
                renderPromptFn: this.renderPromptFn,
                sourceContributionId
            });
        }
    }

    assembleSeedPrompt(
        deps: AssembleSeedPromptDeps
    ): Promise<AssembledPrompt> {
        return this.assembleSeedPromptFn(deps);
    }

    assemblePlannerPrompt(
        deps: AssemblePlannerPromptDeps
    ): Promise<AssembledPrompt> {
        return this.assemblePlannerPromptFn(deps);
    }

    assembleTurnPrompt(
        deps: AssembleTurnPromptDeps
    ): Promise<AssembledPrompt> {
        return this.assembleTurnPromptFn(deps);
    }

    assembleContinuationPrompt(
        deps: AssembleContinuationPromptDeps
    ): Promise<AssembledPrompt> {
        return this.assembleContinuationPromptFn(deps);
    }

    private resolveSourceContributionId(options: AssemblePromptOptions): string | null {
        const optionValue = this.normalizeContributionId(options.sourceContributionId);
        if (optionValue) {
            return optionValue;
        }

        return this.extractContributionIdFromJob(options.job);
    }

    private normalizeContributionId(value: string | null | undefined) {
        if (typeof value !== "string") {
            return null;
        }
        return value;
    }

    private extractContributionIdFromJob(job: AssemblePromptOptions["job"]): string | null {
        if (!job) {
            return null;
        }

        const directId = this.normalizeContributionId(job.target_contribution_id);
        if (directId) {
            return directId;
        }

        return this.extractContributionIdFromPayload(job.payload);
    }

    private extractContributionIdFromPayload(payload: Json | null | undefined): string | null {
        if (!isRecord(payload)) {
            return null;
        }

        const keysToCheck: ReadonlyArray<string> = [
            "sourceContributionId",
            "source_contribution_id",
            "target_contribution_id"
        ];

        for (const key of keysToCheck) {
            if (key in payload) {
                const value = payload[key];
                if (typeof value === "string") {
                    return this.normalizeContributionId(value);
                }
            }
        }

        return null;
    }

    private async _gatherContext(
        project: ProjectContext,
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number,
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
        );
    }

    private render(
        renderPromptFn: RenderPromptFunctionType,
        stage: StageContext,
        context: DynamicContextVariables,
        userProjectOverlayValues: Json | null = null
    ): string {
        return this.renderFn(
            renderPromptFn,
            stage,
            context,
            userProjectOverlayValues
        );
    }

    private async _gatherInputsForStage(stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number) {
        return this.gatherInputsForStageFn(
            this.dbClient,
            this.downloadFromStorageFn,
            stage,
            project,
            session,
            iterationNumber
        );
    }

    private async _gatherContinuationInputs(rootContributionId: string): Promise<Messages[]> {
        return this.gatherContinuationInputsFn(
            this.dbClient,
            this.downloadFromStorageFn,
            rootContributionId
        );
    }
}