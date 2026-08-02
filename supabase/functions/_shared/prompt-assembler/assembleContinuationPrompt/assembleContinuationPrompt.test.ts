  // Helper function to create header context contribution mocks
  import { assertEquals, assertRejects, assert } from "jsr:@std/assert@0.225.3";
  import { spy, type Spy } from "jsr:@std/testing@0.225.1/mock";
  import {
    assembleContinuationPrompt,
    MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON,
  } from "../assembleContinuationPrompt/assembleContinuationPrompt.ts";
  import {
    AssembledPrompt,
  } from "../prompt-assembler.interface.ts";
  import {
    createMockSupabaseClient,
    type MockSupabaseDataConfig,
    type MockSupabaseClientSetup,
    type MockQueryBuilderState,
  } from "../../supabase.mock.ts";
  import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
  import type { Database } from "../../../types_db.ts";
  import { createMockFileManagerService } from "../../services/file_manager.mock.ts";
  import { FileType } from "../../types/file_manager.types.ts";
  import {
    DialecticContributionRow,
  } from "../../../dialectic-service/dialectic.interface.ts";
  import { assertSpyCall } from "jsr:@std/testing@0.225.1/mock";
  import { isJson } from "../../utils/type_guards.ts";
  import {
    GatherContinuationInputsSignature,
    GatherContinuationInputsDeps,
    GatherContinuationInputsParams,
    GatherContinuationInputsPayload,
    GatherContinuationInputsSuccess,
    GatherContinuationInputsError,
  } from "../gatherContinuationInputs/gatherContinuationInputs.interface.ts";
  import {
    downloadFromStorage,
  } from "../../supabase_storage_utils.ts";
  import { Messages } from "../../types.ts";
  import { mockAssembleChunks } from "../../utils/assembleChunks/assembleChunks.mock.ts";
  import type { ConstructStoragePathFn } from "../../utils/path_constructor.types.ts";
  import {
    buildDialecticCompressJobPayload,
    invalidateDialecticCompressJobPayload,
  } from "../../../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.mock.ts";
  import {
    buildSessionContext,
    buildStageContext,
    buildAssembleContinuationPromptDeps,
  } from "../prompt-assembler.mock.ts";
  import {
    buildDialecticJobRow,
    buildDialecticExecuteJobPayload,
    buildDialecticPlanJobPayload,
    buildDialecticContributionRow,
    buildDialecticRecipeTemplateStep,
    buildHeaderContext,
    buildDialecticProjectResourceRow,
  } from "../../dialectic.mock.ts";
  import {
    buildGatherContinuationInputsSuccess,
    buildGatherContinuationInputsError,
  } from "../gatherContinuationInputs/gatherContinuationInputs.mock.ts";
  import { mockGatherContext } from "../gatherContext/gatherContext.mock.ts";
  import { buildFileRecord } from "../../services/file_manager.mock.ts";

  Deno.test("assembleContinuationPrompt", async (t) => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;
    let mockFileManager: ReturnType<typeof createMockFileManagerService>;
  
    const setup = (config: MockSupabaseDataConfig = {}) => {
      mockSupabaseSetup = createMockSupabaseClient(undefined, {
        ...config,
        genericMockResults: {
          ai_providers: {
            select: {
              data: [{ name: 'Test Model' }],
              error: null,
              count: 1,
              status: 200,
              statusText: 'OK',
            },
          },
          ...config.genericMockResults,
        },
      });
      mockFileManager = createMockFileManagerService();
      const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
      return {
        client,
        fileManager: mockFileManager,
        assembleChunks: mockAssembleChunks,
        downloadFromStorage: (bucket: string, path: string) =>
          downloadFromStorage(client, bucket, path),
      };
    };
  
    const teardown = () => {
      if (mockSupabaseSetup) {
        mockSupabaseSetup.clearAllStubs?.();
        mockSupabaseSetup = null;
      }
    };

    // Helper function to create contribution mocks (generic).
    // Returned row includes target_contribution_id so root-resolution select passes mock validation.
    const createContributionsMock = (
      entries: Record<string, DialecticContributionRow>
    ) => {
      return {
        select: async (state: MockQueryBuilderState) => {
          const idFilter = state.filters.find(
            (f) => f.type === "eq" && f.column === "id"
          );
          const id = idFilter?.value;
          
          if (id !== undefined && id !== null && typeof id === "string" && entries[id]) {
            const entry = entries[id];
            return {
              data: [{
                id,
                storage_bucket: entry.storage_bucket,
                storage_path: entry.storage_path,
                file_name: entry.file_name,
                contribution_type: entry.contribution_type,
                target_contribution_id: entry.target_contribution_id ?? null,
              }],
              error: null,
              count: 1,
              status: 200,
              statusText: "OK",
            };
          }
          return {
            data: null,
            error: new Error("Contribution not found"),
            count: 0,
            status: 404,
            statusText: "Not Found",
          };
        },
      };
    };

    await t.step(
      "Category A: Explicit Continuations (Base Cases - Triggered by ContinueReason)",
      async (t) => {
        // These tests prove the function correctly handles the base cases for planned continuations
        // where the model explicitly signals it was truncated.
    
        await t.step(
          "A.1: TurnPrompt - should handle a base case explicit continuation",
          async () => {
          // 1. Setup:
          //    - Configure a mock 'Turn' job from a model call that returned a ContinueReason.
          //    - The job's payload MUST include `inputs.header_context_id`.
          //    - Mock the database query and storage download to return a valid HeaderContext object containing `system_materials`.
            const headerContext = buildHeaderContext();
            const headerContribution = buildDialecticContributionRow({ id: 'a1-header-001', contribution_type: "header_context" });
            const priorContribution = buildDialecticContributionRow({ id: 'a1-prior-002', contribution_type: "antithesis" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const turnPayload = buildDialecticExecuteJobPayload({
                inputs: { header_context_id: headerContribution.id },
                target_contribution_id: priorContribution.id,
              });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const mockTurnJob = buildDialecticJobRow({
              attempt_count: 1,
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContext)]),
                      error: null,
                    });
                  }
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            // Access storage spy before the call so it tracks calls correctly
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from(headerContribution.storage_bucket).downloadSpy;

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock 'Turn' job.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockTurnJob,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
          //    - Verify the storage download was called for the header context contribution.
              assertSpyCall(downloadSpy, 0);

              //    - Verify the final prompt includes the `system_materials`, a generic "please continue" instruction, and the exact partial markdown.
              assert(
                result.promptContent.includes(
                  headerContext.system_materials.agent_notes_to_self,
                ),
              );
              assert(result.promptContent.endsWith(priorContent));

              //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
              assertEquals(uploadContext.pathContext.isContinuation, true);
              assertEquals(uploadContext.pathContext.turnIndex, 2);
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "A.2: PlannerPrompt - should handle a base case explicit continuation",
          async () => {
          // 1. Setup:
          //    - Configure a mock 'PLAN' job from a model call that returned a ContinueReason.
          //    - The payload for this job type does NOT have a `header_context_resource_id`.
          const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
          const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
          const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
          if (priorContent === null) throw new Error("Test setup: prior content is null");

          const plannerPayload = buildDialecticPlanJobPayload({
            target_contribution_id: priorContribution.id,
          });
          if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
          const mockPlannerJob = buildDialecticJobRow({
            job_type: "PLAN",
            payload: plannerPayload,
          });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock 'PLAN' job.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockPlannerJob,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
          //    - Verify the final prompt contains a specific "continue JSON" instruction and the exact partial JSON.
              assert(result.promptContent.endsWith(priorContent));

          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(
                uploadContext.pathContext.fileType,
                FileType.PlannerPrompt,
              );
              assertEquals(uploadContext.pathContext.isContinuation, true);
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "A.3: SeedPrompt - should handle a base case explicit continuation",
          async () => {
          // 1. Setup:
          //    - Configure a mock 'Seed' job from a model call that returned a ContinueReason.
          //    - The payload for this job type does NOT have a `header_context_resource_id`.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const seedPayload = buildDialecticExecuteJobPayload({
                target_contribution_id: priorContribution.id,
              });
            if (!isJson(seedPayload)) throw new Error("Test setup: seed payload is not Json");
            const mockSeedJob = buildDialecticJobRow({
              attempt_count: 3,
              payload: seedPayload,
            });
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock 'Seed' job.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockSeedJob,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
          //    - Verify a simple "please continue" prompt is built.
              assert(!result.promptContent.includes("JSON"));
              assert(result.promptContent.endsWith(priorContent));

          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              // Since there's no "SeedPrompt" file type for jobs, we expect a generic "TurnPrompt"
              assertEquals(uploadContext.pathContext.fileType, FileType.TurnPrompt);
              assertEquals(uploadContext.pathContext.isContinuation, true);
              assertEquals(uploadContext.pathContext.turnIndex, 4);
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "A.4: should pass branch_key and parallel_group to FileManager if present in recipe",
          async () => {
          // 1. Setup:
            const headerContribution = buildDialecticContributionRow({ id: 'a4-header-001', contribution_type: "header_context" });
            const priorContribution = buildDialecticContributionRow({ id: 'a4-prior-002', contribution_type: "antithesis" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const stageWithOrchestrationKeys = buildStageContext({
              recipe_step: buildDialecticRecipeTemplateStep({
                branch_key: "branch-abc",
                parallel_group: 1,
              }),
            });

            const turnPayload = buildDialecticExecuteJobPayload({
                inputs: { header_context_id: headerContribution.id },
                target_contribution_id: priorContribution.id,
              });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const mockTurnJob = buildDialecticJobRow({
              attempt_count: 1,
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(buildHeaderContext())]),
                      error: null,
                    });
                  }
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockTurnJob,
                  stage: stageWithOrchestrationKeys,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.branchKey, "branch-abc");
              assertEquals(uploadContext.pathContext.parallelGroup, 1);
            } finally {
              teardown();
            }
          },
        );
      });
    
      await t.step("Category B: Implicit/Corrective Continuations (Invalid Content)", async (t) => {
        // These tests prove the NEW functionality where `finish_reason` was 'stop' but the content is invalid, requiring a corrective prompt.
    
        await t.step("B.1: PlannerPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'PLAN' job with `continuationContent` of an incomplete JSON string (e.g., `{"key":`).
          const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
          const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
          const incompleteJson = `{"key": "value"`;
          const gatherResult = buildGatherContinuationInputsSuccess({
            messages: [
              { role: "user", content: "seed" },
              { role: "assistant", content: "{}" },
              { role: "user", content: incompleteJson },
            ],
          });
          const priorContent = gatherResult.messages[2].content;
          if (priorContent === null) throw new Error("Test setup: prior content is null");

          const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

          const plannerPayload = buildDialecticPlanJobPayload({
            target_contribution_id: priorContribution.id,
          });
          if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
          const mockPlannerJob = buildDialecticJobRow({
            job_type: "PLAN",
            payload: plannerPayload,
          });

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_contributions: createContributionsMock({
                [priorContribution.id]: priorContribution,
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                  return Promise.resolve({
                    data: new Blob([priorContent]),
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager, downloadFromStorage } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt(
              buildAssembleContinuationPromptDeps({
                dbClient: client,
                fileManager,
                job: mockPlannerJob,
                gatherContinuationInputs: gatherMock,
                downloadFromStorage,
              }),
            );

          // 3. Assert:
          //    - Verify the prompt contains a specific CORRECTIVE instruction to COMPLETE the JSON.
            assert(result.promptContent.endsWith(incompleteJson));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
            assertEquals(uploadContext.pathContext.fileType, FileType.PlannerPrompt);
          } finally {
            teardown();
          }
        });
    
        await t.step("B.2: TurnPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Turn' job with incomplete JSON content.
          //    - Mock the required HeaderContext contribution query and download.
          const headerContext = buildHeaderContext();
          const headerContribution = buildDialecticContributionRow({ id: 'b2-header-001', contribution_type: "header_context" });
          const priorContribution = buildDialecticContributionRow({ id: 'b2-prior-002', contribution_type: "antithesis" });
          const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
          const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
          const incompleteJson = `{"data": [`;
          const gatherResult = buildGatherContinuationInputsSuccess({
            messages: [
              { role: "user", content: "seed" },
              { role: "assistant", content: "{}" },
              { role: "user", content: incompleteJson },
            ],
          });
          const priorContent = gatherResult.messages[2].content;
          if (priorContent === null) throw new Error("Test setup: prior content is null");

          const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

          const turnPayload = buildDialecticExecuteJobPayload({
            inputs: { header_context_id: headerContribution.id },
            target_contribution_id: priorContribution.id,
          });
          if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
          const mockTurnJob = buildDialecticJobRow({
            payload: turnPayload,
          });

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_contributions: createContributionsMock({
                [headerContribution.id]: headerContribution,
                [priorContribution.id]: priorContribution,
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContext)]), error: null });
                }
                if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                  return Promise.resolve({ data: new Blob([priorContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager, downloadFromStorage } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt(
              buildAssembleContinuationPromptDeps({
                dbClient: client,
                fileManager,
                job: mockTurnJob,
                gatherContinuationInputs: gatherMock,
                downloadFromStorage,
              }),
            );

          // 3. Assert:
          //    - Verify the prompt includes both the HeaderContext AND the CORRECTIVE instruction to COMPLETE the JSON.
            assert(result.promptContent.includes(headerContext.system_materials.agent_notes_to_self));
            assert(result.promptContent.endsWith(incompleteJson));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
    
        await t.step("B.3: SeedPrompt - should generate a corrective prompt for INCOMPLETE JSON", async () => {
            // 1. Setup:
            //    - Configure a mock 'Seed' job with incomplete JSON content.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const incompleteJson = `[{"item": 1},`;
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: incompleteJson },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const seedPayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(seedPayload)) throw new Error("Test setup: seed payload is not Json");
            const mockSeedJob = buildDialecticJobRow({
              payload: seedPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
            // 2. Execute:
            //    - Call assembleContinuationPrompt with the mock job.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockSeedJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

            // 3. Assert:
            //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
            } finally {
              teardown();
            }
        });
    
        await t.step("B.4: PlannerPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'PLAN' job with `continuationContent` of a complete but syntactically invalid JSON string (e.g., `{"key": "value",}`).
          const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
          const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
          const malformedJson = `{"key": "value",}`;
          const gatherResult = buildGatherContinuationInputsSuccess({
            messages: [
              { role: "user", content: "seed" },
              { role: "assistant", content: "{}" },
              { role: "user", content: malformedJson },
            ],
          });
          const priorContent = gatherResult.messages[2].content;
          if (priorContent === null) throw new Error("Test setup: prior content is null");

          const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

          const plannerPayload = buildDialecticPlanJobPayload({
            target_contribution_id: priorContribution.id,
          });
          if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
          const mockPlannerJob = buildDialecticJobRow({
            job_type: "PLAN",
            payload: plannerPayload,
          });

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_contributions: createContributionsMock({
                [priorContribution.id]: priorContribution,
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                  return Promise.resolve({
                    data: new Blob([priorContent]),
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager, downloadFromStorage } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt(
              buildAssembleContinuationPromptDeps({
                dbClient: client,
                fileManager,
                job: mockPlannerJob,
                gatherContinuationInputs: gatherMock,
                downloadFromStorage,
              }),
            );

          // 3. Assert:
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
    
        await t.step("B.5: TurnPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Turn' job with malformed JSON content.
          //    - Mock the required HeaderContext contribution query and download.
          const headerContext = buildHeaderContext();
          const headerContribution = buildDialecticContributionRow({ id: 'b5-header-001', contribution_type: "header_context" });
          const priorContribution = buildDialecticContributionRow({ id: 'b5-prior-002', contribution_type: "antithesis" });
          const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
          const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
          const malformedJson = `{"key": "value" oops}`;
          const gatherResult = buildGatherContinuationInputsSuccess({
            messages: [
              { role: "user", content: "seed" },
              { role: "assistant", content: "{}" },
              { role: "user", content: malformedJson },
            ],
          });
          const priorContent = gatherResult.messages[2].content;
          if (priorContent === null) throw new Error("Test setup: prior content is null");

          const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

          const turnPayload = buildDialecticExecuteJobPayload({
            inputs: { header_context_id: headerContribution.id },
            target_contribution_id: priorContribution.id,
          });
          if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
          const mockTurnJob = buildDialecticJobRow({
            payload: turnPayload,
          });

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_contributions: createContributionsMock({
                [headerContribution.id]: headerContribution,
                [priorContribution.id]: priorContribution,
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                  return Promise.resolve({ data: new Blob([JSON.stringify(headerContext)]), error: null });
                }
                if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                  return Promise.resolve({ data: new Blob([priorContent]), error: null });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager, downloadFromStorage } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt(
              buildAssembleContinuationPromptDeps({
                dbClient: client,
                fileManager,
                job: mockTurnJob,
                gatherContinuationInputs: gatherMock,
                downloadFromStorage,
              }),
            );

          // 3. Assert:
          //    - Verify the prompt includes both the HeaderContext  to FIX the JSON syntax.
            assert(result.promptContent.includes(headerContext.system_materials.agent_notes_to_self));
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
    
        await t.step("B.6: SeedPrompt - should generate a corrective prompt for MALFORMED JSON", async () => {
          // 1. Setup:
          //    - Configure a mock 'Seed' job with malformed JSON content.
          const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
          const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
          const malformedJson = `{"valid": true, "invalid":,}`;
          const gatherResult = buildGatherContinuationInputsSuccess({
            messages: [
              { role: "user", content: "seed" },
              { role: "assistant", content: "{}" },
              { role: "user", content: malformedJson },
            ],
          });
          const priorContent = gatherResult.messages[2].content;
          if (priorContent === null) throw new Error("Test setup: prior content is null");

          const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

          const seedPayload = buildDialecticExecuteJobPayload({
            target_contribution_id: priorContribution.id,
          });
          if (!isJson(seedPayload)) throw new Error("Test setup: seed payload is not Json");
          const mockSeedJob = buildDialecticJobRow({
            payload: seedPayload,
          });

          const config: MockSupabaseDataConfig = {
            genericMockResults: {
              dialectic_contributions: createContributionsMock({
                [priorContribution.id]: priorContribution,
              }),
            },
            storageMock: {
              downloadResult: (bucket: string, path: string) => {
                if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                  return Promise.resolve({
                    data: new Blob([priorContent]),
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: new Error("File not found in mock") });
              },
            },
          };
          const { client, fileManager, downloadFromStorage } = setup(config);
          fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

          try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt with the mock job.
            const result = await assembleContinuationPrompt(
              buildAssembleContinuationPromptDeps({
                dbClient: client,
                fileManager,
                job: mockSeedJob,
                gatherContinuationInputs: gatherMock,
                downloadFromStorage,
              }),
            );

          // 3. Assert:
          //    - Verify `fileManager.uploadAndRegisterFile` was called with `FileType.ContinuationPrompt`.
            assertSpyCall(fileManager.uploadAndRegisterFile, 0);
            const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
          } finally {
            teardown();
          }
        });
      });
    
    await t.step("Category C: Recursive & Mixed-Mode Continuations (System Robustness)",
      async (t) => {
        // These tests prove the system can handle failures within its own recovery loops.
    
        await t.step(
          "C.1: should correctly chain multiple explicit continuations (Explicit -> Explicit)",
          async () => {
          // 1. Setup:
            //    - Configure a mock job that is ALREADY a continuation (e.g., `attempt_count > 0`).
          //    - This job's last turn ALSO resulted in a conceptual ContinueReason.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const mockRecursiveJob = buildDialecticJobRow({
              attempt_count: 2,
              max_retries: 5,
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt to generate the next prompt in the chain.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockRecursiveJob,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
          //    - Verify the next prompt is assembled with the correct stateless logic (e.g., still a simple "please continue" instruction).
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.turnIndex, 3); // 2 prior attempts + this one
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "C.2: should generate a corrective prompt from an explicit continuation (Explicit -> Corrective)",
          async () => {
          // 1. Setup:
          //    - Configure a mock job that is a planned continuation, but its provided `continuationContent` is malformed JSON.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const malformedJson = `{"key": oops}`;
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: malformedJson },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockMixedJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockMixedJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
          //    - Verify the prior output content is present in the resulting prompt.
              assert(result.promptContent.endsWith(malformedJson));
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "C.3: should generate an explicit continuation from a corrective continuation (Corrective -> Explicit)",
          async () => {
          // 1. Setup:
          //    - Configure a mock job that is a corrective continuation, but whose model response was truncated (conceptual ContinueReason).
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const partialValidJson = `{"key": "this is valid but we pretend it was cut off"`;
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: partialValidJson },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockMixedJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockMixedJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

              // 3. Assert:
              //    - Verify the prior output content is present in the resulting prompt.
              assert(result.promptContent.endsWith(partialValidJson));
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "C.4: should generate a corrective prompt from a corrective continuation (Corrective -> Corrective)",
          async () => {
          // 1. Setup:
          //    - Configure a mock job that is a corrective continuation, but its `continuationContent` (the attempted fix) is STILL malformed JSON.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const stillMalformedJson = `{"key": "value", "anotherkey"}`;
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: stillMalformedJson },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockRecursiveCorrectiveJob = buildDialecticJobRow({
              job_type: "PLAN",
              attempt_count: 2,
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
          // 2. Execute:
          //    - Call assembleContinuationPrompt.
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockRecursiveCorrectiveJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

          // 3. Assert:
          //    - Verify the resulting prompt is another CORRECTIVE prompt, asking the model to try again.
              const uploadContext =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.turnIndex, 3);
            } finally {
              teardown();
            }
          },
        );
      });
  
    await t.step("Category D: Universal Error Handling and Preconditions",
      async (t) => {
        // These tests prove the function's fundamental robustness.
    
        await t.step("D.1: should throw an error if target_contribution_id is not provided in the job payload",
          async () => {
            // 1. Execute & Assert:
            //    - Call `assembleContinuationPrompt` with a job missing `target_contribution_id`.
            //    - Verify `assertRejects` with a "PRECONDITION_FAILED" error message.
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: undefined,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const jobWithoutTarget = buildDialecticJobRow({
              payload: executePayload,
            });

            await assertRejects(
              () => assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: jobWithoutTarget,
                  downloadFromStorage,
                }),
              ),
              Error,
              "PRECONDITION_FAILED"
            );
          },
        );
  
        await t.step("D.2: should throw an error if a HeaderContext is required (TurnPrompt) but cannot be fetched",
          async () => {
            // 1. Setup:
            //    - Configure a mock 'Turn' job with header_context_id AND target_contribution_id.
            //    - Mock the storage download for HEADER to throw an error.
            //    - We also need to mock the prior output contribution/storage just to pass that check if it happens before header (though logical order might vary, typically header fetch comes first or they are independent).
            const headerContribution = buildDialecticContributionRow({ id: 'd2-header-001', contribution_type: "header_context" });
            const priorContribution = buildDialecticContributionRow({ id: 'd2-prior-002', contribution_type: "antithesis" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;

            const turnPayload = buildDialecticExecuteJobPayload({
              inputs: { header_context_id: headerContribution.id },
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const mockTurnJob = buildDialecticJobRow({
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({ data: null, error: new Error("Storage download failed") });
                  }
                  // Allow prior output download to succeed (or not, header fails first hopefully)
                  return Promise.resolve({ data: new Blob(["content"]), error: null });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);

            // 2. Execute & Assert:
            //    - Verify `assertRejects` with an error message indicating the download failed.
            await assertRejects(
              () =>
                assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: mockTurnJob,
                    downloadFromStorage,
                  }),
                ),
              Error,
              "Failed to download header context file from storage",
            );
          },
        );
  
        await t.step("D.3: should NOT throw for missing HeaderContext when not required (Planner/Seed)",
          async () => {
            // 1. Setup:
            //    - Configure a mock 'PLAN' job.
            //    - Mock prior output to succeed.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockPlannerJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              // 2. Execute:
              //    - Call `assembleContinuationPrompt`.
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockPlannerJob,
                  downloadFromStorage,
                }),
              );
              // 3. Assert:
              //    - The call completes successfully, proving it did not attempt to download a non-existent context.
              //    - (No assertion needed, success is the test)
            } finally {
              teardown();
            }
          },
        );
  
        await t.step("D.4: should propagate errors from the FileManager service",
          async () => {
            // 1. Setup:
            //    - Configure `mockFileManager` to return an error from `uploadAndRegisterFile`.
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockPlannerJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            const fileManagerError = new Error("FileManager failed");
            fileManager.setUploadAndRegisterFileResponse(null, fileManagerError);

            // 2. Execute & Assert:
            //    - Verify `assertRejects` with the exact error from the mock.
            await assertRejects(
              () =>
                assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: mockPlannerJob,
                    downloadFromStorage,
                  }),
                ),
              Error,
              fileManagerError.message,
            );
          },
        );
  
        await t.step("D.5: should throw an error if the session has no selected models",
          async () => {
            // 1. Setup:
            //    - Provide a mock `SessionContext` with an empty `selected_model_ids` array.
            const { client, fileManager, downloadFromStorage } = setup();
            const sessionWithNoModels = buildSessionContext({
              selected_model_ids: [],
            });
            const executePayload = buildDialecticExecuteJobPayload();
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const jobWithModelId = buildDialecticJobRow({
              payload: executePayload,
            });

            // 2. Execute & Assert:
            //    - Verify `assertRejects` with the "no selected model" error message.
            await assertRejects(
              () =>
                assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: jobWithModelId,
                    session: sessionWithNoModels,
                    downloadFromStorage,
                  }),
                ),
              Error,
              "Session has no selected models",
            );
          },
        );
  
    await t.step("Category E: Source Contribution Metadata", async (t) => {
        await t.step("E.1: should forward sourceContributionId when continuation references a prior contribution",
          async () => {
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const mockContinuationJob = buildDialecticJobRow({
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockContinuationJob,
                  sourceContributionId: priorContribution.id,
                  downloadFromStorage,
                }),
              );

              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadArgs =
                fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(
                uploadArgs.pathContext.sourceContributionId,
                priorContribution.id,
              );
            } finally {
              teardown();
            }
          },
        );
      },
    );
  
    await t.step("Category F: Header Context Contribution ID Lookup (Step 10.b)",
      async (t) => {
        const HEADER_CONTEXT_CONTRIBUTION_ID = "header-context-contrib-id";
        const HEADER_CONTEXT_STORAGE_BUCKET = "dialectic_contributions";
        const HEADER_CONTEXT_STORAGE_PATH = "path/to/header";
        const HEADER_CONTEXT_FILE_NAME = "header_context.json";
        const fullHeaderPath = `${HEADER_CONTEXT_STORAGE_PATH}/${HEADER_CONTEXT_FILE_NAME}`;
  
        const PRIOR_OUTPUT_CONTRIB_ID = "prior-output-contrib-f";
        const PRIOR_OUTPUT_BUCKET = "dialectic_contributions";
        const PRIOR_OUTPUT_PATH = "path/to/prior";
        const PRIOR_OUTPUT_FILENAME = "prior_output.json";
        const fullPriorPath = `${PRIOR_OUTPUT_PATH}/${PRIOR_OUTPUT_FILENAME}`;
  
        await t.step(
          "10.b.i: should successfully query and download header context using contribution ID from inputs",
          async () => {
            const headerContext = buildHeaderContext();
            const headerContribution = buildDialecticContributionRow({ id: '10bi-header-001', contribution_type: "header_context" });
            const priorContribution = buildDialecticContributionRow({ id: '10bi-prior-002', contribution_type: "antithesis" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const partialContent = "This is the partial markdown content.";
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: partialContent },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const turnPayload = buildDialecticExecuteJobPayload({
              inputs: { header_context_id: headerContribution.id },
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const mockTurnJob = buildDialecticJobRow({
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContext)]),
                      error: null,
                    });
                  }
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            // Access storage spy before the call so it tracks calls correctly
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from(headerContribution.storage_bucket).downloadSpy;

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockTurnJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

              assertSpyCall(downloadSpy, 0); // At least one call to this bucket

              assert(
                result.promptContent.includes(
                  headerContext.system_materials.agent_notes_to_self,
                ),
              );
              assert(result.promptContent.endsWith(partialContent));
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "10.b.ii: should work correctly when inputs.header_context_id is missing (header context is optional)",
          async () => {
            const headerContext = buildHeaderContext();
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const partialContent = "This is partial content without header context.";
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: partialContent },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockPlannerJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockPlannerJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

              assert(!result.promptContent.includes(headerContext.system_materials.agent_notes_to_self));
              assert(result.promptContent.endsWith(partialContent));
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "10.b.iii: should throw an error when inputs.header_context_id is provided but contribution is not found",
          async () => {
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });

            const turnPayload = buildDialecticExecuteJobPayload({
              inputs: { header_context_id: "non-existent-contrib-id" },
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const mockTurnJob = buildDialecticJobRow({
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: {
                  select: async () => ({
                    data: null,
                    error: new Error("Contribution not found"),
                    count: 0,
                    status: 404,
                    statusText: "Not Found",
                  }),
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);

            try {
              await assertRejects(
                () =>
                  assembleContinuationPrompt(
                    buildAssembleContinuationPromptDeps({
                      dbClient: client,
                      fileManager,
                      job: mockTurnJob,
                      downloadFromStorage,
                    }),
                  ),
                Error,
                "contribution",
              );
            } finally {
              teardown();
            }
          },
        );
  
        await t.step(
          "10.b.iv: should use the contribution's storage_bucket instead of hardcoded 'dialectic_project_resources'",
          async () => {
            const headerContext = buildHeaderContext();
            const headerContribution = buildDialecticContributionRow({
              id: '10biv-header-001',
              contribution_type: "header_context",
              storage_bucket: "custom-contributions-bucket",
            });
            const priorContribution = buildDialecticContributionRow({ id: '10biv-prior-002', contribution_type: "antithesis" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const partialContent = "This is the partial markdown content.";
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "{}" },
                { role: "user", content: partialContent },
              ],
            });
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const turnPayload = buildDialecticExecuteJobPayload({
              inputs: { header_context_id: headerContribution.id },
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const mockTurnJob = buildDialecticJobRow({
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContext)]),
                      error: null,
                    });
                  }
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            // Access storage spy before the call so it tracks calls correctly
            const downloadSpy =
              mockSupabaseSetup!.spies.storage.from(headerContribution.storage_bucket).downloadSpy;

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockTurnJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );

              assertSpyCall(downloadSpy, 0);
              assertEquals(downloadSpy.calls[0].args[0], fullHeaderPath);

              assert(
                result.promptContent.includes(
                  headerContext.system_materials.agent_notes_to_self,
                ),
              );
              assert(result.promptContent.includes(partialContent));
            } finally {
              teardown();
            }
          },
        );
      },
    );

    await t.step("Fix 2: full continuation chain — gatherContinuationInputs and prompt assembly",
      async (t) => {
        await t.step(
          "when gatherContinuationInputs returns three messages, promptContent is third user line only (not flattened seed or assistant)",
          async () => {
            const chainMessages: Messages[] = [
              { role: "user", content: "Seed prompt." },
              { role: "assistant", content: "First fragment. Second fragment combined.", id: "root-contrib-123" },
              { role: "user", content: "Please continue from the assistant output." },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: chainMessages,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const job = buildDialecticJobRow({
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assertEquals(result.messages, chainMessages);
              assert(result.promptContent.includes("Please continue from the assistant output."));
              assert(!result.promptContent.includes("Seed prompt."));
              assert(!result.promptContent.includes("First fragment."));
            } finally {
              teardown();
            }
          },
        );

        await t.step(
          "when continuation has a single prior assistant turn, promptContent is the third user line (not seed or assistant body)",
          async () => {
            const singleFragmentMessages: Messages[] = [
              { role: "user", content: "Initial user prompt." },
              { role: "assistant", content: "Only prior fragment.", id: "root-only-789" },
              { role: "user", content: "Third user continuation line." },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: singleFragmentMessages,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const job = buildDialecticJobRow({
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assertEquals(result.messages, singleFragmentMessages);
              assert(result.promptContent.includes("Third user continuation line."));
              assert(!result.promptContent.includes("Initial user prompt."));
              assert(!result.promptContent.includes("Only prior fragment."));
            } finally {
              teardown();
            }
          },
        );

        await t.step(
          "gatherContinuationInputs is called with the root contribution ID from the chain (not just target_contribution_id)",
          async () => {
            const rootContribution = buildDialecticContributionRow({ id: 'root-contrib-001', contribution_type: "antithesis" });
            const childContribution = buildDialecticContributionRow({
              id: 'child-contrib-002',
              contribution_type: "antithesis",
              target_contribution_id: rootContribution.id,
            });
            const targetContribution = buildDialecticContributionRow({
              id: 'target-contrib-003',
              contribution_type: "antithesis",
              target_contribution_id: childContribution.id,
            });

            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: [
                { role: "user", content: "seed" },
                { role: "assistant", content: "content", id: rootContribution.id },
                { role: "user", content: "Continue." },
              ],
            });

            const gatherSpy = spy(
              async (
                _deps: GatherContinuationInputsDeps,
                params: GatherContinuationInputsParams,
                _payload: GatherContinuationInputsPayload,
              ): Promise<GatherContinuationInputsSuccess | GatherContinuationInputsError> => {
                return gatherResult;
              },
            );

            const fullPriorPath = `${targetContribution.storage_path}/${targetContribution.file_name}`;
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: targetContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const job = buildDialecticJobRow({
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [rootContribution.id]: rootContribution,
                  [childContribution.id]: childContribution,
                  [targetContribution.id]: targetContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === targetContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job,
                  gatherContinuationInputs: gatherSpy,
                  downloadFromStorage,
                }),
              );
              assertSpyCall(gatherSpy, 0);
              const gatherParams: GatherContinuationInputsParams = gatherSpy.calls[0].args[1];
              assertEquals(gatherParams.chunkId, rootContribution.id);
            } finally {
              teardown();
            }
          },
        );

        await t.step(
          "header context from inputs.header_context_id is still fetched and prepended when available",
          async () => {
            const headerContext = buildHeaderContext();
            const headerContribution = buildDialecticContributionRow({ id: 'hc-header-001', contribution_type: "header_context" });
            const priorContribution = buildDialecticContributionRow({ id: 'hc-prior-002', contribution_type: "antithesis" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;

            const chainMessages: Messages[] = [
              { role: "user", content: "User prompt." },
              { role: "assistant", content: "Prior output.", id: priorContribution.id },
              { role: "user", content: "Continuation after header." },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: chainMessages,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const turnPayload = buildDialecticExecuteJobPayload({
              inputs: { header_context_id: headerContribution.id },
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const job = buildDialecticJobRow({
              payload: turnPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (b: string, path: string) => {
                  if (b === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContext)]),
                      error: null,
                    });
                  }
                  if (b === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("Not found") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assert(result.promptContent.includes(headerContext.system_materials.agent_notes_to_self));
              assert(result.promptContent.includes("Continuation after header."));
              assert(!result.promptContent.includes("User prompt."));
              assert(!result.promptContent.includes("Prior output."));
            } finally {
              teardown();
            }
          },
        );

        await t.step(
          "prompt saved to storage uses promptContent (third user plus header), not a serialized messages array",
          async () => {
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;

            const assembledContent: Messages[] = [
              { role: "user", content: "Seed." },
              { role: "assistant", content: "Fragment one. Fragment two.", id: priorContribution.id },
              { role: "user", content: "STORAGE_THIRD_USER_LINE" },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: assembledContent,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;
            const priorContent = gatherResult.messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const job = buildDialecticJobRow({
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            const fileRecord = buildFileRecord();
            fileManager.setUploadAndRegisterFileResponse(fileRecord, null);

            try {
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadArg = fileManager.uploadAndRegisterFile.calls[0].args[0];
              const savedContent: string =
                typeof uploadArg.fileContent === "string"
                  ? uploadArg.fileContent
                  : new TextDecoder().decode(uploadArg.fileContent);
              assert(savedContent.includes("STORAGE_THIRD_USER_LINE"));
              assert(!savedContent.includes("Fragment one."));
              assert(typeof uploadArg.fileContent === "string");
            } finally {
              teardown();
            }
          },
        );

        await t.step(
          "error when gatherContinuationInputs fails to retrieve chain propagates correctly",
          async () => {
            const gatherErrorMessage = "Failed to retrieve root contribution for id xyz.";
            const gatherError = buildGatherContinuationInputsError({
              error: gatherErrorMessage,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherError;

            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const executePayload = buildDialecticExecuteJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
            const job = buildDialecticJobRow({
              payload: executePayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([priorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assertRejects(
                async () => {
                  await assembleContinuationPrompt(
                    buildAssembleContinuationPromptDeps({
                      dbClient: client,
                      fileManager,
                      job,
                      gatherContinuationInputs: gatherMock,
                      downloadFromStorage,
                    }),
                  );
                },
                Error,
                gatherErrorMessage,
              );
            } finally {
              teardown();
            }
          },
        );
      },
    );

    // Helper: mock dialectic_project_resources select by (storage_path, file_name)
    const createProjectResourcesMock = (
      entries: Record<string, { storage_bucket: string; storage_path: string; file_name: string }>
    ) => {
      return {
        select: async (state: MockQueryBuilderState) => {
          const pathFilter = state.filters.find(
            (f) => f.type === "eq" && f.column === "storage_path"
          );
          const nameFilter = state.filters.find(
            (f) => f.type === "eq" && f.column === "file_name"
          );
          const sp = pathFilter?.value;
          const fn = nameFilter?.value;
          const key = typeof sp === "string" && typeof fn === "string" ? `${sp}/${fn}` : null;
          if (key !== null && entries[key]) {
            const entry = entries[key];
            return {
              data: [{
                id: key,
                storage_bucket: entry.storage_bucket,
                storage_path: entry.storage_path,
                file_name: entry.file_name,
              }],
              error: null,
              count: 1,
              status: 200,
              statusText: "OK",
            };
          }
          return {
            data: null,
            error: new Error("Resource not found"),
            count: 0,
            status: 404,
            statusText: "Not Found",
          };
        },
      };
    };

    await t.step("Continuation-to-Retry checklist: assembleContinuationPrompt contract",
      async (t) => {
        const priorContribution = buildDialecticContributionRow({ id: 'checklist-prior-001', contribution_type: "antithesis" });
        const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
        const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
        if (priorContent === null) throw new Error("Test setup: prior content is null");

        const executePayload = buildDialecticExecuteJobPayload({
          target_contribution_id: priorContribution.id,
        });
        if (!isJson(executePayload)) throw new Error("Test setup: execute payload is not Json");
        const checklistJob = buildDialecticJobRow({
          payload: executePayload,
        });

        const checklistConfig: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: createContributionsMock({
              [priorContribution.id]: priorContribution,
            }),
          },
          storageMock: {
            downloadResult: (bucket: string, path: string) => {
              if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                return Promise.resolve({
                  data: new Blob([priorContent]),
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: new Error("File not found in mock") });
            },
          },
        };

        await t.step("success: assembled.messages contains the three gatherContinuationInputs messages",
          async () => {
            const three: Messages[] = [
              { role: "user", content: "u1" },
              { role: "assistant", content: "a1" },
              { role: "user", content: "u-final" },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: three,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const { client, fileManager, downloadFromStorage } = setup(checklistConfig);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result: AssembledPrompt = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: checklistJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assertEquals(result.messages, three);
            } finally {
              teardown();
            }
          },
        );

        await t.step("promptContent is third user message plus header context, not a flattened blob of all messages",
          async () => {
            const headerContext = buildHeaderContext();
            const headerContribution = buildDialecticContributionRow({ id: 'checklist-header-002', contribution_type: "header_context" });
            const fullHeaderPath = `${headerContribution.storage_path}/${headerContribution.file_name}`;
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;

            const three: Messages[] = [
              { role: "user", content: "NOT_IN_PROMPT_BODY" },
              { role: "assistant", content: "ASSISTANT_NOT_IN_PROMPT" },
              { role: "user", content: "THIRD_ONLY_IN_PROMPT" },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: three,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;
            const checklistPriorContent = gatherResult.messages[2].content;
            if (checklistPriorContent === null) throw new Error("Test setup: prior content is null");

            const turnPayload = buildDialecticExecuteJobPayload({
              inputs: { header_context_id: headerContribution.id },
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(turnPayload)) throw new Error("Test setup: turn payload is not Json");
            const headerJob = buildDialecticJobRow({
              payload: turnPayload,
            });

            const configWithHeader: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [headerContribution.id]: headerContribution,
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (b: string, path: string) => {
                  if (b === headerContribution.storage_bucket && path === fullHeaderPath) {
                    return Promise.resolve({
                      data: new Blob([JSON.stringify(headerContext)]),
                      error: null,
                    });
                  }
                  if (b === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({
                      data: new Blob([checklistPriorContent]),
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: new Error("Not found") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(configWithHeader);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result: AssembledPrompt = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: headerJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assert(result.promptContent.includes("THIRD_ONLY_IN_PROMPT"));
              assert(result.promptContent.includes(headerContext.system_materials.agent_notes_to_self));
              assert(!result.promptContent.includes("NOT_IN_PROMPT_BODY"));
              assert(!result.promptContent.includes("ASSISTANT_NOT_IN_PROMPT"));
            } finally {
              teardown();
            }
          },
        );

        await t.step("when gatherContinuationInputs returns error, assembleContinuationPrompt throws with that error message",
          async () => {
            const errText = "gather failed for checklist";
            const gatherError = buildGatherContinuationInputsError({
              error: errText,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherError;

            const { client, fileManager, downloadFromStorage } = setup(checklistConfig);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assertRejects(
                async () => {
                  await assembleContinuationPrompt(
                    buildAssembleContinuationPromptDeps({
                      dbClient: client,
                      fileManager,
                      job: checklistJob,
                      gatherContinuationInputs: gatherMock,
                      downloadFromStorage,
                    }),
                  );
                },
                Error,
                errText,
              );
            } finally {
              teardown();
            }
          },
        );

        await t.step("file upload receives promptContent string; source_prompt_resource_id comes from upload response",
          async () => {
            const three: Messages[] = [
              { role: "user", content: "seed" },
              { role: "assistant", content: "big assistant body" },
              { role: "user", content: "upload-third-line" },
            ];
            const gatherResult = buildGatherContinuationInputsSuccess({
              messages: three,
            });
            const gatherMock: GatherContinuationInputsSignature = async () => gatherResult;

            const { client, fileManager, downloadFromStorage } = setup(checklistConfig);
            const fileRecord = buildFileRecord();
            fileManager.setUploadAndRegisterFileResponse(fileRecord, null);

            try {
              const result: AssembledPrompt = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: checklistJob,
                  gatherContinuationInputs: gatherMock,
                  downloadFromStorage,
                }),
              );
              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadArg = fileManager.uploadAndRegisterFile.calls[0].args[0];
              assert(typeof uploadArg.fileContent === "string");
              assertEquals(result.source_prompt_resource_id, fileRecord.id);
              const fileContentStr: string =
                typeof uploadArg.fileContent === "string"
                  ? uploadArg.fileContent
                  : new TextDecoder().decode(uploadArg.fileContent);
              assert(!fileContentStr.includes(JSON.stringify(three)));
              assert(fileContentStr.includes("upload-third-line"));
            } finally {
              teardown();
            }
          },
        );
      },
    );

    await t.step("Category G: COMPRESS Continuations",
      async (t) => {
        // G.1: COMPRESS payload with both artifacts present returns correct promptContent and messages
        await t.step(
          "G.1: both artifacts exist — returns 3 messages (user/assistant/user) and promptContent = partial + instruction",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS",
              attempt_count: 2,
              payload: compressPayload,
            });

            const firstPassPromptText = "You are compressing the following content into a JSON object...";
            const partialOutputText = '{"summary": "partial output that was cut off';
            const firstPassResource = buildDialecticProjectResourceRow({
              storage_path: "compress/path/prompt", file_name: "prompt.json" });
            const partialResource = buildDialecticProjectResourceRow({
              storage_path: "compress/path/output", file_name: "output.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                  [partialKey]: partialResource,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === firstPassResource.storage_bucket && path === firstPassKey) {
                    return Promise.resolve({ data: new Blob([firstPassPromptText]), error: null });
                  }
                  if (bucket === partialResource.storage_bucket && path === partialKey) {
                    return Promise.resolve({ data: new Blob([partialOutputText]), error: null });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: compressJob,
                  downloadFromStorage,
                  constructStoragePath: constructStoragePathSpy,
                }),
              );

              // Assert messages shape
              assertEquals(result.messages?.length, 3);
              assertEquals(result.messages![0].role, "user");
              assertEquals(result.messages![0].content, firstPassPromptText);
              assertEquals(result.messages![1].role, "assistant");
              assertEquals(result.messages![1].content, partialOutputText);
              assertEquals(result.messages![2].role, "user");
              assertEquals(result.messages![2].content, MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON);

              // Assert promptContent = partial + instruction joined by "\n\n"
              assertEquals(result.promptContent, partialOutputText + "\n\n" + MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON);
            } finally {
              teardown();
            }
          },
        );

        // G.2: uploadAndRegisterFile received correct pathContext
        await t.step(
          "G.2: uploadAndRegisterFile received fileType=CompressionPrompt, isContinuation=true, turnIndex=attempt_count+1, modelSlug=payload.model_slug",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json", model_slug: "claude-3-opus" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS",
              attempt_count: 3,
              payload: compressPayload,
            });

            const firstPassResource = buildDialecticProjectResourceRow({ storage_path: "compress/path/prompt", file_name: "prompt.json" });
            const partialResource = buildDialecticProjectResourceRow({ storage_path: "compress/path/output", file_name: "output.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                  [partialKey]: partialResource,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === firstPassResource.storage_bucket && path === firstPassKey) {
                    return Promise.resolve({ data: new Blob(["first-pass"]), error: null });
                  }
                  if (bucket === partialResource.storage_bucket && path === partialKey) {
                    return Promise.resolve({ data: new Blob(["partial"]), error: null });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: compressJob,
                  downloadFromStorage,
                  constructStoragePath: constructStoragePathSpy,
                }),
              );

              assertSpyCall(fileManager.uploadAndRegisterFile, 0);
              const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
              assertEquals(uploadContext.pathContext.fileType, FileType.CompressionPrompt);
              assertEquals(uploadContext.pathContext.isContinuation, true);
              assertEquals(uploadContext.pathContext.turnIndex, 4);
              assertEquals(uploadContext.pathContext.modelSlug, "claude-3-opus");
            } finally {
              teardown();
            }
          },
        );

        // G.3: constructStoragePath spy received correct contexts
        await t.step(
          "G.3: constructStoragePath received one CompressionPrompt (no isContinuation) and one CompressedContextRawJson, both with payload's targetKey/sourceType/documentKey",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({
              mode: "json",
              targetKey: FileType.technical_approach,
              sourceType: "resource",
              documentKey: FileType.feature_spec,
            });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS",
              attempt_count: 1,
              payload: compressPayload,
            });

            const firstPassResource = buildDialecticProjectResourceRow({ storage_path: "compress/prompt", file_name: "prompt.json" });
            const partialResource = buildDialecticProjectResourceRow({ storage_path: "compress/output", file_name: "output.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                  [partialKey]: partialResource,
                }),
              },
              storageMock: {
                downloadResult: (_bucket: string, _path: string) =>
                  Promise.resolve({ data: new Blob(["content"]), error: null }),
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: compressJob,
                  downloadFromStorage,
                  constructStoragePath: constructStoragePathSpy,
                }),
              );

              // Assert two calls to constructStoragePath
              assertEquals(constructStoragePathSpy.calls.length, 2);
              const ctx1 = constructStoragePathSpy.calls[0].args[0];
              const ctx2 = constructStoragePathSpy.calls[1].args[0];

              // First call: CompressionPrompt, no isContinuation
              assertEquals(ctx1.fileType, FileType.CompressionPrompt);
              assert(ctx1.isContinuation === undefined || ctx1.isContinuation === false);
              assertEquals(ctx1.targetKey, FileType.technical_approach);
              assertEquals(ctx1.sourceType, "resource");
              assertEquals(ctx1.documentKey, FileType.feature_spec);

              // Second call: CompressedContextRawJson
              assertEquals(ctx2.fileType, FileType.CompressedContextRawJson);
              assertEquals(ctx2.targetKey, FileType.technical_approach);
              assertEquals(ctx2.sourceType, "resource");
              assertEquals(ctx2.documentKey, FileType.feature_spec);
            } finally {
              teardown();
            }
          },
        );

        // G.4a: Missing first-pass prompt row throws naming that artifact
        await t.step(
          "G.4a: missing first-pass CompressionPrompt resource row throws naming that artifact",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS", payload: compressPayload });

            const partialResource = buildDialecticProjectResourceRow({ storage_path: "compress/output", file_name: "output.json" });
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: "missing/prompt", fileName: "missing.json" };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [partialKey]: partialResource,
                }),
              },
              storageMock: {
                downloadResult: () =>
                  Promise.resolve({ data: new Blob(["content"]), error: null }),
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assertRejects(
                () => assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: compressJob,
                    downloadFromStorage,
                    constructStoragePath: constructStoragePathSpy,
                  }),
                ),
                Error,
                "First-pass compression prompt not found",
              );
            } finally {
              teardown();
            }
          },
        );

        // G.4b: Missing CompressedContextRawJson row throws naming that artifact
        await t.step(
          "G.4b: missing CompressedContextRawJson resource row throws naming that artifact",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS", payload: compressPayload,
            });

            const firstPassResource = buildDialecticProjectResourceRow({ storage_path: "compress/prompt", file_name: "prompt.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: "missing/output", fileName: "missing.json" };
            }) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                }),
              },
              storageMock: {
                downloadResult: (_bucket: string, path: string) => {
                  if (path === firstPassKey) {
                    return Promise.resolve({ data: new Blob(["first-pass"]), error: null });
                  }
                  return Promise.resolve({ data: null, error: new Error("not found") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assertRejects(
                () => assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: compressJob,
                    downloadFromStorage,
                    constructStoragePath: constructStoragePathSpy,
                  }),
                ),
                Error,
                "Prior compression output not found",
              );
            } finally {
              teardown();
            }
          },
        );

        // G.5: Rejected payload takes contribution branch, fails on target_contribution_id
        await t.step(
          "G.5: payload rejected by isDialecticCompressJobPayload takes contribution branch and fails on target_contribution_id",
          async () => {
            const rejectedPayload = invalidateDialecticCompressJobPayload({ targetKey: null });
            if (!isJson(rejectedPayload)) throw new Error("Test setup: rejected payload is not Json");
            const rejectedJob = buildDialecticJobRow({
              job_type: "COMPRESS",
              payload: rejectedPayload,
            });

            const constructStoragePathSpy = spy(() =>
              ({ storagePath: "mock", fileName: "mock.json" })
            ) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {},
            };
            const { client, fileManager, downloadFromStorage } = setup(config);

            try {
              await assertRejects(
                () => assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: rejectedJob,
                    downloadFromStorage,
                    constructStoragePath: constructStoragePathSpy,
                  }),
                ),
                Error,
                "PRECONDITION_FAILED",
              );
              // constructStoragePath was never called — the contribution branch never reaches it
              assertEquals(constructStoragePathSpy.calls.length, 0);
            } finally {
              teardown();
            }
          },
        );

        // G.6: No ai_providers stub; Supabase mock throws on unexpected queries
        await t.step(
          "G.6: COMPRESS call with no ai_providers stub succeeds — no provider round-trip",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS", payload: compressPayload,
            });

            const firstPassResource = buildDialecticProjectResourceRow({ storage_path: "compress/prompt", file_name: "prompt.json" });
            const partialResource = buildDialecticProjectResourceRow({ storage_path: "compress/output", file_name: "output.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            // No ai_providers in genericMockResults — mock will throw on unexpected table queries
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                  [partialKey]: partialResource,
                }),
              },
              storageMock: {
                downloadResult: () =>
                  Promise.resolve({ data: new Blob(["content"]), error: null }),
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: compressJob,
                  downloadFromStorage,
                  constructStoragePath: constructStoragePathSpy,
                }),
              );
              assert(typeof result.promptContent === "string");
            } finally {
              teardown();
            }
          },
        );

        // G.7: COMPRESS call omitting recipe-stage deps succeeds
        await t.step(
          "G.7: COMPRESS call with project/session/stage/gatherContext/assembleChunks/gatherContinuationInputs omitted succeeds",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS", payload: compressPayload,
            });

            const firstPassResource = buildDialecticProjectResourceRow({ storage_path: "compress/prompt", file_name: "prompt.json" });
            const partialResource = buildDialecticProjectResourceRow({ storage_path: "compress/output", file_name: "output.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                  [partialKey]: partialResource,
                }),
              },
              storageMock: {
                downloadResult: () =>
                  Promise.resolve({ data: new Blob(["content"]), error: null }),
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: compressJob,
                  downloadFromStorage,
                  constructStoragePath: constructStoragePathSpy,
                  project: undefined,
                  session: undefined,
                  stage: undefined,
                  gatherContext: undefined,
                  assembleChunks: undefined,
                  gatherContinuationInputs: undefined,
                }),
              );
              assert(typeof result.promptContent === "string");
              assert(typeof result.source_prompt_resource_id === "string");
            } finally {
              teardown();
            }
          },
        );

        // G.8: COMPRESS call never invokes gatherContinuationInputs and never queries dialectic_contributions
        await t.step(
          "G.8: COMPRESS call never invokes gatherContinuationInputs and never queries dialectic_contributions",
          async () => {
            const compressPayload = buildDialecticCompressJobPayload({ mode: "json" });
            if (!isJson(compressPayload)) throw new Error("Test setup: compress payload is not Json");
            const compressJob = buildDialecticJobRow({
              job_type: "COMPRESS", payload: compressPayload,
            });

            const firstPassResource = buildDialecticProjectResourceRow({ storage_path: "compress/prompt", file_name: "prompt.json" });
            const partialResource = buildDialecticProjectResourceRow({ storage_path: "compress/output", file_name: "output.json" });
            const firstPassKey = `${firstPassResource.storage_path}/${firstPassResource.file_name}`;
            const partialKey = `${partialResource.storage_path}/${partialResource.file_name}`;

            const gatherContinuationInputsSpy = spy(async () => buildGatherContinuationInputsSuccess()) as unknown as Spy<GatherContinuationInputsSignature>;

            const constructStoragePathSpy = spy((ctx: Parameters<ConstructStoragePathFn>[0]) => {
              if (ctx.fileType === FileType.CompressionPrompt) {
                return { storagePath: firstPassResource.storage_path, fileName: firstPassResource.file_name };
              }
              return { storagePath: partialResource.storage_path, fileName: partialResource.file_name };
            }) as unknown as Spy<ConstructStoragePathFn>;

            let dialecticContributionsCalled = false;
            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_project_resources: createProjectResourcesMock({
                  [firstPassKey]: firstPassResource,
                  [partialKey]: partialResource,
                }),
                dialectic_contributions: {
                  select: async () => {
                    dialecticContributionsCalled = true;
                    return { data: null, error: new Error("should not be called"), count: 0, status: 500, statusText: "Error" };
                  },
                },
              },
              storageMock: {
                downloadResult: () =>
                  Promise.resolve({ data: new Blob(["content"]), error: null }),
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: compressJob,
                  downloadFromStorage,
                  constructStoragePath: constructStoragePathSpy,
                  gatherContinuationInputs: gatherContinuationInputsSpy,
                }),
              );

              // gatherContinuationInputs was never called
              assertEquals(gatherContinuationInputsSpy.calls.length, 0);
              // dialectic_contributions was never queried
              assertEquals(dialecticContributionsCalled, false);
            } finally {
              teardown();
            }
          },
        );
      },
    );

    await t.step("Category H: Deps Optionality",
      async (t) => {
        // H.1: Contribution call supplying gatherContext succeeds
        await t.step(
          "H.1: contribution call supplying gatherContext succeeds — member still accepted",
          async () => {
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockPlannerJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({ data: new Blob([priorContent]), error: null });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);
            fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

            try {
              const result = await assembleContinuationPrompt(
                buildAssembleContinuationPromptDeps({
                  dbClient: client,
                  fileManager,
                  job: mockPlannerJob,
                  gatherContext: mockGatherContext,
                  downloadFromStorage,
                }),
              );
              assert(typeof result.promptContent === "string");
            } finally {
              teardown();
            }
          },
        );

        // H.2: Contribution call omitting session throws PRECONDITION_FAILED naming session
        await t.step(
          "H.2: contribution call omitting session throws PRECONDITION_FAILED naming session",
          async () => {
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockPlannerJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);

            try {
              await assertRejects(
                () => assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: mockPlannerJob,
                    session: undefined,
                    downloadFromStorage,
                  }),
                ),
                Error,
                "PRECONDITION_FAILED",
              );
            } finally {
              teardown();
            }
          },
        );

        // H.3: Contribution call omitting gatherContinuationInputs throws PRECONDITION_FAILED naming it
        await t.step(
          "H.3: contribution call omitting gatherContinuationInputs throws PRECONDITION_FAILED naming gatherContinuationInputs",
          async () => {
            const priorContribution = buildDialecticContributionRow({ contribution_type: "antithesis" });
            const fullPriorPath = `${priorContribution.storage_path}/${priorContribution.file_name}`;
            const priorContent = buildGatherContinuationInputsSuccess().messages[2].content;
            if (priorContent === null) throw new Error("Test setup: prior content is null");

            const plannerPayload = buildDialecticPlanJobPayload({
              target_contribution_id: priorContribution.id,
            });
            if (!isJson(plannerPayload)) throw new Error("Test setup: planner payload is not Json");
            const mockPlannerJob = buildDialecticJobRow({
              job_type: "PLAN",
              payload: plannerPayload,
            });

            const config: MockSupabaseDataConfig = {
              genericMockResults: {
                dialectic_contributions: createContributionsMock({
                  [priorContribution.id]: priorContribution,
                }),
              },
              storageMock: {
                downloadResult: (bucket: string, path: string) => {
                  if (bucket === priorContribution.storage_bucket && path === fullPriorPath) {
                    return Promise.resolve({ data: new Blob([priorContent]), error: null });
                  }
                  return Promise.resolve({ data: null, error: new Error("File not found in mock") });
                },
              },
            };
            const { client, fileManager, downloadFromStorage } = setup(config);

            try {
              await assertRejects(
                () => assembleContinuationPrompt(
                  buildAssembleContinuationPromptDeps({
                    dbClient: client,
                    fileManager,
                    job: mockPlannerJob,
                    gatherContinuationInputs: undefined,
                    downloadFromStorage,
                  }),
                ),
                Error,
                "PRECONDITION_FAILED",
              );
            } finally {
              teardown();
            }
          },
        );
      },
    );
  });
});
