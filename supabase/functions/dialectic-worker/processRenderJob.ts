import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import { isRecord, isDialecticRenderJobPayload } from '../_shared/utils/type_guards.ts';
import { IRenderJobContext } from './createJobContext/JobContext.interface.ts';
import { RenderDocumentParams, RenderCompressedContextParams, DocumentRendererDeps } from '../_shared/services/document_renderer/renderDocument/renderDocument.interface.ts';
import { isFileType } from '../_shared/utils/type_guards.ts';
import { isString, isNumber } from "node:util";
import type {
  RenderStartedPayload,
  RenderChunkCompletedPayload,
  JobFailedPayload,
} from '../_shared/types/notification.service.types.ts';
import { isDialecticStageSlug } from "../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isDialecticRenderCompressedContextJobPayload, isCompressedRenderPayloadShape } from './enqueueRenderJob/enqueueRenderJob.guards.ts';
import type { DialecticRenderCompressedContextJobPayload } from './enqueueRenderJob/enqueueRenderJob.interface.ts';

export async function processRenderJob(
  dbClient: SupabaseClient<Database>,
  job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
  projectOwnerUserId: string,
  ctx: IRenderJobContext,
  _authToken: string,
): Promise<void> {
  const { id: jobId } = job;

  try {
    // Compressed arm: select by the non-throwing predicate, narrow with the throwing guard.
    if (isCompressedRenderPayloadShape(job.payload)) {
      if (!isDialecticRenderCompressedContextJobPayload(job.payload)) {
        throw new Error('Invalid compressed payload');
      }
      return await processCompressedRenderJob(dbClient, job, ctx, job.payload, projectOwnerUserId);
    }

    // Contribution arm
    // Normalize payload (Supabase may return JSON as string)
    if (!isRecord(job.payload) || !isDialecticRenderJobPayload(job.payload)) {
      throw new Error('Invalid payload');
    }
    const payload = job.payload;

    const { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey, sourceContributionId, template_filename, model_id } = payload;
    if (!projectId || !sessionId || !stageSlug || !documentIdentity) {
      throw new Error('Missing required render parameters');
    }

    if (!isNumber(iterationNumber)) {
      throw new Error('iterationNumber is required');
    }

    // Validate documentKey
    if (!isFileType(documentKey)) {
      throw new Error('documentKey must be a valid FileType');
    }
    if (!sourceContributionId) {
      throw new Error('sourceContributionId is required');
    }
    if(!isString(projectId)) {
      throw new Error('projectId must be a string');
    }
    if(!isString(sessionId)) {
      throw new Error('sessionId must be a string');
    }
    if(!isString(stageSlug)) {
      throw new Error('stageSlug must be a string');
    }
    if(!isString(documentIdentity)) {
      throw new Error('documentIdentity must be a string');
    }
    if(!isString(sourceContributionId)) {
      throw new Error('sourceContributionId must be a string');
    }
    if(!isString(template_filename) || template_filename.trim() === '') {
      throw new Error('template_filename must be a non-empty string');
    }

    if(!isDialecticStageSlug(stageSlug)) {
      throw new Error('stageSlug must be a valid DialecticStageSlug');
    }

    const params: RenderDocumentParams = {
      projectId,
      sessionId,
      iterationNumber,
      stageSlug,
      documentIdentity,
      documentKey,
      sourceContributionId,
      template_filename,
    };

    const stepKey = 'render';
    const documentKeyStr = String(documentKey);

    if (typeof ctx.notificationService.sendJobNotificationEvent === 'function' && projectOwnerUserId) {
      const renderStartedPayload: RenderStartedPayload = {
        type: 'render_started',
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: jobId,
        step_key: stepKey,
        modelId: model_id,
        document_key: documentKeyStr,
      };
      await ctx.notificationService.sendJobNotificationEvent(renderStartedPayload, projectOwnerUserId);
    }

    const rendererDeps: DocumentRendererDeps = {
      downloadFromStorage: ctx.downloadFromStorage,
      fileManager: ctx.fileManager,
      notificationService: ctx.notificationService,
      notifyUserId: projectOwnerUserId,
      logger: ctx.logger,
      assembleContributionChain: ctx.assembleContributionChain,
      loadDocumentTemplate: ctx.loadDocumentTemplate,
      mergeChunkContent: ctx.mergeChunkContent,
    };

    ctx.logger.info('[processRenderJob] DEBUG: About to call renderDocument', { 
      jobId, 
      params: {
        projectId: params.projectId,
        sessionId: params.sessionId,
        iterationNumber: params.iterationNumber,
        stageSlug: params.stageSlug,
        documentIdentity: params.documentIdentity,
        documentKey: params.documentKey,
        sourceContributionId: params.sourceContributionId,
        template_filename: params.template_filename,
      }
    });
    
    let renderResult;
    try {
      renderResult = await ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params);
      ctx.logger.info('[processRenderJob] DEBUG: renderDocument succeeded', { 
        jobId,
        sourceContributionId: renderResult.pathContext.sourceContributionId,
      });
    } catch (renderError) {
      ctx.logger.error('[processRenderJob] DEBUG: renderDocument threw error', { 
        jobId,
        error: renderError instanceof Error ? renderError.message : String(renderError),
        stack: renderError instanceof Error ? renderError.stack : undefined,
      });
      throw renderError;
    }

    if (typeof ctx.notificationService.sendJobNotificationEvent === 'function' && projectOwnerUserId) {
      const renderChunkPayload: RenderChunkCompletedPayload = {
        type: 'render_chunk_completed',
        sessionId,
        stageSlug,
        iterationNumber,
        job_id: jobId,
        step_key: stepKey,
        modelId: model_id,
        document_key: documentKeyStr,
      };
      await ctx.notificationService.sendJobNotificationEvent(renderChunkPayload, projectOwnerUserId);
    }

    const pathContextJson = {
      projectId: renderResult.pathContext.projectId,
      sessionId: renderResult.pathContext.sessionId,
      iteration: renderResult.pathContext.iteration,
      stageSlug: renderResult.pathContext.stageSlug,
      documentKey: renderResult.pathContext.documentKey,
      fileType: renderResult.pathContext.fileType,
      modelSlug: renderResult.pathContext.modelSlug,
      sourceContributionId: renderResult.pathContext.sourceContributionId,
      ...(renderResult.pathContext.sourceAnchorModelSlug ? { sourceAnchorModelSlug: renderResult.pathContext.sourceAnchorModelSlug } : {}),
      ...(renderResult.pathContext.sourceGroupFragment ? { sourceGroupFragment: renderResult.pathContext.sourceGroupFragment } : {}),
    };

    await dbClient
      .from('dialectic_generation_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: { pathContext: pathContextJson },
      })
      .eq('id', jobId);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    ctx.logger.error('[processRenderJob] DEBUG: Caught error in processRenderJob', { 
      jobId, 
      error: err.message,
      stack: err.stack,
      errorName: err.name,
      fullError: String(e),
    });

    await dbClient
      .from('dialectic_generation_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: err.message,
      })
      .eq('id', jobId);

    // Do not retry; deterministic render errors should bubble or be recorded as failed per plan

    if (typeof ctx.notificationService.sendJobNotificationEvent === 'function' && projectOwnerUserId && isRecord(job.payload) && !isCompressedRenderPayloadShape(job.payload)) {
      const p = job.payload;
      const failedSessionId: string = typeof p.sessionId === 'string' ? p.sessionId : job.session_id;
      const failedStageSlug: string = typeof p.stageSlug === 'string' ? p.stageSlug : job.stage_slug;
      const failedIterationNumber: number =
        typeof job.iteration_number === 'number'
          ? job.iteration_number
          : typeof p.iterationNumber === 'number' && Number.isFinite(p.iterationNumber)
            ? p.iterationNumber
            : 1;
      const failedModelId: string | undefined = typeof p.model_id === 'string' ? p.model_id : undefined;
      const failedDocumentKeyStr: string = 'documentKey' in p && p.documentKey != null ? String(p.documentKey) : '';
      const jobFailedPayload: JobFailedPayload = {
        type: 'job_failed',
        sessionId: failedSessionId,
        stageSlug: failedStageSlug,
        iterationNumber: failedIterationNumber,
        job_id: jobId,
        step_key: 'render',
        error: { code: 'RENDER_FAILED', message: err.message },
        modelId: failedModelId,
        document_key: failedDocumentKeyStr,
      };
      try {
        await ctx.notificationService.sendJobNotificationEvent(jobFailedPayload, projectOwnerUserId);
      } catch (_n) {
        // best-effort; ignore notification errors
      }
    }
  }
}

async function processCompressedRenderJob(
  dbClient: SupabaseClient<Database>,
  job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
  ctx: IRenderJobContext,
  payload: DialecticRenderCompressedContextJobPayload,
  projectOwnerUserId: string,
): Promise<void> {
  const { id: jobId } = job;

  const params: RenderCompressedContextParams = {
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    iterationNumber: payload.iterationNumber,
    stageSlug: payload.stageSlug,
    output_type: payload.output_type,
    sourceType: payload.sourceType,
    documentKey: payload.documentKey,
    template_filename: payload.template_filename,
  };

  const rendererDeps: DocumentRendererDeps = {
    downloadFromStorage: ctx.downloadFromStorage,
    fileManager: ctx.fileManager,
    notificationService: ctx.notificationService,
    notifyUserId: projectOwnerUserId,
    logger: ctx.logger,
    assembleContributionChain: ctx.assembleContributionChain,
    loadDocumentTemplate: ctx.loadDocumentTemplate,
    mergeChunkContent: ctx.mergeChunkContent,
  };

  try {
    const renderResult = await ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params);

    await dbClient
      .from('dialectic_generation_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results: {
          pathContext: {
            projectId: renderResult.pathContext.projectId,
            sessionId: renderResult.pathContext.sessionId,
            iteration: renderResult.pathContext.iteration,
            stageSlug: renderResult.pathContext.stageSlug,
            fileType: renderResult.pathContext.fileType,
            documentKey: renderResult.pathContext.documentKey,
            output_type: renderResult.pathContext.output_type,
            sourceType: renderResult.pathContext.sourceType,
          },
        },
      })
      .eq('id', jobId);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    ctx.logger.error('[processCompressedRenderJob] Failed to render compressed context', {
      jobId,
      error: err.message,
    });

    await dbClient
      .from('dialectic_generation_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: err.message,
      })
      .eq('id', jobId);
  }
}
