import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { listStageDocuments } from './listStageDocuments.ts';
import {
  DialecticServiceRequest,
  ListStageDocumentsPayload,
  ListStageDocumentsResponse,
  StageDocumentDescriptorDto,
  DialecticProjectResourceRow,
} from './dialectic.interface.ts';

const USER_ID = 'user-abc';
const PROJECT_ID = 'project-xyz';

const payload: ListStageDocumentsPayload = {
  sessionId: 'session-123',
  stageSlug: 'synthesis',
  iterationNumber: 1,
  userId: USER_ID,
  projectId: PROJECT_ID,
};

Deno.test('listStageDocuments - Happy Path: returns normalized document descriptors and applies all security filters', async () => {
  const request: DialecticServiceRequest = {
    action: 'listStageDocuments',
    payload: payload,
  };

  const mockJobs = [
    {
      id: 'job-1',
      session_id: 'session-123',
      status: 'completed',
      payload: {
        document_key: 'doc-a',
        model_id: 'model-a',
        sourceContributionId: 'contrib-1',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-2',
      session_id: 'session-123',
      status: 'in_progress',
      payload: {
        document_key: 'doc-b',
        model_id: 'model-b',
        sourceContributionId: 'contrib-2',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockResources: DialecticProjectResourceRow[] = [
    {
      id: 'resource-1',
      project_id: 'proj-1',
      file_name: 'model-a_0_doc-a.md',
      resource_type: 'rendered_document',
      session_id: 'session-123',
      stage_slug: 'synthesis',
      iteration_number: 1,
      source_contribution_id: 'contrib-1',
      resource_description: {
        type: 'rendered_document',
        document_key: 'doc-a',
        job_id: 'job-1',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: 'proj-1/session_abc/iteration_1/3_synthesis/documents',
      user_id: USER_ID,
    },
  ];

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        select: { data: mockJobs, error: null },
      },
      'dialectic_project_resources': {
        select: { data: mockResources, error: null },
      },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const documents: ListStageDocumentsResponse = result.data;
  assertEquals(documents.length, 1);

  const docA = documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-a');
  assertExists(docA);
  assertEquals(docA.modelId, 'model-a');
  assertEquals(docA.latestRenderedResourceId, 'resource-1');
  assertEquals(docA.jobId, 'job-1');
  assertEquals(docA.status, 'completed');

  const docB = documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-b');
  assertEquals(docB, undefined);

  // Assert that the correct filters were applied for security and data narrowing
  const jobsSpies = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_generation_jobs',
  );
  assertExists(jobsSpies);
  assertExists(jobsSpies.eq);
  assertEquals(jobsSpies.eq.calls[0].args, ['session_id', 'session-123']);
  assertEquals(jobsSpies.eq.calls[1].args, ['payload->>stageSlug', 'synthesis']);
  assertEquals(jobsSpies.eq.calls[2].args, ['payload->>iterationNumber', '1']);
  assertEquals(jobsSpies.eq.calls[3].args, ['user_id', USER_ID]);
  // Assert exactly 4 eq calls (not 5) - the project_id filter should not exist
  assertEquals(jobsSpies.eq.calls.length, 4);
  // Assert none of the calls are for project_id
  for (const call of jobsSpies.eq.calls) {
    if (call.args[0] === 'project_id') {
      throw new Error('Unexpected project_id filter found in query - this column does not exist in dialectic_generation_jobs table');
    }
  }

  // Assert that the resources query uses column-based filters instead of JSON path queries
  const resourcesSpies = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_project_resources',
  );
  assertExists(resourcesSpies);

  // Assert that the query filters by resource_type column, not JSON path
  assertExists(resourcesSpies.eq);
  assertEquals(resourcesSpies.eq.calls.length, 4);
  assertEquals(resourcesSpies.eq.calls[0].args, [
    'resource_type',
    'rendered_document',
  ]);

  // Assert that the query filters by session_id column
  assertEquals(resourcesSpies.eq.calls[1].args, [
    'session_id',
    'session-123',
  ]);

  // Assert that the query filters by stage_slug column
  assertEquals(resourcesSpies.eq.calls[2].args, [
    'stage_slug',
    'synthesis',
  ]);

  // Assert that the query filters by iteration_number column
  assertEquals(resourcesSpies.eq.calls[3].args, [
    'iteration_number',
    1,
  ]);

  // Assert that no JSON path queries are used (no filter calls for job_id)
  assertExists(resourcesSpies.filter);
  assertEquals(resourcesSpies.filter.calls.length, 0);
});

Deno.test('listStageDocuments - Happy Path: handles jobs with no rendered resources', async () => {
  const mockJobs = [{
    id: 'job-1',
    session_id: 'session-123',
    status: 'in_progress',
    payload: { document_key: 'doc-a', model_id: 'model-a' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  assertEquals(result.data.length, 0);
});

Deno.test('listStageDocuments - Happy Path: returns empty array when no jobs found', async () => {
  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { select: { data: [], error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  assertEquals(result.data.length, 0);
});

Deno.test('listStageDocuments - Edge Case: filters out jobs without a document_key', async () => {
  const mockJobs = [
    {
      id: 'job-1', // Valid job
      session_id: 'session-123',
      status: 'completed',
      payload: { document_key: 'doc-a', model_id: 'model-a' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'job-2', // Planner job without a document_key
      session_id: 'session-123',
      status: 'completed',
      payload: { model_id: 'model-a' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { select: { data: mockJobs, error: null } },
      'dialectic_project_resources': { select: { data: [], error: null } },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  assertEquals(result.data.length, 0);
});

Deno.test('listStageDocuments - Error: returns 500 on database error', async () => {
  const request: DialecticServiceRequest = {
    action: 'listStageDocuments',
    payload: payload,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        select: { data: null, error: new Error('DB Error') },
      },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 500);
  assertExists(result.error);
});

Deno.test('listStageDocuments - Handles multiple rendered resources for same source_contribution_id by selecting latest', async () => {
  const mockJobs = [
    {
      id: 'job-1',
      session_id: 'session-123',
      status: 'completed',
      payload: {
        document_key: 'doc-a',
        model_id: 'model-a',
        sourceContributionId: 'contrib-123',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const sameUpdatedAt = new Date('2026-02-11T02:00:00.000Z').toISOString();
  const laterCreatedAt = new Date('2026-02-11T02:00:01.000Z').toISOString();

  const mockResources: DialecticProjectResourceRow[] = [
    {
      id: 'resource-1',
      project_id: PROJECT_ID,
      file_name: 'model-a_0_doc-a.md',
      resource_type: 'rendered_document',
      session_id: 'session-123',
      stage_slug: 'synthesis',
      iteration_number: 1,
      source_contribution_id: 'contrib-123',
      resource_description: {
        type: 'rendered_document',
        document_key: 'doc-a',
      },
      created_at: new Date('2026-02-11T01:59:59.000Z').toISOString(),
      updated_at: sameUpdatedAt,
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: 'project-xyz/session_abc/iteration_1/3_synthesis/documents',
      user_id: USER_ID,
    },
    {
      id: 'resource-2',
      project_id: PROJECT_ID,
      file_name: 'model-a_0_doc-a.md',
      resource_type: 'rendered_document',
      session_id: 'session-123',
      stage_slug: 'synthesis',
      iteration_number: 1,
      source_contribution_id: 'contrib-123',
      resource_description: {
        type: 'rendered_document',
        document_key: 'doc-a',
      },
      created_at: laterCreatedAt,
      updated_at: sameUpdatedAt,
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: 'project-xyz/session_abc/iteration_1/3_synthesis/documents',
      user_id: USER_ID,
    },
    {
      id: 'resource-3',
      project_id: PROJECT_ID,
      file_name: 'model-a_0_doc-a.md',
      resource_type: 'rendered_document',
      session_id: 'session-123',
      stage_slug: 'synthesis',
      iteration_number: 1,
      source_contribution_id: 'contrib-123',
      resource_description: {
        type: 'rendered_document',
        document_key: 'doc-a',
      },
      created_at: laterCreatedAt,
      updated_at: sameUpdatedAt,
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: 'project-xyz/session_abc/iteration_1/3_synthesis/documents',
      user_id: USER_ID,
    },
  ];

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        select: { data: mockJobs, error: null },
      },
      'dialectic_project_resources': {
        select: { data: mockResources, error: null },
      },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  assertEquals(result.data.length, 1);
  assertEquals(result.data[0].latestRenderedResourceId, 'resource-3');
});

Deno.test('listStageDocuments - Happy Path: correlates resources via source_contribution_id when job payload includes it', async () => {
  const mockJobs = [
    {
      id: 'job-1',
      session_id: 'session-123',
      status: 'completed',
      payload: {
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
      id: 'resource-1',
      project_id: PROJECT_ID,
      file_name: 'model-a_0_doc-a.md',
      resource_type: 'rendered_document',
      session_id: 'session-123',
      stage_slug: 'synthesis',
      iteration_number: 1,
      source_contribution_id: 'contrib-123',
      resource_description: {
        type: 'rendered_document',
        document_key: 'doc-a',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mime_type: 'text/markdown',
      size_bytes: 100,
      storage_bucket: 'dialectic-contributions',
      storage_path: 'project-xyz/session_abc/iteration_1/3_synthesis/documents',
      user_id: USER_ID,
    },
  ];

  const mockSupabase = createMockSupabaseClient(USER_ID, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        select: { data: mockJobs, error: null },
      },
      'dialectic_project_resources': {
        select: { data: mockResources, error: null },
      },
    },
  });

  const result = await listStageDocuments(
    payload,
    mockSupabase.client as unknown as SupabaseClient<Database>,
  );

  assertEquals(result.status, 200);
  assertExists(result.data);
  const documents: ListStageDocumentsResponse = result.data;
  assertEquals(documents.length, 1);

  const docA = documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-a');
  assertExists(docA);
  assertEquals(docA.modelId, 'model-a');
  assertEquals(docA.latestRenderedResourceId, 'resource-1');
  assertEquals(docA.jobId, 'job-1');
  assertEquals(docA.status, 'completed');

  // Assert that the resources query filters by columns including source_contribution_id correlation
  const resourcesSpies = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_project_resources',
  );
  assertExists(resourcesSpies);
  assertExists(resourcesSpies.eq);

  // Assert column-based filtering is used
  assertEquals(resourcesSpies.eq.calls[0].args, ['resource_type', 'rendered_document']);
  assertEquals(resourcesSpies.eq.calls[1].args, ['session_id', 'session-123']);
  assertEquals(resourcesSpies.eq.calls[2].args, ['stage_slug', 'synthesis']);
  assertEquals(resourcesSpies.eq.calls[3].args, ['iteration_number', 1]);

  // When source_contribution_id is available in job payload, the query should correlate via that field
  // Note: The exact implementation may vary, but we assert that column-based filtering is used
  // and that source_contribution_id can be used for correlation (this will be refined in step 31)
});
