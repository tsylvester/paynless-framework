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
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockResources = [
    {
      id: 'resource-1',
      project_id: 'proj-1',
      file_name: 'doc-a.md',
      resource_description: {
        type: 'rendered_document',
        document_key: 'doc-a',
        job_id: 'job-1',
      },
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
  const { documents }: ListStageDocumentsResponse = result.data;
  assertEquals(documents.length, 2);

  const docA = documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-a');
  assertExists(docA);
  assertEquals(docA.modelId, 'model-a');
  assertEquals(docA.lastRenderedResourceId, 'resource-1');

  const docB = documents.find((d: StageDocumentDescriptorDto) => d.documentKey === 'doc-b');
  assertExists(docB);
  assertEquals(docB.modelId, 'model-b');
  assertEquals(docB.lastRenderedResourceId, null);

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
  assertEquals(jobsSpies.eq.calls[4].args, ['project_id', PROJECT_ID]);

  // Assert that the resources query is now using an efficient filter
  const resourcesSpies = mockSupabase.spies.getLatestQueryBuilderSpies(
    'dialectic_project_resources',
  );
  assertExists(resourcesSpies);

  // Assert that the query still filters by resource type
  assertExists(resourcesSpies.eq);
  assertEquals(resourcesSpies.eq.calls.length, 1);
  assertEquals(resourcesSpies.eq.calls[0].args, [
    'resource_description->>type',
    'rendered_document',
  ]);

  // Assert that an efficient '.filter()' was used with the job IDs
  assertExists(resourcesSpies.filter);
  assertEquals(resourcesSpies.filter.calls.length, 1);
  assertEquals(
    resourcesSpies.filter.calls[0].args,
    ['resource_description->>job_id', 'in', '("job-1","job-2")'],
  );
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
  assertEquals(result.data.documents.length, 1);
  assertEquals(result.data.documents[0].lastRenderedResourceId, null);
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
  assertEquals(result.data.documents.length, 0);
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
  assertEquals(result.data.documents.length, 1);
  assertEquals(result.data.documents[0].documentKey, 'doc-a');
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
