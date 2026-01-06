// supabase/functions/dialectic-worker/createJobContext.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import {
    createJobContext,
    createExecuteJobContext,
    createPlanJobContext,
    createRenderJobContext
} from './createJobContext.ts';
import {
    isIJobContext,
    isIExecuteJobContext,
    isIPlanJobContext,
    isIRenderJobContext
} from './type-guards/JobContext.type_guards.ts';
import {
    createMockJobContextParams,
    createMockRootContext
} from './JobContext.mock.ts';

describe('createJobContext Factory and Slicers', () => {
    describe('createJobContext', () => {
        it('constructs valid IJobContext with all fields from params', () => {
            const params = createMockJobContextParams();
            const result = createJobContext(params);

            // Assert type guard validates
            assertEquals(isIJobContext(result), true);

            // Spot-check fields are correctly mapped
            assertEquals(result.logger, params.logger);
            assertEquals(result.fileManager, params.fileManager);
            assertEquals(result.ragService, params.ragService);
            assertEquals(result.continueJob, params.continueJob);
            assertEquals(result.getSeedPromptForStage, params.getSeedPromptForStage);
            assertEquals(result.planComplexStage, params.planComplexStage);
            assertEquals(result.documentRenderer, params.documentRenderer);
        });
    });

    describe('createExecuteJobContext', () => {
        it('extracts only IExecuteJobContext fields from root', () => {
            const root = createMockRootContext();
            const result = createExecuteJobContext(root);

            // Assert type guard validates
            assertEquals(isIExecuteJobContext(result), true);

            // Assert it includes execute-specific fields
            assertEquals(result.logger, root.logger);
            assertEquals(result.fileManager, root.fileManager);
            assertEquals(result.callUnifiedAIModel, root.callUnifiedAIModel);
            assertEquals(result.ragService, root.ragService);
            assertEquals(result.getSeedPromptForStage, root.getSeedPromptForStage);
            assertEquals(result.shouldEnqueueRenderJob, root.shouldEnqueueRenderJob);
            assertEquals(result.continueJob, root.continueJob);
            assertEquals(result.retryJob, root.retryJob);
        });

        it('does NOT include plan-specific fields', () => {
            const root = createMockRootContext();
            const result = createExecuteJobContext(root);

            // Runtime check: planComplexStage should NOT be present
            assertEquals('planComplexStage' in result, false);
            assertEquals('getGranularityPlanner' in result, false);
        });
    });

    describe('createPlanJobContext', () => {
        it('extracts only IPlanJobContext fields', () => {
            const root = createMockRootContext();
            const result = createPlanJobContext(root);

            // Assert type guard validates
            assertEquals(isIPlanJobContext(result), true);

            // Assert it includes plan-specific fields
            assertEquals(result.logger, root.logger);
            assertEquals(result.getGranularityPlanner, root.getGranularityPlanner);
            assertEquals(result.planComplexStage, root.planComplexStage);

            // Runtime check: should NOT include execute or render fields
            assertEquals('fileManager' in result, false);
            assertEquals('ragService' in result, false);
            assertEquals('documentRenderer' in result, false);
        });
    });

    describe('createRenderJobContext', () => {
        it('extracts only IRenderJobContext fields', () => {
            const root = createMockRootContext();
            const result = createRenderJobContext(root);

            // Assert type guard validates
            assertEquals(isIRenderJobContext(result), true);

            // Assert it includes render-specific fields
            assertEquals(result.logger, root.logger);
            assertEquals(result.fileManager, root.fileManager);
            assertEquals(result.documentRenderer, root.documentRenderer);
            assertEquals(result.notificationService, root.notificationService);

            // Runtime check: should NOT include execute or plan fields
            assertEquals('ragService' in result, false);
            assertEquals('planComplexStage' in result, false);
        });
    });
});
