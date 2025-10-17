import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
import { spy, stub, Spy } from "jsr:@std/testing@0.225.1/mock";
import {
  assembleTurnPrompt,
} from "./assembleTurnPrompt.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssembledPrompt,
  AssembleTurnPromptDeps,
  RenderFn,
} from "./prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from "../supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockFileManagerService } from "../services/file_manager.mock.ts";
import { FileType, FileRecord } from "../types/file_manager.types.ts";
import { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import {
  type DialecticRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../utils/type_guards.ts";

Deno.test("assembleTurnPrompt", async (t) => {
  let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
  let denoEnvStub: any = null;
  const consoleSpies: { error?: Spy<Console>; warn?: Spy<Console> } = {};
  
  const mockGatherContext = spy(async () => { return { user_objective: "mock user objective", domain: "Software Development", agent_count: 1, context_description: "A test context", original_user_request: "The original request", prior_stage_ai_outputs: "", prior_stage_user_feedback: "", deployment_context: null, reference_documents: null, constraint_boundaries: null, stakeholder_considerations: null, deliverable_format: null } });
  const mockRender = spy(() => "rendered turn prompt");
  const mockFileManager = createMockFileManagerService();

  const setup = (
    config: MockSupabaseDataConfig = {},
  ) => {
    denoEnvStub = stub(Deno.env, "get", (key: string) => {
      if (key === "SB_CONTENT_STORAGE_BUCKET") {
        return "test-bucket";
      }
      return undefined;
    });

    mockSupabaseSetup = createMockSupabaseClient(undefined, config);

    consoleSpies.error = spy(console, "error");
    consoleSpies.warn = spy(console, "warn");


    return {
      client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      spies: mockSupabaseSetup.spies,
    };
  };

  const teardown = () => {
    denoEnvStub?.restore();
    consoleSpies.error?.restore();
    consoleSpies.warn?.restore();
    
    if (mockSupabaseSetup) {
      mockSupabaseSetup.clearAllStubs?.();
    }
  };

  const defaultRecipeStep: DialecticRecipeStep = {
    id: "step-123",
    branch_key: "executive_summary",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    execution_order: 1,
    output_type: "RenderedDocument",
    parallel_group: null,
    config_override: null,
    job_type: "EXECUTE",
    prompt_type: "Turn",
    step_name: "generate-executive-summary",
    granularity_strategy: "all_to_one",
    inputs_required: [{ type: "header_context", required: true }],
    inputs_relevance: [],
    outputs_required: [{
      type: "RenderedDocument",
      document_key: "executive_summary",
    }],
    prompt_template_id: "pt-exec-summary-123",
    step_key: "generate-executive-summary",
    step_slug: "generate-executive-summary",
    instance_id: "instance-123",
    is_skipped: false,
    object_filter: {},
    output_overrides: {},
    template_step_id: null,
  };

  const defaultProject: ProjectContext = {
    id: "proj-123",
    user_id: "user-123",
    project_name: "Test Project Objective",
    initial_user_prompt: "This is the initial user prompt content.",
    initial_prompt_resource_id: null,
    selected_domain_id: "domain-123",
    dialectic_domains: { name: "Software Development Domain" },
    process_template_id: "pt-123",
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
    repo_url: null,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const defaultSession: SessionContext = {
    id: "sess-123",
    project_id: "proj-123",
    selected_model_ids: ["model-1", "model-2"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_stage_id: "stage-123",
    iteration_count: 1,
    session_description: "Test session",
    status: "pending_thesis",
    associated_chat_id: null,
    user_input_reference_url: null,
  };

  const defaultStage: StageContext = {
    id: "stage-123",
    system_prompts: { prompt_text: "Default system prompt" },
    domain_specific_prompt_overlays: [],
    slug: "synthesis",
    display_name: "Synthesis",
    description: "Synthesis stage",
    created_at: new Date().toISOString(),
    default_system_prompt_id: "dsp-123",
    recipe_step: defaultRecipeStep,
    active_recipe_instance_id: null,
    expected_output_template_ids: [],
    recipe_template_id: null,
  };

  const mockTurnJob: DialecticJobRow = {
    id: "job-turn-123",
    job_type: 'EXECUTE',
    payload: {
        job_type: "EXECUTE",
        model_id: "model-123",
        projectId: defaultProject.id,
        sessionId: defaultSession.id,
        stageSlug: defaultStage.slug,
        iterationNumber: 1,
        walletId: "wallet-123",
        header_context_resource_id: "header-context-id",
        document_key: "executive_summary",
        document_specific_data: {
            title: "Project Executive Summary",
            points_to_cover: ["Problem", "Solution", "Market"]
        }
    },
    session_id: defaultSession.id,
    stage_slug: defaultStage.slug,
    iteration_number: 1,
    status: 'pending',
    user_id: defaultProject.user_id,
    is_test_job: false,
    created_at: new Date().toISOString(),
    attempt_count: 0,
    completed_at: null,
    error_details: null,
    parent_job_id: null,
    results: null,
    max_retries: 3,
    prerequisite_job_id: null,
    started_at: null,
    target_contribution_id: null,
  };

  const headerContextContent = {
    system_materials: {
        shared_plan: "This is the shared plan for all documents."
    },
    files_to_generate: [
        { document_key: "executive_summary", template_filename: "summary_template.md" },
        { document_key: "technical_design", template_filename: "design_template.md" },
    ]
  };

  const documentTemplateContent = "## {title}\n\nCover these points: {points_to_cover}";
  const designTemplateContent = "Design Style: {custom_style}";


  await t.step("should correctly assemble and persist a turn prompt", async () => {
      const mockFileRecord: FileRecord = {
        id: "mock-turn-resource-id-789",
        project_id: defaultProject.id,
        file_name: "turn_prompt.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
      };

      const config: MockSupabaseDataConfig = {
        storageMock: {
            downloadResult: (bucket, path) => {
                if (path.includes("header-context-id")) {
                    return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                if (path.includes("summary_template.md")) {
                    return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
            },
        }
      };

      const { client } = setup(config);
      mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

      try {
        const deps: AssembleTurnPromptDeps = {
          dbClient: client,
          job: mockTurnJob,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          gatherContext: mockGatherContext,
          render: mockRender,
          fileManager: mockFileManager,
        };
        const result: AssembledPrompt = await assembleTurnPrompt(deps);

        const expectedPromptContent = "## Project Executive Summary\n\nCover these points: Problem, Solution, Market";
        
        assertEquals(result.promptContent, expectedPromptContent);
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
        
        assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
        const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
        assertEquals(uploadContext.fileContent, expectedPromptContent);
      } finally {
        teardown();
      }
    },
  );

  await t.step("should throw an error if the header context cannot be fetched", async () => {
    const config: MockSupabaseDataConfig = {
        storageMock: {
            downloadResult: () => Promise.resolve({ data: null, error: new Error("Storage Error") }),
        }
      };

    const { client } = setup(config);
    
    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to download header context file from storage: Storage Error"
    );
    } finally {
      teardown();
    }
  });

  await t.step("should correctly apply user-specific overlay values", async () => {
    const userOverlay = { "custom_style": "formal" };
    const projectWithUserOverlay: ProjectContext = {
      ...defaultProject,
      user_domain_overlay_values: userOverlay,
    };

    const jobForDesignDoc: DialecticJobRow = {
        ...mockTurnJob,
        payload: {
            job_type: "EXECUTE",
            model_id: "model-123",
            projectId: defaultProject.id,
            sessionId: defaultSession.id,
            stageSlug: defaultStage.slug,
            iterationNumber: 1,
            walletId: "wallet-123",
            header_context_resource_id: "header-context-id",
            document_key: "technical_design",
            document_specific_data: {
                title: "Technical Design",
                points_to_cover: []
            }
        }
    };

    const mockFileRecord: FileRecord = {
        id: "mock-overlay-record-id",
        project_id: defaultProject.id,
        file_name: "turn_prompt_overlay.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt_overlay.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
      };

    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              if (path.includes("design_template.md")) {
                  return Promise.resolve({ data: new Blob([designTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };

    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    try {
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobForDesignDoc,
        project: projectWithUserOverlay,
        session: defaultSession,
        stage: defaultStage,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result = await assembleTurnPrompt(deps);

      assertEquals(result.promptContent, "Design Style: formal");
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if the document template cannot be fetched", async () => {
    const config: MockSupabaseDataConfig = {
        storageMock: {
            downloadResult: (bucket, path) => {
                if (path.includes("header-context-id")) {
                    return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                // Fail the template download
                return Promise.resolve({ data: null, error: new Error("Template Not Found") });
            },
        }
      };

    const { client } = setup(config);
    
    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to download document template file summary_template.md from storage: Template Not Found"
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if session has no selected models", async () => {
    const { client } = setup();
    const sessionWithNoModels: SessionContext = {
      ...defaultSession,
      selected_model_ids: [],
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: mockTurnJob,
                project: defaultProject,
                session: sessionWithNoModels,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Session must have at least one selected model.",
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if fileManager.uploadAndRegisterFile fails", async () => {
    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              if (path.includes("summary_template.md")) {
                  return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };
    const { client } = setup(config);
    // This test simulates a failure during the final step of saving the assembled prompt.
    mockFileManager.setUploadAndRegisterFileResponse(null, new Error("Upload failed"));

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to save turn prompt: Upload failed"
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if the fetched HeaderContext content is not valid JSON", async () => {
    const config: MockSupabaseDataConfig = {
        storageMock: {
            downloadResult: () => Promise.resolve({ data: new Blob(["{ not json }"]), error: null }),
        }
      };
    const { client } = setup(config);
    
    try {
      // This test ensures that the function validates the structure of the critical HeaderContext.
      const thrownError = await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: mockTurnJob,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
      );
      assert(
        thrownError instanceof Error &&
        thrownError.message.includes("Failed to parse header context content as JSON"),
      );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if document_key from payload is not in header context", async () => {
    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };
    const { client } = setup(config);
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Header context content is not valid JSON");
    }
    const jobWithInvalidDocKey: DialecticJobRow = {
        ...mockTurnJob,
        payload: {
            ...mockTurnJob.payload,
            document_key: "non_existent_key"
        }
    };
    
    try {
      // This test validates that the job's requested document is actually part of the stage's plan.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
              dbClient: client,
              job: jobWithInvalidDocKey,
              project: defaultProject,
              session: defaultSession,
              stage: defaultStage,
              gatherContext: mockGatherContext,
              render: mockRender,
              fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Document key 'non_existent_key' from job payload not found in header context's files_to_generate."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing", async () => {
    const { client } = setup();
    const jobWithNullPayload = {
      ...mockTurnJob,
      payload: null,
    };
    
    try {
      // This test uses a typecast, as permitted by the rules for testing error handling of malformed inputs.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithNullPayload as DialecticJobRow,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing or not a valid record."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing document_key", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    delete payload.document_key;
    const jobWithMissingDocKey: DialecticJobRow = {
        ...mockTurnJob,
        payload
    };
    
    try {
      // This test ensures the job provides the essential key for identifying which document to generate.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingDocKey,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'document_key'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing header_context_resource_id", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    delete payload.header_context_resource_id;
    const jobWithMissingHeaderId: DialecticJobRow = {
        ...mockTurnJob,
        payload
    };

    try {
      // This test validates that the job provides the link to its "blueprints".
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingHeaderId,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'header_context_resource_id'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED for deprecated step_info in payload", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithStepInfo: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        step_info: { old_data: "value" },
      },
    } as unknown as DialecticJobRow; // Typecast for testing invalid shape

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithStepInfo,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload.",
      );
    } finally {
      teardown();
    }
  });

  await t.step("should successfully assemble a prompt using a dynamic template specified in the HeaderContext", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-dynamic-template-id",
      project_id: defaultProject.id,
      file_name: "turn_prompt_dynamic.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt_dynamic.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };
  
    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              // This test explicitly uses the 'technical_design' key and its corresponding template.
              if (path.includes("design_template.md")) {
                  return Promise.resolve({ data: new Blob([designTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };
  
    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobForDesignDoc: DialecticJobRow = {
        ...mockTurnJob,
        payload: {
            ...mockTurnJob.payload,
            document_key: "technical_design",
            document_specific_data: { custom_style: "minimalist" }
        }
    };

    try {
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: jobForDesignDoc,
        project: defaultProject,
        session: defaultSession,
        stage: defaultStage,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps);
  
      const expectedPromptContent = "Design Style: minimalist";
      assertEquals(result.promptContent, expectedPromptContent);
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing 'model_id'", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    delete payload.model_id;
    const jobWithMissingModelSlug: DialecticJobRow = {
        ...mockTurnJob,
        payload,
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingModelSlug,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'model_id'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should successfully assemble a prompt using a dynamic template specified in the HeaderContext", async () => {
    const mockFileRecord: FileRecord = {
        id: "mock-dynamic-template-id-2",
        project_id: defaultProject.id,
        file_name: "turn_prompt_dynamic.md",
        storage_bucket: "test-bucket",
        storage_path: "path/to/mock/turn_prompt_dynamic.md",
        mime_type: "text/markdown",
        size_bytes: 123,
        resource_description: "A mock turn prompt",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: defaultProject.user_id,
        session_id: defaultSession.id,
        stage_slug: defaultStage.slug,
        iteration_number: 1,
        resource_type: "turn_prompt",
        source_contribution_id: null,
        feedback_type: "test",
        target_contribution_id: null,
      };
    
      const config: MockSupabaseDataConfig = {
        storageMock: {
            downloadResult: (bucket, path) => {
                if (path.includes("header-context-id")) {
                    return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
                }
                if (path.includes("design_template.md")) {
                    return Promise.resolve({ data: new Blob([designTemplateContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
            },
        }
      };
    
      const { client } = setup(config);
      mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    
      if(!isRecord(mockTurnJob.payload)) {
        throw new Error("Job payload is not valid JSON");
      }
      const jobForDesignDoc: DialecticJobRow = {
          ...mockTurnJob,
          payload: {
              ...mockTurnJob.payload,
              document_key: "technical_design",
              document_specific_data: { custom_style: "brutalist" }
          }
      };
  
      try {
        const deps: AssembleTurnPromptDeps = {
          dbClient: client,
          job: jobForDesignDoc,
          project: defaultProject,
          session: defaultSession,
          stage: defaultStage,
          gatherContext: mockGatherContext,
          render: mockRender,
          fileManager: mockFileManager,
        };
        const result: AssembledPrompt = await assembleTurnPrompt(deps);
    
        const expectedPromptContent = "Design Style: brutalist";
        assertEquals(result.promptContent, expectedPromptContent);
        assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
      } finally {
        teardown();
      }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload is missing 'model_id'", async () => {
    const { client } = setup();
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const payload = { ...mockTurnJob.payload };
    delete payload.model_id;
    const jobWithMissingModelSlug: DialecticJobRow = {
        ...mockTurnJob,
        payload,
    };

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: jobWithMissingModelSlug,
                project: defaultProject,
                session: defaultSession,
                stage: defaultStage,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Job payload is missing 'model_id'."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if stage context is missing 'recipe_step'", async () => {
    const { client } = setup();
    const stageWithoutRecipe: StageContext = {
      ...defaultStage,
      recipe_step: undefined,
    } as unknown as StageContext;

    try {
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: mockTurnJob,
                project: defaultProject,
                session: defaultSession,
                stage: stageWithoutRecipe,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Stage context is missing recipe_step."
    );
    } finally {
      teardown();
    }
  });

  await t.step("should throw an error if the prompt template ID from the recipe step is not found in the database", async () => {
    const stageWithMissingTemplate: StageContext = {
      ...defaultStage,
      recipe_step: {
        ...defaultStage.recipe_step,
        prompt_template_id: "non-existent-template",
      },
    } as unknown as StageContext;

    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              // This test should fail at template download from storage
              if (path.includes("summary_template.md")) {
                  return Promise.resolve({ data: null, error: new Error("Template Not Found from Storage") });
              }
              return Promise.resolve({ data: null, error: new Error("Unexpected file request in mock") });
          },
      }
    };
    const { client } = setup(config);

    try {
      // assembleTurnPrompt uses storage, not DB for templates.
      // This test verifies that a storage failure during template fetch is handled correctly.
      await assertRejects(
        async () => {
            const deps: AssembleTurnPromptDeps = {
                dbClient: client,
                job: mockTurnJob,
                project: defaultProject,
                session: defaultSession,
                stage: stageWithMissingTemplate,
                gatherContext: mockGatherContext,
                render: mockRender,
                fileManager: mockFileManager,
            };
            await assembleTurnPrompt(deps);
        },
        Error,
        "Failed to download document template file summary_template.md from storage: Template Not Found from Storage"
      )
    } finally {
        teardown();
    }
  });

  await t.step("should handle a recipe step that requires no additional source documents beyond the HeaderContext", async () => {
    const mockFileRecord: FileRecord = {
      id: "mock-no-sources-id-456",
      project_id: defaultProject.id,
      file_name: "turn_prompt_no_sources.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/turn_prompt_no_sources.md",
      mime_type: "text/markdown",
      size_bytes: 123,
      resource_description: "A mock turn prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "turn_prompt",
      source_contribution_id: null,
      feedback_type: "test",
      target_contribution_id: null,
    };
  
    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              if (path.includes("summary_template.md")) {
                  return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };
  
    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
  
    // This test explicitly verifies that the function can run successfully
    // when the only required input is the header context, proving it doesn't
    // fail when the source document list is empty.
    const stageWithNoExtraInputs: StageContext = {
        ...defaultStage,
    };

    try {
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: mockTurnJob,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithNoExtraInputs,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      const result: AssembledPrompt = await assembleTurnPrompt(deps);
  
      const expectedPromptContent = "## Project Executive Summary\n\nCover these points: Problem, Solution, Market";
      assertEquals(result.promptContent, expectedPromptContent);
      assertEquals(result.source_prompt_resource_id, mockFileRecord.id);
    } finally {
      teardown();
    }
  });

  await t.step("should correctly construct the prompt artifact filename when 'step_name' is missing from the recipe step", async () => {
    const mockFileRecord: FileRecord = { 
      id: "file-record-id-no-step", 
      project_id: "", 
      file_name: "", 
      storage_bucket: "", 
      storage_path: "", 
      mime_type: "", 
      size_bytes: 0, 
      resource_description: "", 
      created_at: "", 
      updated_at: "", 
      user_id: "", 
      session_id: "", 
      stage_slug: "", 
      iteration_number: 0, 
      resource_type: "", 
      source_contribution_id: null, 
      feedback_type: "test", 
      target_contribution_id: null, 
    };
    const config: MockSupabaseDataConfig = {
      storageMock: {
          downloadResult: (bucket, path) => {
              if (path.includes("header-context-id")) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContextContent)]), error: null });
              }
              if (path.includes("summary_template.md")) {
                  return Promise.resolve({ data: new Blob([documentTemplateContent]), error: null });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
          },
      }
    };
    const { client } = setup(config);
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);
    
    if(!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const stageWithNoStepName: StageContext = {
      ...defaultStage,
      recipe_step: {
        ...defaultStage.recipe_step,
        step_name: undefined,
      } as unknown as DialecticRecipeStep,
    };

    try {
      const deps: AssembleTurnPromptDeps = {
        dbClient: client,
        job: mockTurnJob,
        project: defaultProject,
        session: defaultSession,
        stage: stageWithNoStepName,
        gatherContext: mockGatherContext,
        render: mockRender,
        fileManager: mockFileManager,
      };
      await assembleTurnPrompt(deps);

      assert(mockFileManager.uploadAndRegisterFile.calls.length === 1, "uploadAndRegisterFile should be called once");
      const uploadContext = mockFileManager.uploadAndRegisterFile.calls[0].args[0];
      // We assert that stepName is undefined, which is the correct behavior.
      assertEquals(uploadContext.pathContext.stepName, undefined);
    } finally {
      teardown();
    }
  });

  await t.step("should throw PRECONDITION_FAILED if job payload contains deprecated step_info", async () => {
    const { client } = setup();
    if (!isRecord(mockTurnJob.payload)) {
      throw new Error("Job payload is not valid JSON");
    }
    const jobWithStepInfo: DialecticJobRow = {
      ...mockTurnJob,
      payload: {
        ...mockTurnJob.payload,
        step_info: { old_data: "value" },
      },
    };

    try {
      await assertRejects(
        async () => {
          const deps: AssembleTurnPromptDeps = {
            dbClient: client,
            job: jobWithStepInfo,
            project: defaultProject,
            session: defaultSession,
            stage: defaultStage,
            gatherContext: mockGatherContext,
            render: mockRender,
            fileManager: mockFileManager,
          };
          await assembleTurnPrompt(deps);
        },
        Error,
        "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload.",
      );
    } finally {
      teardown();
    }
  });
});
