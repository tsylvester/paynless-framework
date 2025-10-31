import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import type { IRenderJobDeps } from '../dialectic-service/dialectic.interface.ts';
import type { RenderDocumentParams, DocumentRendererDeps } from '../_shared/services/document_renderer.interface.ts';
import { isFileType } from '../_shared/utils/type_guards.ts';

export async function processRenderJob(
  dbClient: SupabaseClient<Database>,
  job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
  projectOwnerUserId: string,
  deps: IRenderJobDeps,
  _authToken: string,
): Promise<void> {
  const { id: jobId } = job;

  try {
    // Normalize payload (Supabase may return JSON as string)
    const normalizedPayload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    if (!isRecord(normalizedPayload)) {
      throw new Error('Invalid payload');
    }

    const projectId = String(normalizedPayload['projectId'] ?? '');
    const sessionId = String(normalizedPayload['sessionId'] ?? '');
    const iterationNumberUnknown = normalizedPayload['iterationNumber'];
    const stageSlug = String(normalizedPayload['stageSlug'] ?? '');
    const documentIdentity = String(normalizedPayload['documentIdentity'] ?? '');
    const documentKeyUnknown = normalizedPayload['documentKey'];

    if (!projectId || !sessionId || !stageSlug || !documentIdentity) {
      throw new Error('Missing required render parameters');
    }
    const iterationNumber = typeof iterationNumberUnknown === 'number' ? iterationNumberUnknown : Number(iterationNumberUnknown);
    if (!Number.isFinite(iterationNumber)) {
      throw new Error('iterationNumber is required');
    }

    // Validate documentKey
    if (!isFileType(documentKeyUnknown)) {
      throw new Error('documentKey must be a valid FileType');
    }

    const params: RenderDocumentParams = {
      projectId,
      sessionId,
      iterationNumber,
      stageSlug,
      documentIdentity,
      documentKey: documentKeyUnknown,
    };

    const rendererDeps: DocumentRendererDeps = {
      downloadFromStorage: deps.downloadFromStorage,
      fileManager: deps.fileManager,
      notificationService: deps.notificationService,
      notifyUserId: projectOwnerUserId,
      logger: deps.logger,
    };

    const renderResult = await deps.documentRenderer.renderDocument(dbClient, rendererDeps, params);

    const pathContextJson = {
      projectId: renderResult.pathContext.projectId,
      sessionId: renderResult.pathContext.sessionId,
      iteration: renderResult.pathContext.iteration,
      stageSlug: renderResult.pathContext.stageSlug,
      documentKey: renderResult.pathContext.documentKey,
      fileType: renderResult.pathContext.fileType,
      modelSlug: renderResult.pathContext.modelSlug,
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
    deps.logger.error('[processRenderJob] failed to render document', { jobId, error: err.message });

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

      if (deps.notificationService && typeof deps.notificationService.sendDocumentCentricNotification === 'function' && projectOwnerUserId) {
        await deps.notificationService.sendDocumentCentricNotification({
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
