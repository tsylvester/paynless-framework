import { assertEquals, assertExists } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.190.0/testing/bdd.ts";
import { stub } from "https://deno.land/std@0.190.0/testing/mock.ts";
import { fetchProcessTemplate } from "./fetchProcessTemplate.ts";
import { logger } from "../_shared/logger.ts";
import type { FetchProcessTemplatePayload, DialecticStage, DialecticStageTransition, DialecticProcessTemplate } from "./dialectic.interface.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig, type IMockSupabaseClient } from '../_shared/supabase.mock.ts';

describe("fetchProcessTemplate", () => {
  let mockDbClient: IMockSupabaseClient | null = null;
  let supabaseTestSetup: ReturnType<typeof createMockSupabaseClient> | null = null;
  let infoStub: any, errorStub: any;

  const setup = (config: MockSupabaseDataConfig = {}) => {
    supabaseTestSetup = createMockSupabaseClient('test-user-id', config);
    mockDbClient = supabaseTestSetup.client;
    infoStub = stub(logger, "info", () => {});
    errorStub = stub(logger, "error", () => {});
  };

  afterEach(() => {
    infoStub?.restore();
    errorStub?.restore();
    supabaseTestSetup?.clearAllStubs?.();
  });

  it("should return 400 if templateId is not provided", async () => {
    setup();
    const payload: FetchProcessTemplatePayload = { templateId: "" };
    const result = await fetchProcessTemplate(mockDbClient as any, payload);
    assertExists(result.error);
    assertEquals(result.status, 400);
    assertEquals(result.error?.code, "MISSING_PARAM");
  });

  it("should return 404 if the process template is not found", async () => {
    setup({
      genericMockResults: {
        'dialectic_process_templates': {
          select: { data: [], error: null, count: 0 }
        }
      }
    });
    const payload: FetchProcessTemplatePayload = { templateId: "non-existent-id" };
    const result = await fetchProcessTemplate(mockDbClient as any, payload);
    assertExists(result.error);
    assertEquals(result.status, 404);
    assertEquals(result.error?.code, 'NOT_FOUND');
  });

  it("should successfully fetch a full process template with stages and transitions", async () => {
    const templateId = "template-1";
    const payload: FetchProcessTemplatePayload = { templateId };

    const mockTemplateData: DialecticProcessTemplate = { id: templateId, name: "Test Template", starting_stage_id: "stage-a", created_at: '', description: null };
    const mockTransitionsData: DialecticStageTransition[] = [
      { id: "t-1", process_template_id: templateId, source_stage_id: 'stage-a', target_stage_id: 'stage-b', condition_description: null, created_at: '' },
      { id: "t-2", process_template_id: templateId, source_stage_id: 'stage-b', target_stage_id: 'stage-c', condition_description: null, created_at: '' },
    ];
    const mockStagesData: DialecticStage[] = [
      { id: 'stage-a', display_name: 'Stage A', slug: 'stage-a', description: null, default_system_prompt_id: null, expected_output_template_ids: [], active_recipe_instance_id: null, recipe_template_id: null, created_at: '' },
      { id: 'stage-b', display_name: 'Stage B', slug: 'stage-b', description: null, default_system_prompt_id: null, expected_output_template_ids: [], active_recipe_instance_id: null, recipe_template_id: null, created_at: '' },
      { id: 'stage-c', display_name: 'Stage C', slug: 'stage-c', description: null, default_system_prompt_id: null, expected_output_template_ids: [], active_recipe_instance_id: null, recipe_template_id: null, created_at: '' },
    ];
    
    setup({
        genericMockResults: {
            'dialectic_process_templates': {
              select: { data: [mockTemplateData], error: null, count: 1 }
            },
            'dialectic_stage_transitions': {
              select: { data: mockTransitionsData, error: null, count: mockTransitionsData.length }
            },
            'dialectic_stages': {
              select: { data: mockStagesData, error: null, count: mockStagesData.length }
            },
        }
    });

    const { data, error, status } = await fetchProcessTemplate(mockDbClient as any, payload);

    assertEquals(status, 200);
    assertExists(data);
    assertEquals(data.id, templateId);
    assertEquals(data.stages.length, 3);
    assertEquals(data.transitions.length, 2);
    assertEquals(error, undefined);
  });

   it("should return a template with only a starting stage if no transitions exist", async () => {
    const templateId = "template-no-transitions";
    const payload: FetchProcessTemplatePayload = { templateId };

    const mockTemplateData: DialecticProcessTemplate = { id: templateId, name: 'Single Stage Template', starting_stage_id: 'stage-start', created_at: '', description: null };
    const mockStageData: DialecticStage[] = [{ id: 'stage-start', display_name: 'Start', slug: 'start', description: null, default_system_prompt_id: null, expected_output_template_ids: [], active_recipe_instance_id: null, recipe_template_id: null, created_at: '' }];

    setup({
        genericMockResults: {
            'dialectic_process_templates': {
              select: { data: [mockTemplateData], error: null, count: 1 }
            },
            'dialectic_stage_transitions': {
              select: { data: [], error: null, count: 0 }
            },
            'dialectic_stages': {
              select: { data: mockStageData, error: null, count: 1 }
            }
        }
    });

    const { data, error, status } = await fetchProcessTemplate(mockDbClient as any, payload);

    assertEquals(status, 200);
    assertExists(data);
    assertEquals(data.stages.length, 1);
    assertEquals(data.stages[0].id, 'stage-start');
    assertEquals(data.transitions.length, 0);
    assertEquals(error, undefined);
  });
}); 