import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json } from "../types_db.ts";
import { renderPrompt } from "./prompt-renderer.ts";
import { parseInputArtifactRules } from "./utils/input-artifact-parser.ts";
import { downloadFromStorage } from "./supabase_storage_utils.ts";
import { DialecticContributionRow, InputArtifactRules, ArtifactSourceRule } from '../dialectic-service/dialectic.interface.ts';
import { DynamicContextVariables, ProjectContext, SessionContext, StageContext, RenderPromptFunctionType } from "./prompt-assembler.interface.ts";
import type { DownloadStorageResult } from "./supabase_storage_utils.ts";
import { hasProcessingStrategy, isDialecticChunkMetadata } from "./utils/type_guards.ts";
import { RAGError } from "./utils/errors.ts";
import { join } from "jsr:@std/path/join";

export type ContributionOverride = Partial<DialecticContributionRow> & {
    content: string;
};

export class PromptAssembler {
    private dbClient: SupabaseClient<Database>;
    private storageBucket: string;
    private renderPromptFn: RenderPromptFunctionType;
    private downloadFromStorageFn: (bucket: string, path: string) => Promise<DownloadStorageResult>;

    constructor(
        dbClient: SupabaseClient<Database>, 
        downloadFn?: (bucket: string, path: string) => Promise<DownloadStorageResult>,
        renderPromptFn?: RenderPromptFunctionType
    ) {
        this.dbClient = dbClient;
        this.renderPromptFn = renderPromptFn || renderPrompt;
        this.downloadFromStorageFn = downloadFn || ((bucket, path) => downloadFromStorage(this.dbClient, bucket, path));

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
        iterationNumber: number
    ): Promise<string> {
        const context = await this.gatherContext(project, session, stage, projectInitialUserPrompt, iterationNumber);
        return this.render(stage, context, project.user_domain_overlay_values);
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
                priorStageContributions += `#### Contribution from ${contrib.model_name || 'AI Model'}\n${contrib.content}\n\n`;
            }
        } else {
            const isRagStage = stage.slug === 'synthesis' || stage.slug === 'parenthesis' || stage.slug === 'paralysis';

            if (isRagStage) {
                try {
                    priorStageContributions = await this._gatherContextWithRAG(session, stage);
                } catch (ragError) {
                    const errorMessage = ragError instanceof Error ? ragError.message : String(ragError);
                    console.error(`[PromptAssembler.gatherContext] RAG process failed: ${errorMessage}`, { error: ragError });
                    throw new RAGError(`Failed to gather context via RAG: ${errorMessage}`);
                }
            } else {
                try {
                    const inputs = await this.gatherInputsForStage(stage, project, session, iterationNumber);
                    priorStageContributions = inputs.priorStageContributions;
                    priorStageFeedback = inputs.priorStageFeedback;
                } catch (inputError) {
                    console.error(
                        `[PromptAssembler.gatherContext] Error during input gathering: ${ (inputError instanceof Error) ? inputError.message : String(inputError) }`, 
                        { error: inputError, stageSlug: stage.slug, projectId: project.id, sessionId: session.id }
                    );
                    throw new Error(`Failed to gather inputs for prompt assembly: ${(inputError instanceof Error) ? inputError.message : String(inputError)}`);
                }
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

    public async gatherInputsForStage(stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number): Promise<{ priorStageContributions: string; priorStageFeedback: string }> {
        let priorStageContributions = "";
        let priorStageFeedback = "";
        let criticalError: Error | null = null; // Variable to hold a critical error

        if (!stage.input_artifact_rules) {
            console.info("[PromptAssembler._gatherInputsForStage] No input_artifact_rules defined for stage:", stage.slug);
            return { priorStageContributions, priorStageFeedback };
        }

        let parsedRules: InputArtifactRules;
        try {
            parsedRules = parseInputArtifactRules(stage.input_artifact_rules);
        } catch (e) {
            console.error("[PromptAssembler._gatherInputsForStage] Failed to parse input_artifact_rules for stage:", stage.slug, e);
            return { priorStageContributions, priorStageFeedback };
        }

        if (!parsedRules || parsedRules.sources.length === 0) {
            console.info("[PromptAssembler._gatherInputsForStage] Parsed rules are empty for stage:", stage.slug);
            return { priorStageContributions, priorStageFeedback };
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
            console.warn('[PromptAssembler._gatherInputsForStage] Could not fetch display names for some stages.', { error: stagesError });
        }
        const displayNameMap = new Map(
            stagesData?.map((s) => [s.slug, s.display_name]) || [],
        );

        for (const rule of parsedRules.sources) {
            if (criticalError) break; // If a critical error occurred in a previous rule, stop processing

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

                    console.log(
                        `[PromptAssembler DBG] Contribution query results for rule stage '${rule.stage_slug}'`,
                        {
                            sessionId: session.id,
                            iterationNumber: iterationNumber,
                            stageSlugFromRule: rule.stage_slug,
                            resultsCount: aiContributions?.length ?? 0,
                            results: aiContributions,
                        }
                    );

                    if (aiContribError) {
                        console.error(
                            `[PromptAssembler._gatherInputsForStage] Failed to retrieve AI contributions. Stage: '${displayName}' (slug: ${rule.stage_slug}). Error: ${aiContribError.message}`,
                            { error: aiContribError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                        );
                        if (rule.required !== false) {
                            criticalError = new Error(`Failed to retrieve REQUIRED AI contributions for stage '${displayName}'.`);
                            break; // Break from the 'for (const rule of parsedRules.sources)' loop
                        }
                        continue; // Skip this rule if optional and DB error, adds nothing to output
                    }
                    
                    if ((!aiContributions || aiContributions.length === 0) && rule.required !== false) {
                        criticalError = new Error(`Required contributions for stage '${displayName}' were not found.`);
                        break; // Break from the 'for (const rule of parsedRules.sources)' loop
                    }

                    const typedAiContributions: DialecticContributionRow[] = aiContributions;
                    let currentRuleContributionsContent = ""; // Accumulates content for *this specific rule's* contributions

                    if (typedAiContributions && typedAiContributions.length > 0) {
                        for (const contrib of typedAiContributions) {
                            if (criticalError) break; // If a critical error occurred, stop processing contributions

                            if (contrib.storage_path && contrib.storage_bucket) {
                                const pathToDownload = join(contrib.storage_path, contrib.file_name || '');

                                const { data: content, error: downloadError } =
                                    await this.downloadFromStorageFn(
                                        contrib.storage_bucket,
                                        pathToDownload,
                                    );
                                    if (content && !downloadError) {
                                        /*console.log(
                                            `[PromptAssembler DBG] Downloaded content for contribution ${contrib.id}`,
                                            { content, downloadError, pathToDownload, contrib }
                                        );*/
                                         const decoder = new TextDecoder('utf-8');
                                         const decodedContent = decoder.decode(content);
                                         currentRuleContributionsContent += // Append to rule-specific content
                                             `#### Contribution from ${contrib.model_name || 'AI Model'}\n` +
                                             `${decodedContent}\n\n`;
                                             /*console.log(
                                                `[PromptAssembler DBG] Current rule contributions content:`,
                                                { currentRuleContributionsContent }
                                             );*/
                                    } else {
                                        console.error(
                                            `[PromptAssembler._gatherInputsForStage] Failed to download contribution file. Path: ${pathToDownload}`,
                                            { path: pathToDownload, error: downloadError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                                        );
                                        if (rule.required !== false) {
                                            criticalError = new Error(`Failed to download REQUIRED content for contribution ${contrib.id} from stage '${displayName}'. Original error: ${downloadError ? downloadError.message : 'Unknown download error'}`);
                                            break; // Break from the 'for (const contrib of typedAiContributions)' loop
                                        }
                                        // Optional failed download for an item, item contributes nothing to currentRuleContributionsContent
                                    }
                            } else {
                                 console.warn(`[PromptAssembler._gatherInputsForStage] Contribution ${contrib.id} is missing storage_path or storage_bucket.`);
                                 if (rule.required !== false) {
                                    criticalError = new Error(`REQUIRED Contribution ${contrib.id} from stage '${displayName}' is missing storage details.`);
                                    break; // Break from the 'for (const contrib of typedAiContributions)' loop
                                 }
                                 // Optional item missing storage details, item contributes nothing to currentRuleContributionsContent
                            }
                        }
                    }
                    
                    // Only add header and content if there was any actual content for this rule
                    if (currentRuleContributionsContent.length > 0) {
                        const blockHeader = rule.section_header
                            ? `${rule.section_header}

`
                            : `### Contributions from ${displayName} Stage

`;
                        priorStageContributions += blockHeader + currentRuleContributionsContent;
                        console.log(
                            `[PromptAssembler DBG] Prior stage contributions content:`,
                            { priorStageContributions }
                        );
                    }
                    // After processing all contributions for THIS rule, if a critical error occurred, break outer loop.
                    if (criticalError) break;

                } else if (rule.type === 'feedback') {
                    const targetIteration = iterationNumber > 1 ? iterationNumber - 1 : 1;
                    const { data: feedbackRecord, error: feedbackError } = await this.dbClient
                        .from('dialectic_feedback')
                        .select('storage_bucket, storage_path, file_name')
                        .eq('session_id', session.id)
                        .eq('stage_slug', rule.stage_slug)
                        .eq('iteration_number', targetIteration)
                        .eq('user_id', project.user_id)
                        .limit(1)
                        .single();

                    if (feedbackError || !feedbackRecord) {
                        console.error(
                            `[PromptAssembler._gatherInputsForStage] Could not find feedback record for stage '${rule.stage_slug}'.`,
                            { error: feedbackError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                        );
                        if (rule.required !== false) {
                            criticalError = new Error(`Required feedback for stage '${displayName}' was not found.`);
                            break;
                        }
                        continue; // Skip optional feedback if not found
                    }
                    
                    const feedbackPath = join(feedbackRecord.storage_path, feedbackRecord.file_name);
                    
                    const { data: feedbackContent, error: feedbackDownloadError } = await this.downloadFromStorageFn(feedbackRecord.storage_bucket, feedbackPath);

                    if (feedbackContent && !feedbackDownloadError) {
                        const content = new TextDecoder().decode(feedbackContent);
                        if (rule.section_header) {
                            priorStageFeedback += `${rule.section_header}
---

${content}

---
`;
                        } else {
                            priorStageFeedback += `---
### User Feedback on Previous Stage: ${displayName}
---

${content}

---
`;
                        }
                    } else {
                        console.error(
                            `[PromptAssembler._gatherInputsForStage] Failed to download feedback file. Path: ${feedbackPath}`,
                            { error: feedbackDownloadError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                        );

                        if (rule.required !== false) { // Defaults to true if 'required' is not explicitly false
                            criticalError = new Error(`Failed to download REQUIRED feedback for stage '${displayName}' (slug: ${rule.stage_slug}). Original error: ${feedbackDownloadError ? feedbackDownloadError.message : 'No data returned from storage download.'}`);
                            break; // Break from the 'for (const rule of parsedRules.sources)' loop
                        }
                    }
                }
            } else if (rule.type === 'initial_project_prompt') {
                // Currently, initial_project_prompt type rules are not used to gather prior *stage* content.
                // They are used elsewhere to get the initial_user_prompt for the overall assembly.
                // console.info("[PromptAssembler._gatherInputsForStage] Skipping 'initial_project_prompt' rule in prior stage content gathering loop:", rule);
            }
        }

        if (criticalError) {
            throw criticalError;
        }

        return { priorStageContributions, priorStageFeedback };
    }


    private async _gatherContextWithRAG(session: SessionContext, stage: StageContext): Promise<string> {
        console.log(`[PromptAssembler._gatherContextWithRAG] Starting RAG process for stage: ${stage.slug}`);
        
        // Step 1: Generate multiple queries
        const queries = [
            `Synthesize the provided context into a unified document for the ${stage.display_name} stage.`,
            `Identify unique, novel, or high-risk architectural proposals related to the ${stage.display_name} stage.`,
            `Find conflicting or contradictory recommendations for the ${stage.display_name} stage.`
        ];

                const allChunks = new Map<string, { content: string, similarity: number, metadata: Json }>();

        // Step 2: Retrieve chunks for each query
        for (const query of queries) {
            const query_embedding_array = Array(1536).fill(Math.random() * 0.05);
            const query_embedding = `[${query_embedding_array.join(',')}]`;

            const { data: chunks, error } = await this.dbClient.rpc('match_dialectic_chunks', {
                query_embedding,
                match_threshold: 0.7, // Example threshold
                match_count: 10,       // Example count
                session_id_filter: session.id
            });

            if (error) {
                console.error(`[PromptAssembler._gatherContextWithRAG] RPC call failed for query "${query}"`, { error });
                continue; // Continue to next query even if one fails
            }

            if (chunks) {
                chunks.forEach(chunk => {
                    if (!allChunks.has(chunk.id)) {
                        allChunks.set(chunk.id, { content: chunk.content, similarity: chunk.similarity, metadata: chunk.metadata });
                    }
                });
            }
        }
        
        if (allChunks.size === 0) {
            console.warn(`[PromptAssembler._gatherContextWithRAG] No relevant chunks found for stage ${stage.slug}.`);
            return "No relevant context was found for this stage.";
        }

        // Step 3: Re-rank for diversity (placeholder)
        // A real MMR implementation would be more complex. This is a simplified stand-in.
        const rankedChunks = Array.from(allChunks.values()).sort((a, b) => b.similarity - a.similarity);
        
        // For now, we'll just take the top N unique chunks based on similarity.
        const finalContextChunks = rankedChunks.slice(0, 15); // Take top 15 chunks overall

        // Step 4: Assemble the final context string
        let retrievedContext = "--- Retrieved Context ---\n\n";
        finalContextChunks.forEach((chunk, index) => {
            const sourceId = isDialecticChunkMetadata(chunk.metadata) ? chunk.metadata.source_contribution_id : 'Unknown';
            retrievedContext += `[Context Snippet ${index + 1} | Source: ${ sourceId }]\n`;
            retrievedContext += `${chunk.content}\n\n`;
        });
        retrievedContext += "--- End of Retrieved Context ---\n";

        console.log(`[PromptAssembler._gatherContextWithRAG] Assembled RAG context with ${finalContextChunks.length} chunks.`);
        return retrievedContext;
    }}