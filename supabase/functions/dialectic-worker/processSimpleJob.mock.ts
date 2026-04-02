import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Tables, Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import {
  isJson,
} from '../_shared/utils/type_guards.ts';
import {
  DialecticJobRow,
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticRecipeTemplateStep,
  DialecticStageRecipeStep,
  OutputRule,
  InputRule,
  RelevanceRule,
} from '../dialectic-service/dialectic.interface.ts';
import type {
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobSuccessReturn,
} from './prepareModelJob/prepareModelJob.interface.ts';
import {
  isPrepareModelJobParams,
  isPrepareModelJobPayload,
} from './prepareModelJob/prepareModelJob.guard.ts';
import { MockPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { createJobContext } from './createJobContext/createJobContext.ts';
import { IJobContext, JobContextParams } from './createJobContext/JobContext.interface.ts';
import { createMockJobContextParams } from './createJobContext/JobContext.mock.ts';
import { IPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import { IFileManager } from '../_shared/types/file_manager.types.ts';

export const defaultStepSlug = 'thesis';

const processSimpleJobExecutePayloadDefault: DialecticExecuteJobPayload = {
  projectId: 'p00ject0-0abc-4000-a000-000000000001',
  sessionId: '5e551010-0456-4000-a000-000000000002',
  stageSlug: defaultStepSlug,
  model_id: 'm0de10de-f000-4000-a000-000000000003',
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: 'a111e700-0000-4000-a000-000000000004',
  user_jwt: 'jwt.token.here',
  planner_metadata: { recipe_step_id: '57ep0000-0001-4000-a000-000000000005', recipe_template_id: '7e8p1a7e-0123-4000-a000-000000000006' },
  prompt_template_id: '7e8p1a7e-0123-4000-a000-000000000006',
  output_type: FileType.business_case,
  canonicalPathParams: {
    contributionType: 'thesis',
    stageSlug: defaultStepSlug,
  },
  inputs: {},
  idempotencyKey: '1de8p07e-0001-4000-a000-000000000007',
};

export function buildProcessSimpleJobExecutePayload(
  overrides?: Partial<DialecticExecuteJobPayload>,
): DialecticExecuteJobPayload {
  const payload: DialecticExecuteJobPayload = {
    ...processSimpleJobExecutePayloadDefault,
    canonicalPathParams: {
      ...processSimpleJobExecutePayloadDefault.canonicalPathParams,
    },
    planner_metadata: processSimpleJobExecutePayloadDefault.planner_metadata
      ? { ...processSimpleJobExecutePayloadDefault.planner_metadata }
      : null,
    inputs: { ...processSimpleJobExecutePayloadDefault.inputs },
  };
  if (overrides === undefined) {
    return payload;
  }
  return {
    ...payload,
    ...overrides,
    canonicalPathParams: {
      ...payload.canonicalPathParams,
      ...(overrides.canonicalPathParams ?? {}),
    },
    planner_metadata: overrides.planner_metadata === undefined
      ? payload.planner_metadata
      : overrides.planner_metadata,
    inputs: overrides.inputs === undefined
      ? payload.inputs
      : { ...overrides.inputs },
  };
}

export const mockPayload: DialecticExecuteJobPayload = buildProcessSimpleJobExecutePayload();

if (!isJson(mockPayload)) {
  throw new Error('Test setup failed: mockPayload is not Json-compatible.');
}

/** Recipe fixtures used by {@link setupMockClient} — export for integration tests; do not duplicate. */
export const templateInputsRequired: InputRule[] = [
  { type: 'document', slug: defaultStepSlug, document_key: FileType.business_case, required: true },
  { type: 'document', slug: defaultStepSlug, document_key: FileType.feature_spec, required: true },
  { type: 'header_context', slug: defaultStepSlug, document_key: FileType.HeaderContext, required: true },
];

export const templateInputsRelevance: RelevanceRule[] = [
  { document_key: FileType.business_case, slug: defaultStepSlug, relevance: 1, type: 'document' },
  { document_key: FileType.feature_spec, slug: defaultStepSlug, relevance: 0.85, type: 'document' },
  { document_key: FileType.HeaderContext, slug: defaultStepSlug, relevance: 0.75 },
];

export const templateOutputsRequired: OutputRule = {
  system_materials: {
    stage_rationale: 'Align business case with feature spec for this iteration.',
    agent_notes_to_self: 'Summarize the dialectic findings across artifacts.',
    input_artifacts_summary: 'Business case + feature spec + header context.',
    quality_standards: ['Tie evidence directly to documents', 'Preserve prior commitments'],
    validation_checkpoint: ['All referenced artifacts exist', 'Instructions follow dependency order'],
    document_order: ['business_case'],
    current_document: 'business_case',
  },
  header_context_artifact: {
    type: 'header_context',
    document_key: 'header_context',
    artifact_class: 'header_context',
    file_type: 'json',
  },
  context_for_documents: [
    {
      document_key: FileType.business_case,
      content_to_include: {
        focus: 'doc-centric deliverable summary',
        reasoning_chain: true,
      },
    },
  ],
  documents: [
    {
      artifact_class: 'rendered_document',
      file_type: 'markdown',
      document_key: FileType.business_case,
      template_filename: 'business_case.md',
      content_to_include: {
        enforce_style: 'doc-centric',
      },
    },
  ],
};

export const stageInputsRequired: InputRule[] = [
  { type: 'document', slug: defaultStepSlug, document_key: FileType.business_case, required: true },
  { type: 'document', slug: defaultStepSlug, document_key: FileType.feature_spec, required: true },
  { type: 'header_context', slug: defaultStepSlug, document_key: FileType.HeaderContext, required: true },
];

export const stageInputsRelevance: RelevanceRule[] = [
  { document_key: FileType.business_case, slug: defaultStepSlug, relevance: 1 },
  { document_key: FileType.feature_spec, slug: defaultStepSlug, relevance: 0.85 },
  { document_key: FileType.HeaderContext, slug: defaultStepSlug, relevance: 0.75 },
];

export const stageOutputsRequired: OutputRule = {
  system_materials: {
    stage_rationale: 'Align business case with feature spec for this iteration.',
    agent_notes_to_self: 'Summarize the dialectic findings across artifacts.',
    input_artifacts_summary: 'Business case + feature spec + header context.',
    validation_checkpoint: ['All referenced artifacts exist', 'Instructions follow dependency order'],
    document_order: ['business_case'],
    current_document: 'business_case',
  },
  header_context_artifact: {
    type: 'header_context',
    document_key: 'header_context',
    artifact_class: 'header_context',
    file_type: 'json',
  },
  documents: [
    {
      artifact_class: 'rendered_document',
      file_type: 'markdown',
      document_key: FileType.business_case,
      template_filename: 'business_case.md',
    },
  ],
};

export const mockJob: DialecticJobRow = {
  id: '00000b00-0123-4000-a000-000000000008',
  session_id: '5e551010-0456-4000-a000-000000000002',
  user_id: '00u5e000-0789-4000-a000-000000000009',
  stage_slug: defaultStepSlug,
  iteration_number: 1,
  payload: mockPayload,
  status: 'pending',
  attempt_count: 0,
  max_retries: 3,
  created_at: new Date().toISOString(),
  parent_job_id: null,
  results: null,
  completed_at: null,
  error_details: null,
  started_at: null,
  target_contribution_id: null,
  prerequisite_job_id: null,
  is_test_job: false,
  job_type: 'PLAN',
  idempotency_key: '1de8p07e-0001-4000-a000-000000000007',
};

export const mockSessionData: Tables<'dialectic_sessions'> = {
  id: '5e551010-0456-4000-a000-000000000002',
  project_id: 'p00ject0-0abc-4000-a000-000000000001',
  session_description: 'A mock session',
  user_input_reference_url: null,
  iteration_count: 1,
  selected_model_ids: ['m0de10de-f000-4000-a000-000000000003'],
  status: 'in-progress',
  associated_chat_id: '00c0a700-0789-4000-a000-00000000000a',
  current_stage_id: '005a6e00-0001-4000-a000-00000000000b',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  viewing_stage_id: null,
  idempotency_key: null,
};

export const mockProviderData: Tables<'ai_providers'> = {
  id: 'm0de10de-f000-4000-a000-000000000003',
  provider: 'mock-provider',
  name: 'Mock AI',
  api_identifier: 'mock-ai-v1',
  config: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: null,
  is_active: true,
  is_default_embedding: false,
  is_default_generation: false,
  is_enabled: true,
};

export const mockContribution: DialecticContributionRow = {
  id: 'c0007b00-0123-4000-a000-00000000000c',
  session_id: '5e551010-0456-4000-a000-000000000002',
  stage: defaultStepSlug,
  iteration_number: 1,
  model_id: 'm0de10de-f000-4000-a000-000000000003',
  edit_version: 1,
  is_latest_edit: true,
  citations: null,
  contribution_type: 'model_contribution_main',
  created_at: new Date().toISOString(),
  error: null,
  file_name: 'test.txt',
  mime_type: 'text/plain',
  model_name: 'Mock AI',
  original_model_contribution_id: null,
  processing_time_ms: 100,
  prompt_template_id_used: null,
  raw_response_storage_path: null,
  seed_prompt_url: null,
  size_bytes: 100,
  storage_bucket: 'test-bucket',
  storage_path: 'test/path',
  target_contribution_id: null,
  tokens_used_input: 10,
  tokens_used_output: 20,
  updated_at: new Date().toISOString(),
  user_id: '00u5e000-0789-4000-a000-000000000009',
  document_relationships: null,
  is_header: false,
  source_prompt_resource_id: null,
};

export function createPrepareModelJobSuccessReturn(): PrepareModelJobSuccessReturn {
  return {
    contribution: mockContribution,
    needsContinuation: false,
    renderJobId: null,
  };
}

export function assertPrepareModelJobTwoArgCall(
  callArgs: unknown[],
): { params: PrepareModelJobParams; payload: PrepareModelJobPayload } {
  if (callArgs.length !== 2) {
    throw new Error(`prepareModelJob must receive exactly 2 arguments, got ${callArgs.length}`);
  }
  const rawParams: unknown = callArgs[0];
  const rawPayload: unknown = callArgs[1];
  if (!isPrepareModelJobParams(rawParams)) {
    throw new Error('prepareModelJob first argument is not PrepareModelJobParams');
  }
  if (!isPrepareModelJobPayload(rawPayload)) {
    throw new Error('prepareModelJob second argument is not PrepareModelJobPayload');
  }
  const params: PrepareModelJobParams = rawParams;
  const payload: PrepareModelJobPayload = rawPayload;
  return { params, payload };
}

export const setupMockClient = (configOverrides: Record<string, any> = {}) => {
  const mockProject: Tables<'dialectic_projects'> & { dialectic_domains: Pick<Tables<'dialectic_domains'>, 'id' | 'name' | 'description'> } = {
    id: 'p00ject0-0abc-4000-a000-000000000001',
    user_id: '00u5e000-0789-4000-a000-000000000009',
    project_name: 'Test Project',
    initial_user_prompt: 'Test prompt',
    selected_domain_id: '00d08a10-0123-4000-a000-00000000000d',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    initial_prompt_resource_id: null,
    process_template_id: '7e8p1a7e-0123-4000-a000-000000000006',
    repo_url: null,
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
    dialectic_domains: {
      id: '00d08a10-0123-4000-a000-00000000000d',
      name: 'Test Domain',
      description: 'A domain for testing',
    },
    idempotency_key: '1de8p07e-0001-4000-a000-000000000007',
  };

  const mockStage: Tables<'dialectic_stages'> & { system_prompts: { id: string; prompt_text: string } | null } = {
    id: '005a6e00-0001-4000-a000-00000000000b',
    slug: defaultStepSlug,
    display_name: 'Test Stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: '0008p700-0123-4000-a000-00000000000e',
    description: null,
    expected_output_template_ids: [],
    system_prompts: {
      id: '0008p700-0123-4000-a000-00000000000e',
      prompt_text: 'This is the base system prompt for the test stage.',
    },
    active_recipe_instance_id: null,
    recipe_template_id: '7e8p1a7e-0123-4000-a000-000000000006',
    minimum_balance: 0,
  };

  return createMockSupabaseClient('user-789', {
    genericMockResults: {
      dialectic_projects: {
        select: () => Promise.resolve({ data: [mockProject], error: null }),
      },
      dialectic_stages: {
        select: () => Promise.resolve({ data: [mockStage], error: null }),
      },
      dialectic_sessions: {
        select: () => Promise.resolve({ data: [mockSessionData], error: null }),
      },
      ai_providers: {
        select: () => Promise.resolve({ data: [mockProviderData], error: null }),
      },
      dialectic_contributions: {
        select: () => Promise.resolve({ data: [mockContribution], error: null }),
      },
      domain_specific_prompt_overlays: {
        select: () => Promise.resolve({
          data: [
            {
              overlay_values: {
                role: 'senior product strategist',
                stage_instructions: 'baseline',
                style_guide_markdown: '# Guide',
                expected_output_artifacts_json: '{}',
              },
            },
          ],
          error: null,
        }),
      },
      dialectic_recipe_template_steps: {
        select: (state: any) => {
          const defaultStep: DialecticRecipeTemplateStep = {
            id: 'step-1',
            template_id: 'template-123',
            step_number: 1,
            step_key: 'seed',
            step_slug: 'seed',
            step_name: 'Doc-centric execution step',
            step_description: 'Generate the main business case document.',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: 'prompt-123',
            output_type: FileType.business_case,
            granularity_strategy: 'per_source_document',
            inputs_required: templateInputsRequired,
            inputs_relevance: templateInputsRelevance,
            outputs_required: templateOutputsRequired,
            parallel_group: null,
            branch_key: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const hasIdEq = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === 'step-1');
          if (hasIdEq) return Promise.resolve({ data: [defaultStep], error: null });
          const hasTemplate = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'template_id' && f.value === 'template-123');
          const hasSlug = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'step_slug' && typeof f.value === 'string');
          if (hasTemplate && hasSlug) return Promise.resolve({ data: [defaultStep], error: null });
          return Promise.resolve({ data: [], error: null });
        },
      },
      dialectic_stage_recipe_steps: {
        select: (state: any) => {
          const defaultStageStep: DialecticStageRecipeStep = {
            id: 'stage-step-1',
            instance_id: 'instance-1',
            template_step_id: 'step-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            step_key: 'seed',
            step_slug: 'seed',
            step_name: 'Doc-centric execution step',
            step_description: 'Generate the main business case document.',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            output_type: FileType.business_case,
            granularity_strategy: 'per_source_document',
            inputs_required: stageInputsRequired,
            inputs_relevance: stageInputsRelevance,
            outputs_required: stageOutputsRequired,
            config_override: { temperature: 0.2 },
            object_filter: { branch_key: 'business_case' },
            output_overrides: { document_key: FileType.business_case },
            is_skipped: false,
            parallel_group: null,
            branch_key: null,
            prompt_template_id: 'prompt-123',
            execution_order: 1,
          };

          const filters = Array.isArray(state?.filters) ? state.filters : [];
          const matchesId = filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === defaultStageStep.id);
          if (matchesId) return Promise.resolve({ data: [defaultStageStep], error: null });
          const matchesInstance = filters.some((f: any) => f.type === 'eq' && f.column === 'instance_id' && f.value === defaultStageStep.instance_id);
          const matchesSlug = filters.some((f: any) => f.type === 'eq' && f.column === 'step_slug' && typeof f.value === 'string');
          if (matchesInstance && matchesSlug) return Promise.resolve({ data: [defaultStageStep], error: null });
          return Promise.resolve({ data: [], error: null });
        },
      },
      ...configOverrides,
    },
  });
};

export const getMockDeps = (
  overrideParams?: Partial<JobContextParams>,
): { promptAssembler: MockPromptAssembler; fileManager: MockFileManagerService; rootCtx: IJobContext } => {
  const baseParams: JobContextParams = createMockJobContextParams({
    prepareModelJob: async () => createPrepareModelJobSuccessReturn(),
  });
  const finalParams: JobContextParams = { ...baseParams, ...overrideParams };

  const rootCtx = createJobContext(finalParams);

  const promptAssemblerCandidate: IPromptAssembler = finalParams.promptAssembler;
  const fileManagerCandidate: IFileManager = finalParams.fileManager;

  if (!(promptAssemblerCandidate instanceof MockPromptAssembler)) {
    throw new Error(
      'processSimpleJob tests require promptAssembler to be MockPromptAssembler (subclass or proxy of it).',
    );
  }
  if (!(fileManagerCandidate instanceof MockFileManagerService)) {
    throw new Error('processSimpleJob tests require fileManager to be MockFileManagerService.');
  }

  const promptAssembler: MockPromptAssembler = promptAssemblerCandidate;
  const fileManager: MockFileManagerService = fileManagerCandidate;

  return { promptAssembler, fileManager, rootCtx };
};
