import {
  assertEquals,
  assertExists,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  DialecticJobRow,
  DialecticPlanJobPayload,
  DialecticStageRecipeStep,
  SourceDocument,
  RelevanceRule,
  InputRule,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planAllToOne } from './planAllToOne.ts';
import { FileType, type PathContext } from '../../../_shared/types/file_manager.types.ts';
import { isDialecticExecuteJobPayload } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { constructStoragePath } from '../../../_shared/utils/path_constructor.ts';

// --- MOCK DATA ---

const createMockSourceDocument = (
  id: string,
  fileName: string | null,
  stage: string,
  documentKey: FileType
): SourceDocument => {
  const session_id = 'session-1';
  const iteration_number = 1;
  const model_slug = fileName?.split('_')[0] ?? 'unknown-model';

  const pathContext: PathContext = {
    sessionId: session_id,
    iteration: iteration_number,
    stageSlug: stage,
    documentKey: documentKey,
    modelSlug: model_slug,
    attemptCount: 0,
    fileType: FileType.RenderedDocument,
    projectId: 'project-1'
  };
  
  const { storagePath } = constructStoragePath(pathContext);

  return {
    id,
    file_name: fileName,
    stage,
    document_key: documentKey,
    content: `content for ${id}`,
    session_id,
    user_id: 'user-1',
    iteration_number,
    model_id: 'model-1',
    contribution_type: 'thesis',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    citations: null,
    error: null,
    mime_type: 'text/markdown',
    original_model_contribution_id: null,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    size_bytes: 100,
    storage_bucket: 'dialectic-project-resources',
    storage_path: storagePath,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    edit_version: 0,
    is_latest_edit: true,
    seed_prompt_url: null,
    target_contribution_id: null,
    model_name: null,
    is_header: false,
    source_prompt_resource_id: null,
  };
};

const createMockRecipeStep = (
  relevanceRules: RelevanceRule[],
  isPlanJob: boolean
): DialecticStageRecipeStep => {
    const outputs: DialecticStageRecipeStep['outputs_required'] = {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.business_case,
            template_filename: 'thesis_business_case.md',
        }],
        header_context_artifact: {
            type: 'header_context',
            document_key: 'header_context',
            artifact_class: 'header_context',
            file_type: 'json',
        },
        context_for_documents: [{
            document_key: FileType.business_case,
            content_to_include: {},
        }],
    };

    if (!isPlanJob) {
        outputs.files_to_generate = [{
            from_document_key: FileType.business_case,
            template_filename: 'thesis_business_case.md',
        }];
    }

    return {
      id: 'step-1',
      job_type: isPlanJob ? 'PLAN' : 'EXECUTE',
      granularity_strategy: 'all_to_one',
      inputs_relevance: relevanceRules,
      output_type: isPlanJob ? FileType.HeaderContext : FileType.business_case,
      outputs_required: outputs,
      // Other required fields
      instance_id: 'instance-1',
      template_step_id: 'template-step-1',
      step_key: 'test-step',
      step_slug: 'test-step',
      step_name: 'Test Step',
      prompt_template_id: 'prompt-template-1',
      prompt_type: 'Turn',
      inputs_required: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      config_override: {},
      is_skipped: false,
      object_filter: {},
      output_overrides: {},
      branch_key: null,
      execution_order: 1,
      parallel_group: null,
      step_description: 'A test step',
    };
};

const createMockParentJob = (): DialecticJobRow & {
  payload: DialecticPlanJobPayload;
} => ({
  id: 'parent-job-1',
  payload: {
    projectId: 'project-1',
    sessionId: 'session-1',
    stageSlug: 'antithesis',
    iterationNumber: 1,
    model_id: 'model-1',
    user_jwt: 'mock-jwt-string',
    walletId: 'wallet-1',
  },
  attempt_count: 0,
  completed_at: null,
  created_at: new Date().toISOString(),
  error_details: null,
  is_test_job: false,
  iteration_number: 1,
  job_type: 'PLAN',
  max_retries: 3,
  parent_job_id: null,
  prerequisite_job_id: null,
  results: null,
  session_id: 'session-1',
  stage_slug: 'antithesis',
  started_at: null,
  status: 'pending',
  target_contribution_id: null,
  user_id: 'user-1',
});

// --- TESTS ---

Deno.test('104.c.i: planAllToOne PLAN branch selects anchor from highest relevance for canonicalPathParams.sourceAnchorModelSlug',
  () => {
    const recipeStep = createMockRecipeStep(
      [{ document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' }],
      true
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument(
        'doc-1',
        'gpt-4_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
        assertEquals(
            payload.canonicalPathParams?.sourceAnchorModelSlug,
            'gpt-4',
            "sourceAnchorModelSlug should be 'gpt-4', extracted from the highest-relevance document's filename"
        );
    } else {
        throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.c.ii: planAllToOne PLAN branch with empty inputs_relevance results in undefined sourceAnchorModelSlug',
  () => {
    const recipeStep = createMockRecipeStep([], true); // Empty relevance rules
    const sourceDocs = [
      createMockSourceDocument(
        'doc-1',
        'gpt-4_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
     if (isDialecticExecuteJobPayload(payload)) {
        assertEquals(
            payload.canonicalPathParams?.sourceAnchorModelSlug,
            undefined,
            'sourceAnchorModelSlug should be undefined when no relevance rules are provided'
        );
    } else {
        throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.c.iii: planAllToOne PLAN branch selects highest-relevance thesis doc, not seed_prompt, for canonical path params',
  () => {
    const recipeStep = createMockRecipeStep(
      [{ document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' }],
      true
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
        { type: 'seed_prompt', slug: 'thesis', document_key: FileType.SeedPrompt, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument('seed-prompt', null, 'thesis', FileType.SeedPrompt),
      createMockSourceDocument(
        'doc-1',
        'gpt-4-turbo_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
        assertEquals(
            payload.canonicalPathParams?.sourceAnchorModelSlug,
            'gpt-4-turbo',
            'Should select the thesis document with highest relevance, not the seed prompt'
        );
    } else {
        throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.c.iv: planAllToOne PLAN branch selects doc with highest relevance from multiple thesis docs for canonical path params',
  () => {
    const recipeStep = createMockRecipeStep(
      [
        { document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' },
        { document_key: FileType.feature_spec, relevance: 0.5, type: 'document', slug: 'thesis' },
      ],
      true
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
        { type: 'document', slug: 'thesis', document_key: FileType.feature_spec, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument(
        'doc-low-relevance',
        'claude-3_0_feature_spec.md',
        'thesis',
        FileType.feature_spec
      ),
      createMockSourceDocument(
        'doc-high-relevance',
        'gemini-1.5_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
        assertEquals(
            payload.canonicalPathParams?.sourceAnchorModelSlug,
            'gemini-1.5',
            'Should select the document with the highest relevance score (1.0)'
        );
    } else {
        throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.c.v: planAllToOne PLAN branch with inputs_relevance but no matching source docs results in undefined sourceAnchorModelSlug',
  () => {
    const recipeStep = createMockRecipeStep(
      [{ document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' }],
      true
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument( // This doc does not match the relevance rule
        'doc-1',
        'gpt-4_0_feature_spec.md',
        'thesis',
        FileType.feature_spec
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
        assertEquals(
            payload.canonicalPathParams?.sourceAnchorModelSlug,
            undefined,
            'sourceAnchorModelSlug should be undefined when no source documents match the relevance rules'
        );
    } else {
        throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.d.i: planAllToOne EXECUTE branch selects doc with highest relevance from multiple thesis docs for canonical path params',
  () => {
    const recipeStep = createMockRecipeStep(
      [
        { document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' },
        { document_key: FileType.feature_spec, relevance: 0.5, type: 'document', slug: 'thesis' },
      ],
      false // EXECUTE job
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
        { type: 'document', slug: 'thesis', document_key: FileType.feature_spec, required: true },
    ];
    const sourceDocs = [
      createMockSourceDocument(
        'doc-low-relevance',
        'claude-3_0_feature_spec.md',
        'thesis',
        FileType.feature_spec
      ),
      createMockSourceDocument(
        'doc-high-relevance',
        'gemini-1.5_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
      assertEquals(
        payload.canonicalPathParams?.sourceAnchorModelSlug,
        'gemini-1.5',
        'Should select the document with the highest relevance score (1.0)'
      );
    } else {
      throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.d.ii: planAllToOne EXECUTE branch selects highest-relevance thesis doc, not seed_prompt, for canonical path params',
  () => {
    const recipeStep = createMockRecipeStep(
      [{ document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' }],
      false // EXECUTE job
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
        { type: 'seed_prompt', slug: 'thesis', document_key: FileType.SeedPrompt, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument('seed-prompt', null, 'thesis', FileType.SeedPrompt),
      createMockSourceDocument(
        'doc-1',
        'gpt-4-turbo_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
      assertEquals(
        payload.canonicalPathParams?.sourceAnchorModelSlug,
        'gpt-4-turbo',
        'Should select the thesis document with highest relevance, not the seed prompt'
      );
    } else {
      throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.d.iii: planAllToOne EXECUTE branch with inputs_relevance but no matching source docs results in undefined sourceAnchorModelSlug',
  () => {
    const recipeStep = createMockRecipeStep(
      [{ document_key: FileType.business_case, relevance: 1.0, type: 'document', slug: 'thesis' }],
      false // EXECUTE job
    );
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument( // This doc does not match the relevance rule
        'doc-1',
        'gpt-4_0_feature_spec.md',
        'thesis',
        FileType.feature_spec
      ),
    ];
    const parentJob = createMockParentJob();

    const result = planAllToOne(sourceDocs, parentJob, recipeStep, '');
    const payload = result[0];

    assertExists(payload, 'Should create one job payload');
    if (isDialecticExecuteJobPayload(payload)) {
      assertEquals(
        payload.canonicalPathParams?.sourceAnchorModelSlug,
        undefined,
        'sourceAnchorModelSlug should be undefined when no source documents match the relevance rules'
      );
    } else {
      throw new Error('Expected an EXECUTE job payload');
    }
  }
);

Deno.test('104.d.iv: planAllToOne EXECUTE branch throws error when relevance metadata is missing but document inputs are required',
  () => {
    const recipeStep = createMockRecipeStep([], false); // Empty relevance rules, EXECUTE job
    recipeStep.inputs_required = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }
    ];
    const sourceDocs = [
      createMockSourceDocument(
        'doc-1',
        'gpt-4_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    assertThrows(
      () => {
        planAllToOne(sourceDocs, parentJob, recipeStep, '');
      },
      Error,
      'Missing relevance score for required document input business_case',
      'Should throw error when relevance metadata is missing for an EXECUTE job with document inputs'
    );
  }
);

Deno.test('104.e.i: planAllToOne PLAN branch throws error when relevance metadata is missing but document inputs are required',
  () => {
    const recipeStep = createMockRecipeStep(
      [], // Empty relevance rules
      true // PLAN job
    );
    // Add document inputs to inputs_required
    recipeStep.inputs_required = [
      { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
    ];

    const sourceDocs = [
      createMockSourceDocument(
        'doc-1',
        'gpt-4_0_business_case.md',
        'thesis',
        FileType.business_case
      ),
    ];
    const parentJob = createMockParentJob();

    assertThrows(
      () => {
        planAllToOne(sourceDocs, parentJob, recipeStep, '');
      },
      Error,
      'planAllToOne: Recipe step has document inputs but is missing inputs_relevance metadata, preventing anchor selection for canonical path params.',
      'Should throw error when relevance metadata is missing for a PLAN job with document inputs'
    );
  }
);




