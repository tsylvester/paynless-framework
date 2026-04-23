import { Tables, Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import {
  DialecticJobRow,
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

// Deterministic valid-hex UUIDs for processSimpleJob mock fixtures.
// Each encodes the entity name using only hex-safe letters (a-f) and digits.
const UUID_PROJECT     = 'a0000001-0000-4000-a000-000000000001'; // project
const UUID_SESSION     = 'a0000002-0000-4000-a000-000000000002'; // session
const UUID_MODEL       = 'a0000003-0000-4000-a000-000000000003'; // model
const UUID_WALLET      = 'a0000004-0000-4000-a000-000000000004'; // wallet
const UUID_USER        = 'a0000005-0000-4000-a000-000000000005'; // user
const UUID_JOB         = 'a0000006-0000-4000-a000-000000000006'; // job
const UUID_DOMAIN      = 'a0000008-0000-4000-a000-000000000008'; // domain
const UUID_STAGE       = 'a0000009-0000-4000-a000-000000000009'; // stage
const UUID_PROMPT      = 'a000000a-0000-4000-a000-00000000000a'; // prompt
const UUID_TEMPLATE    = 'a000000b-0000-4000-a000-00000000000b'; // template
const UUID_STEP        = 'a000000c-0000-4000-a000-00000000000c'; // step
const UUID_INSTANCE    = 'a000000d-0000-4000-a000-00000000000d'; // instance
const UUID_STAGE_STEP  = 'a000000e-0000-4000-a000-00000000000e'; // stage-step
const UUID_CHAT        = 'a000000f-0000-4000-a000-00000000000f'; // chat
const UUID_IDEMPOTENCY = 'a0000010-0000-4000-a000-000000000010'; // idempotency

// ---------------------------------------------------------------------------
// Execute payload builder — mock[Object]
// ---------------------------------------------------------------------------

const processSimpleJobExecutePayloadDefault: DialecticExecuteJobPayload = {
  projectId: UUID_PROJECT,
  sessionId: UUID_SESSION,
  stageSlug: defaultStepSlug,
  model_id: UUID_MODEL,
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: UUID_WALLET,
  user_jwt: 'jwt.token.here',
  planner_metadata: { recipe_step_id: UUID_STEP, recipe_template_id: UUID_TEMPLATE },
  prompt_template_id: UUID_TEMPLATE,
  output_type: FileType.business_case,
  canonicalPathParams: {
    contributionType: 'thesis',
    stageSlug: defaultStepSlug,
  },
  inputs: {},
  idempotencyKey: UUID_IDEMPOTENCY,
};

export function mockExecutePayload(
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

export const mockPayload: DialecticExecuteJobPayload = mockExecutePayload();

if (!isJson(mockPayload)) {
  throw new Error('Test setup failed: mockPayload is not Json-compatible.');
}

// ---------------------------------------------------------------------------
// Recipe step fixtures — exported for integration tests; do not duplicate.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Job builder — mock[Object]
// ---------------------------------------------------------------------------

export function mockJob(overrides?: Partial<DialecticJobRow>): DialecticJobRow {
  if (!isJson(mockPayload)) {
    throw new Error('Test setup failed: mockPayload is not Json-compatible.');
  }
  return {
    id: UUID_JOB,
    session_id: UUID_SESSION,
    user_id: UUID_USER,
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
    idempotency_key: UUID_IDEMPOTENCY,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Database row fixtures — session and provider
// ---------------------------------------------------------------------------

export const mockSessionData: Tables<'dialectic_sessions'> = {
  id: UUID_SESSION,
  project_id: UUID_PROJECT,
  session_description: 'A mock session',
  user_input_reference_url: null,
  iteration_count: 1,
  selected_model_ids: [UUID_MODEL],
  status: 'in-progress',
  associated_chat_id: UUID_CHAT,
  current_stage_id: UUID_STAGE,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  viewing_stage_id: null,
  idempotency_key: null,
};

export const mockProviderData: Tables<'ai_providers'> = {
  id: UUID_MODEL,
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

// ---------------------------------------------------------------------------
// PrepareModelJob success return builder — mock[FunctionName]
// ---------------------------------------------------------------------------

export function mockPrepareModelJobSuccessReturn(
  overrides?: Partial<PrepareModelJobSuccessReturn>,
): PrepareModelJobSuccessReturn {
  const defaults: PrepareModelJobSuccessReturn = { queued: true };
  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// Test assertion helper — not a mock; validates prepareModelJob call shape
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// DB client mock — mock[FunctionName]
// ---------------------------------------------------------------------------

export const mockClient = (configOverrides: Record<string, unknown> = {}) => {
  const mockProject: Tables<'dialectic_projects'> & { dialectic_domains: Pick<Tables<'dialectic_domains'>, 'id' | 'name' | 'description'> } = {
    id: UUID_PROJECT,
    user_id: UUID_USER,
    project_name: 'Test Project',
    initial_user_prompt: 'Test prompt',
    selected_domain_id: UUID_DOMAIN,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    initial_prompt_resource_id: null,
    process_template_id: UUID_TEMPLATE,
    repo_url: null,
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
    dialectic_domains: {
      id: UUID_DOMAIN,
      name: 'Test Domain',
      description: 'A domain for testing',
    },
    idempotency_key: UUID_IDEMPOTENCY,
  };

  const mockStage: Tables<'dialectic_stages'> & { system_prompts: { id: string; prompt_text: string } | null } = {
    id: UUID_STAGE,
    slug: defaultStepSlug,
    display_name: 'Test Stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: UUID_PROMPT,
    description: null,
    expected_output_template_ids: [],
    system_prompts: {
      id: UUID_PROMPT,
      prompt_text: 'This is the base system prompt for the test stage.',
    },
    active_recipe_instance_id: null,
    recipe_template_id: UUID_TEMPLATE,
    minimum_balance: 0,
  };

  return createMockSupabaseClient(UUID_USER, {
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
        select: () => Promise.resolve({ data: [], error: null }),
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
        select: (state: unknown) => {
          const defaultStep: DialecticRecipeTemplateStep = {
            id: UUID_STEP,
            template_id: UUID_TEMPLATE,
            step_number: 1,
            step_key: 'seed',
            step_slug: 'seed',
            step_name: 'Doc-centric execution step',
            step_description: 'Generate the main business case document.',
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: UUID_PROMPT,
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
          const stateRecord = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
          const filters: unknown[] = Array.isArray(stateRecord['filters']) ? stateRecord['filters'] : [];
          const hasIdEq = filters.some((f) => {
            const fr = f !== null && typeof f === 'object' ? f as Record<string, unknown> : {};
            return fr['type'] === 'eq' && fr['column'] === 'id' && fr['value'] === UUID_STEP;
          });
          if (hasIdEq) return Promise.resolve({ data: [defaultStep], error: null });
          const hasTemplate = filters.some((f) => {
            const fr = f !== null && typeof f === 'object' ? f as Record<string, unknown> : {};
            return fr['type'] === 'eq' && fr['column'] === 'template_id' && fr['value'] === UUID_TEMPLATE;
          });
          const hasSlug = filters.some((f) => {
            const fr = f !== null && typeof f === 'object' ? f as Record<string, unknown> : {};
            return fr['type'] === 'eq' && fr['column'] === 'step_slug' && typeof fr['value'] === 'string';
          });
          if (hasTemplate && hasSlug) return Promise.resolve({ data: [defaultStep], error: null });
          return Promise.resolve({ data: [], error: null });
        },
      },
      dialectic_stage_recipe_steps: {
        select: (state: unknown) => {
          const defaultStageStep: DialecticStageRecipeStep = {
            id: UUID_STAGE_STEP,
            instance_id: UUID_INSTANCE,
            template_step_id: UUID_STEP,
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
            prompt_template_id: UUID_PROMPT,
            execution_order: 1,
          };
          const stateRecord = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
          const filters: unknown[] = Array.isArray(stateRecord['filters']) ? stateRecord['filters'] : [];
          const matchesId = filters.some((f) => {
            const fr = f !== null && typeof f === 'object' ? f as Record<string, unknown> : {};
            return fr['type'] === 'eq' && fr['column'] === 'id' && fr['value'] === defaultStageStep.id;
          });
          if (matchesId) return Promise.resolve({ data: [defaultStageStep], error: null });
          const matchesInstance = filters.some((f) => {
            const fr = f !== null && typeof f === 'object' ? f as Record<string, unknown> : {};
            return fr['type'] === 'eq' && fr['column'] === 'instance_id' && fr['value'] === defaultStageStep.instance_id;
          });
          const matchesSlug = filters.some((f) => {
            const fr = f !== null && typeof f === 'object' ? f as Record<string, unknown> : {};
            return fr['type'] === 'eq' && fr['column'] === 'step_slug' && typeof fr['value'] === 'string';
          });
          if (matchesInstance && matchesSlug) return Promise.resolve({ data: [defaultStageStep], error: null });
          return Promise.resolve({ data: [], error: null });
        },
      },
      ...configOverrides,
    },
  });
};

// ---------------------------------------------------------------------------
// Context/deps mock — mock[FunctionName]
// ---------------------------------------------------------------------------

export const mockDeps = (
  overrideParams?: Partial<JobContextParams>,
): { promptAssembler: MockPromptAssembler; fileManager: MockFileManagerService; rootCtx: IJobContext } => {
  const baseParams: JobContextParams = createMockJobContextParams({
    prepareModelJob: async () => mockPrepareModelJobSuccessReturn(),
  });
  const finalParams: JobContextParams = { ...baseParams, ...overrideParams };

  const rootCtx: IJobContext = createJobContext(finalParams);

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
