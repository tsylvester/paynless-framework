import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Tables } from "../types_db.ts";
import { renderPrompt } from "./prompt-renderer.ts";
import { FileManagerService } from "./services/file_manager.ts";
import { parseInputArtifactRules } from "./utils/input-artifact-parser.ts";
import { downloadFromStorage } from "./supabase_storage_utils.ts";
import { DialecticContribution, InputArtifactRules, ArtifactSourceRule } from '../dialectic-service/dialectic.interface.ts';

export type ProjectContext = Tables<'dialectic_projects'> & {
    dialectic_domains: Pick<Tables<'dialectic_domains'>, 'name'>,
    user_domain_overlay_values?: Tables<'domain_specific_prompt_overlays'>['overlay_values']
};

export type SessionContext = Tables<'dialectic_sessions'>;

export type StageContext = Tables<'dialectic_stages'> & {
    system_prompts: Pick<Tables<'system_prompts'>, 'prompt_text'> | null,
    domain_specific_prompt_overlays: Pick<Tables<'domain_specific_prompt_overlays'>, 'overlay_values'>[]
};

// Define the signature for the renderPrompt function
type RenderPromptFunctionType = (
    basePromptText: string,
    dynamicContextVariables: Record<string, unknown>,
    systemDefaultOverlayValues?: Tables<'domain_specific_prompt_overlays'>['overlay_values'] | null,
    userProjectOverlayValues?: Tables<'domain_specific_prompt_overlays'>['overlay_values'] | null
) => string;

export class PromptAssembler {
    private dbClient: SupabaseClient<Database>;
    private storageBucket: string;
    private renderPromptFn: RenderPromptFunctionType;

    constructor(
        dbClient: SupabaseClient<Database>, 
        renderPromptFn?: RenderPromptFunctionType
    ) {
        this.dbClient = dbClient;
        this.renderPromptFn = renderPromptFn || renderPrompt; // Default to imported if not provided

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
        let priorStageContributions: string;
        let priorStageFeedback: string;

        try {
            // 1. Gather inputs from prior stages if applicable
            const inputs = await this._gatherInputsForStage(stage, project, session, iterationNumber);
            priorStageContributions = inputs.priorStageContributions;
            priorStageFeedback = inputs.priorStageFeedback;
        } catch (inputError) {
            console.error(
                `[PromptAssembler.assemble] Error during input gathering: ${ (inputError instanceof Error) ? inputError.message : String(inputError) }`, 
                { error: inputError, stageSlug: stage.slug, projectId: project.id, sessionId: session.id }
            );
            // Re-throw the error to be caught by the calling function (submitStageResponses.ts)
            throw new Error(`Failed to gather inputs for prompt assembly: ${(inputError instanceof Error) ? inputError.message : String(inputError)}`);
        }

        // 2. Assemble Dynamic Context Variables
        const dynamicContextVariables: Record<string, unknown> = {};

        dynamicContextVariables.user_objective = project.project_name;
        dynamicContextVariables.domain = project.dialectic_domains.name;
        dynamicContextVariables.agent_count = session.selected_model_catalog_ids?.length ?? 1;
        dynamicContextVariables.initial_project_context = projectInitialUserPrompt;
        
        dynamicContextVariables.prior_stage_ai_outputs = priorStageContributions;
        dynamicContextVariables.prior_stage_user_feedback = priorStageFeedback;

        // Placeholders for optional values. In a future step, these could be read from user inputs.
        dynamicContextVariables.deployment_context = 'Not provided.';
        dynamicContextVariables.reference_documents = 'Not provided.';
        dynamicContextVariables.constraint_boundaries = 'Not provided.';
        dynamicContextVariables.stakeholder_considerations = 'Not provided.';
        dynamicContextVariables.deliverable_format = 'Standard markdown format.'; // System default
        
        // 3. Get Overlay values
        const systemDefaultOverlayValues = stage.domain_specific_prompt_overlays[0]?.overlay_values ?? null;
        
        const userProjectOverlayValues = project.user_domain_overlay_values ?? null;

        // 4. Get Base Prompt Text
        const basePromptText: string | undefined | null = stage.system_prompts?.prompt_text;
        if (!basePromptText) {
            throw new Error(`No system prompt template found for stage ${stage.id}`);
        }

        // 5. Render the prompt
        try {
            const renderedPrompt = this.renderPromptFn(
                basePromptText,
                dynamicContextVariables,
                systemDefaultOverlayValues,
                userProjectOverlayValues
            );
            return renderedPrompt;
        } catch (renderingError) {
            console.error(
                `[PromptAssembler.assemble] Error during prompt rendering: ${ (renderingError instanceof Error) ? renderingError.message : String(renderingError) }`,
                { error: renderingError }
            );
            throw new Error(`Failed to render prompt: ${(renderingError instanceof Error) ? renderingError.message : 'Unknown rendering error'}`);
        }
    }

    private async _gatherInputsForStage(stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number): Promise<{ priorStageContributions: string; priorStageFeedback: string }> {
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
                        .select('id, storage_path, file_name, storage_bucket, model_name')
                        .eq('session_id', session.id)
                        .eq('iteration_number', iterationNumber)
                        .eq('stage', rule.stage_slug)
                        .eq('is_latest_edit', true);

                    if (aiContribError) {
                        console.error(
                            `[PromptAssembler._gatherInputsForStage] Failed to retrieve AI contributions. Stage: '${displayName}' (slug: ${rule.stage_slug}). Error: ${aiContribError.message}`,
                            { error: aiContribError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                        );
                        if (rule.required !== false) {
                            criticalError = new Error(`Failed to retrieve REQUIRED AI contributions for stage '${displayName}'.`);
                            console.log(`[PromptAssembler._gatherInputsForStage] criticalError SET (AI contributions): ${criticalError?.message}`); // DIAGNOSTIC LOG 1a
                            break; // Break from the 'for (const rule of parsedRules.sources)' loop
                        }
                        continue; // Skip this rule if optional and DB error, adds nothing to output
                    }
                    
                    const typedAiContributions = aiContributions as DialecticContribution[] | null;
                    let currentRuleContributionsContent = ""; // Accumulates content for *this specific rule's* contributions

                    if (typedAiContributions && typedAiContributions.length > 0) {
                        for (const contrib of typedAiContributions) {
                            if (criticalError) break; // If a critical error occurred, stop processing contributions

                            if (contrib.storage_path && contrib.storage_bucket) {
                                let pathToDownload = contrib.storage_path;
                                if (contrib.file_name && !contrib.storage_path.endsWith('/')) {
                                    pathToDownload = contrib.storage_path + '/' + contrib.file_name;
                                } else if (contrib.file_name) {
                                    pathToDownload = contrib.storage_path + contrib.file_name;
                                }

                                const { data: content, error: downloadError } =
                                    await downloadFromStorage(
                                        this.dbClient,
                                        contrib.storage_bucket,
                                        pathToDownload,
                                    );
                                    if (content && !downloadError) {
                                        currentRuleContributionsContent += // Append to rule-specific content
                                            `#### Contribution from ${contrib.model_name || 'AI Model'}

${new TextDecoder().decode(content)}

---
`;
                                    } else {
                                        console.error(
                                            `[PromptAssembler._gatherInputsForStage] Failed to download content for contribution ${contrib.id} (stage '${displayName}')`,
                                            { path: pathToDownload, error: downloadError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                                        );
                                        if (rule.required !== false) {
                                            criticalError = new Error(`Failed to download REQUIRED content for contribution ${contrib.id} from stage '${displayName}'. Original error: ${downloadError ? downloadError.message : 'Unknown download error'}`);
                                            console.log(`[PromptAssembler._gatherInputsForStage] criticalError SET (contribution download): ${criticalError?.message}`); // DIAGNOSTIC LOG 1b
                                            break; // Break from the 'for (const contrib of typedAiContributions)' loop
                                        }
                                        // Optional failed download for an item, item contributes nothing to currentRuleContributionsContent
                                    }
                            } else {
                                 console.warn(`[PromptAssembler._gatherInputsForStage] Contribution ${contrib.id} is missing storage_path or storage_bucket.`);
                                 if (rule.required !== false) {
                                    criticalError = new Error(`REQUIRED Contribution ${contrib.id} from stage '${displayName}' is missing storage details.`);
                                    console.log(`[PromptAssembler._gatherInputsForStage] criticalError SET (contribution missing storage): ${criticalError?.message}`); // DIAGNOSTIC LOG 1c
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
                    }
                    // After processing all contributions for THIS rule, if a critical error occurred, break outer loop.
                    if (criticalError) break;

                } else if (rule.type === 'feedback') { 
                    const feedbackPath = `projects/${project.id}/sessions/${session.id}/iteration_${iterationNumber}/${rule.stage_slug}/user_feedback_${rule.stage_slug}.md`;
                    
                    const { data: content, error: downloadError } =
                        await downloadFromStorage(this.dbClient, this.storageBucket, feedbackPath);

                    if (content && !downloadError) { // Successfully downloaded non-empty content
                        const blockHeader = rule.section_header
                            ? `${rule.section_header}

`
                            : `### Feedback from ${displayName} Stage

`;
                        priorStageFeedback += blockHeader; // Add header
                        priorStageFeedback += `#### User Feedback for ${displayName}

${new TextDecoder().decode(content)}

---
`; // Add content
                    } else {
                        // Content is null/empty or there was a downloadError
                        if (downloadError) {
                            console.error(
                                `[PromptAssembler._gatherInputsForStage] Failed to download feedback file. Path: ${feedbackPath}`,
                                { error: downloadError, rule, projectId: project.id, sessionId: session.id, iterationNumber },
                            );
                            if (rule.required !== false) {
                                criticalError = new Error(
                                    `Failed to download REQUIRED feedback for stage '${displayName}' (slug: ${rule.stage_slug}). Original error: ${downloadError ? downloadError.message : 'Unknown download error'}`
                                );
                                console.log(`[PromptAssembler._gatherInputsForStage] criticalError SET (feedback download): ${criticalError?.message}`); // DIAGNOSTIC LOG 1d
                                break; // Break from the 'for (const rule of parsedRules.sources)' loop
                            }
                            // For optional feedback with download error, do nothing further.
                            // The header and content are not added because the 'if (content && !downloadError)' condition was false.
                        } else { // No downloadError means content is null or empty (e.g., file not found or empty file)
                             console.info(
                                `[PromptAssembler._gatherInputsForStage] No feedback file found or content was empty for stage '${displayName}'. Path: ${feedbackPath}`,
                                { rule, projectId: project.id, sessionId: session.id, iterationNumber },
                            );
                            // For optional feedback not found or empty, do nothing further.
                            // The header and content are not added.
                            // If this was a required feedback that was simply not found (no download error, just null content),
                            // and the system expects it, this might be an implicit issue not currently flagged as an error by this logic.
                            // However, for optional, this is the correct behavior according to the new requirement.
                        }
                    }
                }
            } else if (rule.type === 'initial_project_prompt') {
                // Currently, initial_project_prompt type rules are not used to gather prior *stage* content.
                // They are used elsewhere to get the initial_user_prompt for the overall assembly.
                // console.info("[PromptAssembler._gatherInputsForStage] Skipping 'initial_project_prompt' rule in prior stage content gathering loop:", rule);
            }
        }

        console.log(`[PromptAssembler._gatherInputsForStage] BEFORE FINAL THROW CHECK, criticalError is: ${criticalError?.message}`); // DIAGNOSTIC LOG 2
        if (criticalError) {
            console.log(`[PromptAssembler._gatherInputsForStage] ABOUT TO THROW CRITICAL ERROR: ${criticalError.message}`);
            throw criticalError; // Throw the first critical error encountered
        }

        return { priorStageContributions, priorStageFeedback };
    }

    async getContextDocuments(projectContext: ProjectContext, stageContext: StageContext): Promise<string[] | null> {
        // TODO: Implement logic to fetch relevant documents based on project/stage context.
        // This might involve querying dialectic_project_resources or other tables.
        // If this.fileManager were to be used, it would be here, e.g., to get signed URLs or file content.
        console.warn("[PromptAssembler.getContextDocuments] Method not yet implemented.", { projectContext, stageContext });
        return null;
    }
} 