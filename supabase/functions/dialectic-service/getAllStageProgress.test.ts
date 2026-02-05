import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';
import type { PathContext } from '../_shared/types/file_manager.types.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { getAllStageProgress } from './getAllStageProgress.ts';
import {
  GetAllStageProgressPayload,
  GetAllStageProgressResponse,
  StageProgressEntry,
  StageDocumentDescriptorDto,
  StageRunDocumentStatus,
  DialecticProjectResourceRow,
  UnifiedStageStatus,
} from './dialectic.interface.ts';

const OWNER_USER_ID = 'owner-user-id';
const OTHER_USER_ID = 'other-user-id';
const PROJECT_ID = 'project-xyz';
const SESSION_ID = 'session-123';
const ITERATION_NUMBER = 1;

function createMockUser(id: string): User {
  const user: User = {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };
  return user;
}

const validPayload: GetAllStageProgressPayload = {
  sessionId: SESSION_ID,
  iterationNumber: ITERATION_NUMBER,
  userId: OWNER_USER_ID,
  projectId: PROJECT_ID,
};

Deno.test('getAllStageProgress - returns empty array when no jobs exist for session', async () => {
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: [], error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const response: GetAllStageProgressResponse = result.data;
  assertEquals(response.length, 0);

  const projectsBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_projects') ?? [];
  assertEquals(projectsBuilders.length, 1);

  const jobsBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_generation_jobs') ?? [];
  assertEquals(jobsBuilders.length, 1);

  const resourcesBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_project_resources') ?? [];
  assertEquals(resourcesBuilders.length, 1);
});

Deno.test('getAllStageProgress - returns progress entries for each stage with documents', async () => {
  const thesisPathContext: PathContext = {
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    iteration: ITERATION_NUMBER,
    stageSlug: 'thesis',
    modelSlug: 'model-a',
    attemptCount: 0,
    documentKey: 'doc-a',
    fileType: FileType.RenderedDocument,
  };
  const thesisPath = constructStoragePath(thesisPathContext);
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-thesis-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-a', model_id: 'model-a' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-synthesis-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'in_progress',
      payload: { stageSlug: 'synthesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-b', model_id: 'model-b' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockResources: DialecticProjectResourceRow[] = [
    {
      id: 'resource-1',
      project_id: PROJECT_ID,
      file_name: thesisPath.fileName,
      resource_type: 'rendered_document',
      session_id: SESSION_ID,
      stage_slug: 'thesis',
      iteration_number: ITERATION_NUMBER,
      source_contribution_id: null,
      resource_description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: thesisPath.storagePath,
      user_id: OWNER_USER_ID,
    },
  ];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: mockResources, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const response: GetAllStageProgressResponse = result.data;
  assertEquals(response.length, 2);

  const thesisEntry = response.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertEquals(thesisEntry.documents.length, 1);
  assertExists(thesisEntry.stepStatuses);
  assertEquals(typeof thesisEntry.stepStatuses, 'object');
  assertExists(thesisEntry.stageStatus);
  const thesisStatus: UnifiedStageStatus = thesisEntry.stageStatus;
  assertEquals(['not_started', 'in_progress', 'completed', 'failed'].includes(thesisStatus), true);
  assertEquals(thesisEntry.documents[0].modelId, 'model-a');

  const synthesisEntry = response.find((e: StageProgressEntry) => e.stageSlug === 'synthesis');
  assertExists(synthesisEntry);
  assertEquals(synthesisEntry.documents.length, 1);
  assertExists(synthesisEntry.stepStatuses);
  assertExists(synthesisEntry.stageStatus);
  assertEquals(synthesisEntry.documents[0].modelId, 'model-b');

  const projectsBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_projects') ?? [];
  assertEquals(projectsBuilders.length, 1);

  const jobsBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_generation_jobs') ?? [];
  assertEquals(jobsBuilders.length, 1);
  const jobsSpies = mockSupabase.spies.getLatestQueryBuilderSpies('dialectic_generation_jobs');
  assertExists(jobsSpies);
  assertExists(jobsSpies.eq);
  assertEquals(jobsSpies.eq.calls[0].args[0], 'session_id');
  assertEquals(jobsSpies.eq.calls[1].args[0], 'payload->>iterationNumber');
  assertEquals(jobsSpies.eq.calls[2].args[0], 'user_id');
  const hasStageSlugFilter = jobsSpies.eq.calls.some((c: { args: unknown[] }) => c.args[0] === 'payload->>stageSlug');
  assertEquals(hasStageSlugFilter, false);

  const resourcesBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_project_resources') ?? [];
  assertEquals(resourcesBuilders.length, 1);
  const resourcesSpies = mockSupabase.spies.getLatestQueryBuilderSpies('dialectic_project_resources');
  assertExists(resourcesSpies);
  assertExists(resourcesSpies.eq);
  assertEquals(resourcesSpies.eq.calls[0].args[0], 'resource_type');
  assertEquals(resourcesSpies.eq.calls[1].args[0], 'session_id');
  assertEquals(resourcesSpies.eq.calls[2].args[0], 'iteration_number');
  const hasStageSlugResourceFilter = resourcesSpies.eq.calls.some((c: { args: unknown[] }) => c.args[0] === 'stage_slug');
  assertEquals(hasStageSlugResourceFilter, false);
});

Deno.test('getAllStageProgress - correctly maps job status to StageRunDocumentStatus', async () => {
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-a', model_id: 'model-a' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-2',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'in_progress',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-b', model_id: 'model-b' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-3',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'failed',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-c', model_id: 'model-c' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-4',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'retrying',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-d', model_id: 'model-d' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertExists(thesisEntry.stepStatuses);
  assertExists(thesisEntry.stageStatus);

  const docCompleted = thesisEntry.documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-a');
  assertExists(docCompleted);
  const expectedCompleted: StageRunDocumentStatus = 'completed';
  assertEquals(docCompleted.status, expectedCompleted);
  assertEquals(docCompleted.modelId, 'model-a');

  const docGenerating = thesisEntry.documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-b');
  assertExists(docGenerating);
  const expectedGenerating: StageRunDocumentStatus = 'generating';
  assertEquals(docGenerating.status, expectedGenerating);
  assertEquals(docGenerating.modelId, 'model-b');

  const docFailed = thesisEntry.documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-c');
  assertExists(docFailed);
  const expectedFailed: StageRunDocumentStatus = 'failed';
  assertEquals(docFailed.status, expectedFailed);
  assertEquals(docFailed.modelId, 'model-c');

  const docRetrying = thesisEntry.documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-d');
  assertExists(docRetrying);
  const expectedRetrying: StageRunDocumentStatus = 'retrying';
  assertEquals(docRetrying.status, expectedRetrying);
  assertEquals(docRetrying.modelId, 'model-d');
});

Deno.test('getAllStageProgress - correlates resources to jobs via document_key', async () => {
  const pathContext: PathContext = {
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    iteration: ITERATION_NUMBER,
    stageSlug: 'thesis',
    modelSlug: 'model-a',
    attemptCount: 0,
    documentKey: 'success_metrics',
    fileType: FileType.RenderedDocument,
    sourceGroupFragment: 'a0fc0d7d',
  };
  const constructed = constructStoragePath(pathContext);
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'success_metrics', model_id: 'model-a' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockResources: DialecticProjectResourceRow[] = [
    {
      id: 'resource-1',
      project_id: PROJECT_ID,
      file_name: constructed.fileName,
      resource_type: 'rendered_document',
      session_id: SESSION_ID,
      stage_slug: 'thesis',
      iteration_number: ITERATION_NUMBER,
      source_contribution_id: null,
      resource_description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: constructed.storagePath,
      user_id: OWNER_USER_ID,
    },
  ];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: mockResources, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertEquals(thesisEntry.documents.length, 1);
  const doc = thesisEntry.documents[0];
  assertEquals(doc.documentKey, 'success_metrics');
  assertEquals(doc.latestRenderedResourceId, 'resource-1');
  assertEquals(doc.jobId, 'job-1');
  assertEquals(doc.modelId, 'model-a');
});

Deno.test('getAllStageProgress - prefers sourceContributionId over document_key when correlating resources', async () => {
  const contribPathContext: PathContext = {
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    iteration: ITERATION_NUMBER,
    stageSlug: 'thesis',
    modelSlug: 'model-a',
    attemptCount: 0,
    documentKey: 'doc-a',
    fileType: FileType.RenderedDocument,
  };
  const contribPath = constructStoragePath(contribPathContext);
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-a',
        model_id: 'model-a',
        sourceContributionId: 'contrib-123',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockResources: DialecticProjectResourceRow[] = [
    {
      id: 'resource-from-contrib',
      project_id: PROJECT_ID,
      file_name: contribPath.fileName,
      resource_type: 'rendered_document',
      session_id: SESSION_ID,
      stage_slug: 'thesis',
      iteration_number: ITERATION_NUMBER,
      source_contribution_id: 'contrib-123',
      resource_description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: contribPath.storagePath,
      user_id: OWNER_USER_ID,
    },
  ];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: mockResources, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertEquals(thesisEntry.documents.length, 1);
  assertEquals(thesisEntry.documents[0].latestRenderedResourceId, 'resource-from-contrib');
  assertEquals(thesisEntry.documents[0].jobId, 'job-1');
});

Deno.test('getAllStageProgress - excludes jobs without document_key or model_id from documents', async () => {
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-valid',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, document_key: 'doc-a', model_id: 'model-a' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-no-document-key',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: { stageSlug: 'thesis', iterationNumber: ITERATION_NUMBER, model_id: 'model-b' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertEquals(thesisEntry.documents.length, 1);
  assertEquals(thesisEntry.documents[0].documentKey, 'doc-a');
  assertEquals(thesisEntry.documents[0].jobId, 'job-valid');
});

Deno.test('getAllStageProgress - returns 400 for missing or empty sessionId', async () => {
  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {},
  });

  const missingSessionId: GetAllStageProgressPayload = {
    sessionId: '',
    iterationNumber: ITERATION_NUMBER,
    userId: OWNER_USER_ID,
    projectId: PROJECT_ID,
  };

  const result = await getAllStageProgress(
    missingSessionId,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 400);
  assertExists(result.error);
  const hasProjectsQuery = mockSupabase.spies.fromSpy.calls.some(
    (c) => c.args[0] === 'dialectic_projects',
  );
  assertEquals(hasProjectsQuery, false);
});

function createMalformedPayloadMissingIteration(): Omit<GetAllStageProgressPayload, 'iterationNumber'> & { iterationNumber?: undefined } {
  return {
    sessionId: SESSION_ID,
    userId: OWNER_USER_ID,
    projectId: PROJECT_ID,
  };
}

Deno.test('getAllStageProgress - returns 400 for missing iterationNumber', async () => {
  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {},
  });

  const malformedPayload = createMalformedPayloadMissingIteration();

  const result = await getAllStageProgress(
    malformedPayload as unknown as GetAllStageProgressPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 400);
  assertExists(result.error);
});

Deno.test('getAllStageProgress - returns 400 for missing or empty userId', async () => {
  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {},
  });

  const payloadMissingUserId: GetAllStageProgressPayload = {
    sessionId: SESSION_ID,
    iterationNumber: ITERATION_NUMBER,
    userId: '',
    projectId: PROJECT_ID,
  };

  const result = await getAllStageProgress(
    payloadMissingUserId,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 400);
  assertExists(result.error);
});

Deno.test('getAllStageProgress - returns 400 for missing or empty projectId', async () => {
  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {},
  });

  const payloadMissingProjectId: GetAllStageProgressPayload = {
    sessionId: SESSION_ID,
    iterationNumber: ITERATION_NUMBER,
    userId: OWNER_USER_ID,
    projectId: '',
  };

  const result = await getAllStageProgress(
    payloadMissingProjectId,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 400);
  assertExists(result.error);
});

Deno.test('getAllStageProgress - returns 403 for non-owner user', async () => {
  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockSupabase = createMockSupabaseClient(OTHER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OTHER_USER_ID),
  );

  assertEquals(result.status, 403);
  assertExists(result.error);

  const projectsBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_projects') ?? [];
  assertEquals(projectsBuilders.length, 1);

  const jobsBuilders = mockSupabase.client.getHistoricBuildersForTable('dialectic_generation_jobs') ?? [];
  assertEquals(jobsBuilders.length, 0);
});

Deno.test('getAllStageProgress - stepStatuses is populated when jobs have planner_metadata.recipe_step_id', async () => {
  const recipeStepId1 = 'recipe-step-uuid-1';
  const recipeStepId2 = 'recipe-step-uuid-2';
  const stepKey1 = 'thesis_generate_business_case';
  const stepKey2 = 'thesis_review';

  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-a',
        model_id: 'model-a',
        planner_metadata: { recipe_step_id: recipeStepId1 },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-2',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'in_progress',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-b',
        model_id: 'model-b',
        planner_metadata: { recipe_step_id: recipeStepId2 },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockRecipeSteps = [
    { id: recipeStepId1, step_key: stepKey1 },
    { id: recipeStepId2, step_key: stepKey2 },
  ];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
      'dialectic_stage_recipe_steps': { select: { data: mockRecipeSteps, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertExists(thesisEntry.stepStatuses);
  assertEquals(thesisEntry.stepStatuses[stepKey1], 'completed');
  assertEquals(thesisEntry.stepStatuses[stepKey2], 'in_progress');
});

Deno.test('getAllStageProgress - stepStatuses correctly aggregates multiple jobs per step', async () => {
  const recipeStepId = 'recipe-step-uuid-same';
  const stepKey = 'thesis_generate_business_case';

  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-a',
        model_id: 'model-a',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-2',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-b',
        model_id: 'model-b',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-3',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'in_progress',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-c',
        model_id: 'model-c',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockRecipeSteps = [{ id: recipeStepId, step_key: stepKey }];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
      'dialectic_stage_recipe_steps': { select: { data: mockRecipeSteps, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertExists(thesisEntry.stepStatuses);
  assertEquals(thesisEntry.stepStatuses[stepKey], 'in_progress');
});

Deno.test('getAllStageProgress - stepStatuses handles jobs without planner_metadata.recipe_step_id', async () => {
  const recipeStepId = 'recipe-step-uuid-with-id';
  const stepKey = 'thesis_generate_business_case';

  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-with-step-id',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-a',
        model_id: 'model-a',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-without-step-id',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'in_progress',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-b',
        model_id: 'model-b',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockRecipeSteps = [{ id: recipeStepId, step_key: stepKey }];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
      'dialectic_stage_recipe_steps': { select: { data: mockRecipeSteps, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertEquals(thesisEntry.documents.length, 2);
  assertExists(thesisEntry.stepStatuses);
  assertEquals(Object.keys(thesisEntry.stepStatuses).length, 1);
  assertEquals(thesisEntry.stepStatuses[stepKey], 'completed');
});

Deno.test('getAllStageProgress - stepStatuses maps recipe_step_id to step_key correctly', async () => {
  const recipeStepId = 'uuid-123';
  const stepKey = 'thesis_generate_business_case';

  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-1',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-a',
        model_id: 'model-a',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockRecipeSteps = [{ id: recipeStepId, step_key: stepKey }];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
      'dialectic_stage_recipe_steps': { select: { data: mockRecipeSteps, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertExists(thesisEntry.stepStatuses);
  assertEquals(thesisEntry.stepStatuses[stepKey], 'completed');
});

Deno.test('getAllStageProgress - stepStatuses derives failed when any job for that step has status failed', async () => {
  const recipeStepId = 'recipe-step-uuid-failed';
  const stepKey = 'thesis_generate_business_case';

  const mockProject = { id: PROJECT_ID, user_id: OWNER_USER_ID };
  const mockJobs = [
    {
      id: 'job-completed',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'completed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-a',
        model_id: 'model-a',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-failed',
      session_id: SESSION_ID,
      user_id: OWNER_USER_ID,
      status: 'failed',
      payload: {
        stageSlug: 'thesis',
        iterationNumber: ITERATION_NUMBER,
        document_key: 'doc-b',
        model_id: 'model-b',
        planner_metadata: { recipe_step_id: recipeStepId },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const mockRecipeSteps = [{ id: recipeStepId, step_key: stepKey }];

  const mockSupabase = createMockSupabaseClient(OWNER_USER_ID, {
    genericMockResults: {
      'dialectic_projects': { select: { data: [mockProject], error: null } },
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
      'dialectic_stage_recipe_steps': { select: { data: mockRecipeSteps, error: null } },
    },
  });

  const result = await getAllStageProgress(
    validPayload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
    createMockUser(OWNER_USER_ID),
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const thesisEntry = result.data.find((e: StageProgressEntry) => e.stageSlug === 'thesis');
  assertExists(thesisEntry);
  assertExists(thesisEntry.stepStatuses);
  assertEquals(thesisEntry.stepStatuses[stepKey], 'failed');
});
