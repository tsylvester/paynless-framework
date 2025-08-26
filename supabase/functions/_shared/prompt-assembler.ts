import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../types_db.ts";
import { renderPrompt } from "./prompt-renderer.ts";
import { parseInputArtifactRules } from "./utils/input-artifact-parser.ts";
import { downloadFromStorage } from "./supabase_storage_utils.ts";
import { DialecticContributionRow, InputArtifactRules, ArtifactSourceRule } from '../dialectic-service/dialectic.interface.ts';
import { DynamicContextVariables, ProjectContext, SessionContext, StageContext, RenderPromptFunctionType, ContributionOverride, AssemblerSourceDocument } from "./prompt-assembler.interface.ts";
import type { DownloadStorageResult } from "./supabase_storage_utils.ts";
import { hasProcessingStrategy } from "./utils/type_guards.ts";
import { join } from "jsr:@std/path/join";
import { AiModelExtendedConfig, Messages } from "./types.ts";
import { countTokens } from "./utils/tokenizer_utils.ts";
import type { CountTokensDeps, CountableChatPayload } from "./types/tokenizer.types.ts";
import type { IPromptAssembler } from "./prompt-assembler.interface.ts";
import { DocumentRelationships } from "./types/file_manager.types.ts";
import { isKeyOf } from "./utils/type_guards.ts";

export class PromptAssembler implements IPromptAssembler {
    private dbClient: SupabaseClient<Database>;
    private storageBucket: string;
    private renderPromptFn: RenderPromptFunctionType;
    private downloadFromStorageFn: (bucket: string, path: string) => Promise<DownloadStorageResult>;

    private countTokensFn: (deps: CountTokensDeps, payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number;

    constructor(
        dbClient: SupabaseClient<Database>,
        downloadFn?: (bucket: string, path: string) => Promise<DownloadStorageResult>,
        renderPromptFn?: RenderPromptFunctionType,
        countTokensFn?: (deps: CountTokensDeps, payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number
    ) {
        this.dbClient = dbClient;
        this.renderPromptFn = renderPromptFn || renderPrompt;
        this.downloadFromStorageFn = downloadFn || ((bucket, path) => downloadFromStorage(this.dbClient, bucket, path));
        this.countTokensFn = countTokensFn || countTokens;

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
        const context = await this.gatherContext(
            project, 
            session, 
            stage, 
            projectInitialUserPrompt, 
            iterationNumber, 
            undefined
        );
        const renderedPrompt = this.render(stage, context, project.user_domain_overlay_values);

        if (continuationContent) {
            return `${renderedPrompt} ${continuationContent}`;
        }

        return renderedPrompt;
    }

    async gatherContext(
        project: ProjectContext,
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number,
        overrideContributions?: ContributionOverride[]
    ): Promise<DynamicContextVariables> {
        let priorStageContributions = "";
        let priorStageFeedback = "";

        if (overrideContributions) {
            for (const contrib of overrideContributions) {
                priorStageContributions += `#### Contribution from AI Model\n${contrib.content}\n\n`;
            }
        } else {
            try {
                const sourceDocuments = await this.gatherInputsForStage(stage, project, session, iterationNumber);

                // If under limit, format the documents normally
                for (const doc of sourceDocuments) {
                    if (doc.type === 'contribution') {
                        const blockHeader = doc.metadata.header
                            ? `${doc.metadata.header}\n\n`
                            : `### Contributions from ${doc.metadata.displayName} Stage\n\n`;
                        priorStageContributions += blockHeader;
                        priorStageContributions += `#### Contribution from ${doc.metadata.modelName || 'AI Model'}\n${doc.content}\n\n`;
                    } else if (doc.type === 'feedback') {
                        const blockHeader = doc.metadata.header
                            ? `${doc.metadata.header}\n---\n\n`
                            : `### User Feedback on Previous Stage: ${doc.metadata.displayName}\n---\n\n`;
                        priorStageFeedback += `${blockHeader}${doc.content}\n\n---\n`;
                    }
                }

            } catch (inputError) {
                console.error(
                    `[PromptAssembler.gatherContext] Error during input gathering: ${ (inputError instanceof Error) ? inputError.message : String(inputError) }`, 
                    { error: inputError, stageSlug: stage.slug, projectId: project.id, sessionId: session.id }
                );
                throw new Error(`Failed to gather inputs for prompt assembly: ${(inputError instanceof Error) ? inputError.message : String(inputError)}`);
            }
        }

        const dynamicContextVariables: DynamicContextVariables = {
            user_objective: project.project_name,
            domain: project.dialectic_domains.name,
            agent_count: session.selected_model_ids?.length ?? 1,
            context_description: projectInitialUserPrompt,
            original_user_request: hasProcessingStrategy(stage) ? projectInitialUserPrompt : null,
            prior_stage_ai_outputs: priorStageContributions,
            prior_stage_user_feedback: priorStageFeedback,
            deployment_context: null,
            reference_documents: null,
            constraint_boundaries: null,
            stakeholder_considerations: null,
            deliverable_format: 'Standard markdown format.'
        };

        return dynamicContextVariables;
    }

    render(
        stage: StageContext,
        context: DynamicContextVariables,
        userProjectOverlayValues: Json | null = null
    ): string {
        const systemDefaultOverlayValues = stage.domain_specific_prompt_overlays[0]?.overlay_values ?? null;
        const basePromptText: string | undefined | null = stage.system_prompts?.prompt_text;

        if (!basePromptText) {
            throw new Error(`No system prompt template found for stage ${stage.id}`);
        }

        try {
            return this.renderPromptFn(
                basePromptText,
                context,
                systemDefaultOverlayValues,
                userProjectOverlayValues
            );
        } catch (renderingError) {
            console.error(
                `[PromptAssembler.render] Error during prompt rendering: ${ (renderingError instanceof Error) ? renderingError.message : String(renderingError) }`,
                { error: renderingError }
            );
            throw new Error(`Failed to render prompt: ${(renderingError instanceof Error) ? renderingError.message : 'Unknown rendering error'}`);
        }
    }

    public async gatherInputsForStage(stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number): Promise<AssemblerSourceDocument[]> {
        const sourceDocuments: AssemblerSourceDocument[] = [];
        let criticalError: Error | null = null; 

        if (!stage.input_artifact_rules) {
            console.info("[PromptAssembler.gatherInputsForStage] No input_artifact_rules defined for stage:", stage.slug);
            return sourceDocuments;
        }

        let parsedRules: InputArtifactRules;
        try {
            parsedRules = parseInputArtifactRules(stage.input_artifact_rules);
        } catch (e) {
            console.error("[PromptAssembler.gatherInputsForStage] Failed to parse input_artifact_rules for stage:", stage.slug, e);
            return sourceDocuments;
        }

        if (!parsedRules || parsedRules.sources.length === 0) {
            console.info("[PromptAssembler.gatherInputsForStage] Parsed rules are empty for stage:", stage.slug);
            return sourceDocuments;
        }

        const stageSpecificRules = parsedRules.sources.filter(
            (rule): rule is Extract<ArtifactSourceRule, { type: 'contribution' | 'feedback' }> =>
                rule.type === 'contribution' || rule.type === 'feedback'
        );

        const stageSlugsForDisplayName = stageSpecificRules
            .map((rule) => rule.stage_slug)
            .filter(
                (slug, index, self) => self.indexOf(slug) === index
            );

        const { data: stagesData, error: stagesError } = await this.dbClient
            .from('dialectic_stages')
            .select('slug, display_name')
            .in('slug', stageSlugsForDisplayName.length > 0 ? stageSlugsForDisplayName : ['dummy-non-matching-slug']);

        if (stagesError) {
            console.warn('[PromptAssembler.gatherInputsForStage] Could not fetch display names for some stages.', { error: stagesError });
        }
        const displayNameMap = new Map(
            stagesData?.map((s) => [s.slug, s.display_name]) || [],
        );

        for (const rule of parsedRules.sources) {
            if (criticalError) break;

            if (rule.type === 'contribution' || rule.type === 'feedback') {
                const displayName = displayNameMap.get(rule.stage_slug) ||
                    (rule.stage_slug.charAt(0).toUpperCase() + rule.stage_slug.slice(1));

                if (rule.type === 'contribution') {
                    const { data: aiContributions, error: aiContribError } = await this.dbClient
                        .from('dialectic_contributions')
                        .select('*')
                        .eq('session_id', session.id)
                        .eq('iteration_number', iterationNumber)
                        .eq('stage', rule.stage_slug)
                        .eq('is_latest_edit', true);

                    if (aiContribError) {
                        console.error(
                            `[PromptAssembler.gatherInputsForStage] Failed to retrieve AI contributions.`, { error: aiContribError, rule, projectId: project.id }
                        );
                        if (rule.required !== false) {
                            criticalError = new Error(`Failed to retrieve REQUIRED AI contributions for stage '${displayName}'.`);
                            break;
                        }
                        continue;
                    }
                    
                    if ((!aiContributions || aiContributions.length === 0) && rule.required !== false) {
                        criticalError = new Error(`Required contributions for stage '${displayName}' were not found.`);
                        break;
                    }

                    const typedAiContributions: DialecticContributionRow[] = aiContributions || [];
                    for (const contrib of typedAiContributions) {
                        if (criticalError) break;

                        if (contrib.storage_path && contrib.storage_bucket) {
                            const pathToDownload = join(contrib.storage_path, contrib.file_name || '');
                            const { data: content, error: downloadError } =
                                await this.downloadFromStorageFn(contrib.storage_bucket, pathToDownload);

                            if (content && !downloadError) {
                                const decodedContent = new TextDecoder('utf-8').decode(content);
                                sourceDocuments.push({
                                    id: contrib.id,
                                    type: 'contribution',
                                    content: decodedContent,
                                    metadata: {
                                        displayName: displayName,
                                        modelName: contrib.model_name || 'AI Model',
                                        header: rule.section_header
                                    }
                                });
                            } else {
                                console.error(`[PromptAssembler.gatherInputsForStage] Failed to download contribution file.`, { path: pathToDownload, error: downloadError });
                                if (rule.required !== false) {
                                    criticalError = new Error(`Failed to download REQUIRED content for contribution ${contrib.id} from stage '${displayName}'.`);
                                    break;
                                }
                            }
                        } else {
                            console.warn(`[PromptAssembler.gatherInputsForStage] Contribution ${contrib.id} is missing storage details.`);
                            if (rule.required !== false) {
                                criticalError = new Error(`REQUIRED Contribution ${contrib.id} from stage '${displayName}' is missing storage details.`);
                                break;
                            }
                        }
                    }
                    if (criticalError) break;

                } else if (rule.type === 'feedback') {
                    const targetIteration = iterationNumber > 1 ? iterationNumber - 1 : 1;
                    const { data: feedbackRecord, error: feedbackError } = await this.dbClient
                        .from('dialectic_feedback')
                        .select('id, storage_bucket, storage_path, file_name')
                        .eq('session_id', session.id)
                        .eq('stage_slug', rule.stage_slug)
                        .eq('iteration_number', targetIteration)
                        .eq('user_id', project.user_id)
                        .limit(1)
                        .single();

                    if (feedbackError || !feedbackRecord) {
                        if (rule.required !== false) {
                            criticalError = new Error(`Required feedback for stage '${displayName}' was not found.`);
                            break;
                        }
                        continue;
                    }
                    
                    const feedbackPath = join(feedbackRecord.storage_path, feedbackRecord.file_name);
                    const { data: feedbackContent, error: feedbackDownloadError } = await this.downloadFromStorageFn(feedbackRecord.storage_bucket, feedbackPath);

                    if (feedbackContent && !feedbackDownloadError) {
                        const content = new TextDecoder().decode(feedbackContent);
                        sourceDocuments.push({
                            id: feedbackRecord.id,
                            type: 'feedback',
                            content: content,
                            metadata: {
                                displayName: displayName,
                                header: rule.section_header
                            }
                        });
                    } else {
                        if (rule.required !== false) {
                            criticalError = new Error(`Failed to download REQUIRED feedback for stage '${displayName}'.`);
                            break;
                        }
                    }
                }
            }
        }

        if (criticalError) {
            throw criticalError;
        }

        return sourceDocuments;
    }

    public async gatherContinuationInputs(rootContributionId: string): Promise<Messages[]> {
        // 1. Fetch the root chunk to get the stage slug and other base info.
        const { data: rootChunk, error: rootChunkError } = await this.dbClient
            .from('dialectic_contributions')
            .select('*')
            .eq('id', rootContributionId)
            .single();

        if (rootChunkError || !rootChunk) {
            console.error(`[PromptAssembler.gatherContinuationInputs] Failed to retrieve root contribution.`, { error: rootChunkError, rootContributionId });
            throw new Error(`Failed to retrieve root contribution for id ${rootContributionId}.`);
        }

        // 2. Dynamically determine the stage slug from the document_relationships.
        if (!rootChunk.document_relationships || typeof rootChunk.document_relationships !== 'object' || Array.isArray(rootChunk.document_relationships)) {
            throw new Error(`Root contribution ${rootContributionId} has invalid document_relationships.`);
        }
        const relationships: DocumentRelationships = rootChunk.document_relationships;
        const stageSlugKey = Object.keys(relationships).find(key => key !== 'isContinuation' && key !== 'turnIndex');

        if (!stageSlugKey || !isKeyOf(relationships, stageSlugKey)) {
            throw new Error(`Could not determine stage slug from root contribution ${rootContributionId}.`);
        }
        
        // The type guard has confirmed stageSlugKey is a keyof DocumentRelationships
        const stageSlug = stageSlugKey;

        if (relationships[stageSlug] !== rootContributionId) {
            throw new Error(`Could not determine stage slug from root contribution ${rootContributionId}.`);
        }

        // 3. Use a .contains query to find all related chunks.
        const queryMatcher = { [stageSlug]: rootContributionId };
        const { data: allChunks, error: chunksError } = await this.dbClient
            .from('dialectic_contributions')
            .select('*')
            .contains('document_relationships', queryMatcher)
            .order('continuation_number', { ascending: true, nullsFirst: true });

        if (chunksError) {
            console.error(`[PromptAssembler.gatherContinuationInputs] Failed to retrieve contribution chunks.`, { error: chunksError, rootContributionId });
            throw new Error(`Failed to retrieve contribution chunks for root ${rootContributionId}.`);
        }
        
        if (!allChunks || allChunks.length === 0) {
            // This should be impossible since we already found the root chunk.
            throw new Error(`No contribution chunks found for root ${rootContributionId}.`);
        }

        if (!rootChunk.storage_path) {
            throw new Error(`Root contribution ${rootChunk.id} is missing a storage_path.`);
        }
        
        // 4. Download seed prompt.
        const seedPromptPath = join(rootChunk.storage_path, 'seed_prompt.md');
        const { data: seedPromptContentData, error: seedDownloadError } = await this.downloadFromStorageFn(this.storageBucket, seedPromptPath);

        if (seedDownloadError || !seedPromptContentData) {
            console.error(`[PromptAssembler.gatherContinuationInputs] Failed to download seed prompt.`, { path: seedPromptPath, error: seedDownloadError });
            throw new Error(`Failed to download seed prompt for root ${rootContributionId}.`);
        }
        const seedPromptContent = new TextDecoder().decode(seedPromptContentData);

        // 5. Download and create atomic messages for all chunks.
        const assistantMessages: Messages[] = [];
        for (const chunk of allChunks) {
            if (chunk.storage_path && chunk.file_name && chunk.storage_bucket) {
                const chunkPath = join(chunk.storage_path, chunk.file_name);
                const { data: chunkContentData, error: chunkDownloadError } = await this.downloadFromStorageFn(chunk.storage_bucket, chunkPath);

                if (chunkDownloadError || !chunkContentData) {
                    console.error(`[PromptAssembler.gatherContinuationInputs] Failed to download chunk content.`, { path: chunkPath, error: chunkDownloadError });
                    throw new Error(`Failed to download content for chunk ${chunk.id}.`);
                }
                const chunkContent = new TextDecoder().decode(chunkContentData);
                assistantMessages.push({
                    role: 'assistant',
                    content: chunkContent,
                    id: chunk.id,
                });
            }
        }
        
        // 6. Return formatted messages.
        return [
            { role: 'user', content: seedPromptContent },
            ...assistantMessages,
            { role: 'user', content: 'Please continue.' }
        ];
    }
}