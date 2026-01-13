import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import { IRenderJobContext } from './JobContext.interface.ts';
import { RenderDocumentParams, DocumentRendererDeps } from '../_shared/services/document_renderer.interface.ts';
import { isFileType } from '../_shared/utils/type_guards.ts';
import { isString, isNumber } from "node:util";

export async function processRenderJob(
  dbClient: SupabaseClient<Database>,
  job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
  projectOwnerUserId: string,
  ctx: IRenderJobContext,
  _authToken: string,
): Promise<void> {
  const { id: jobId } = job;

  try {
    // Normalize payload (Supabase may return JSON as string)
    if (!isRecord(job.payload)) {
      throw new Error('Invalid payload');
    }

    const { projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey, sourceContributionId, template_filename } = job.payload;
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

    const rendererDeps: DocumentRendererDeps = {
      downloadFromStorage: ctx.downloadFromStorage,
      fileManager: ctx.fileManager,
      notificationService: ctx.notificationService,
      notifyUserId: projectOwnerUserId,
      logger: ctx.logger,
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

    // Emit document-centric job_failed notification
    try {
      const payloadUnknown = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      const sessionId = typeof job.session_id === 'string' ? job.session_id : (payloadUnknown && String(payloadUnknown['sessionId'] ?? ''));
      const stageSlug = typeof job.stage_slug === 'string' ? job.stage_slug : (payloadUnknown && String(payloadUnknown['stageSlug'] ?? ''));
      const iterationNumber = typeof job.iteration_number === 'number' ? job.iteration_number : Number(payloadUnknown && payloadUnknown['iterationNumber']);
      const documentKeyVal = payloadUnknown && payloadUnknown['documentKey'];
      const documentKey = typeof documentKeyVal === 'string' ? documentKeyVal : String(documentKeyVal ?? 'unknown');

      if (typeof ctx.notificationService.sendDocumentCentricNotification === 'function' && projectOwnerUserId) {
        await ctx.notificationService.sendDocumentCentricNotification({
          type: 'job_failed',
          sessionId: String(sessionId),
          stageSlug: String(stageSlug),
          job_id: jobId,
          document_key: documentKey,
          modelId: 'renderer',
          iterationNumber: Number.isFinite(iterationNumber) ? iterationNumber : 1,
          error: { code: 'RENDER_FAILED', message: err.message },
        }, projectOwnerUserId);
      }
    } catch (_n) {
      // best-effort; ignore notification errors
    }
  }
}
