import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.43.4';
import type { ServiceError } from '../_shared/types.ts';
import { logger } from '../_shared/logger.ts';
import type { Database } from '../types_db.ts';
import type { FetchProcessTemplatePayload } from './dialectic.interface.ts';

export type DialecticProcessTemplate = Database['public']['Tables']['dialectic_process_templates']['Row'] & {
    stages: Database['public']['Tables']['dialectic_stages']['Row'][];
    transitions: Database['public']['Tables']['dialectic_stage_transitions']['Row'][];
};

export async function fetchProcessTemplate(
  dbClient: SupabaseClient<Database>,
  payload: FetchProcessTemplatePayload
): Promise<{ data?: DialecticProcessTemplate; error?: ServiceError; status?: number }> {
  logger.info('Fetching process template', { ...payload });

  if (!payload.templateId) {
    return { error: { message: 'templateId is required', code: 'MISSING_PARAM' }, status: 400 };
  }

  try {
    const { data: templateData, error: templateError } = await dbClient
      .from('dialectic_process_templates')
      .select('*')
      .eq('id', payload.templateId)
      .single();

    if (templateError) {
      if (templateError.code === 'PGRST116') {
        return {
          error: { message: 'Process template not found', code: 'NOT_FOUND' },
          status: 404,
        };
      }
      logger.error('Error fetching process template from DB', { error: templateError });
      return {
        error: {
          message: templateError.message || 'An error occurred while fetching the process template.',
          code: templateError.code || 'DB_ERROR',
        },
        status: 500,
      };
    }

    if (!templateData) {
        return {
            error: {
                message: 'Process template not found',
                code: 'NOT_FOUND',
            },
            status: 404,
        };
    }

    // Fetch associated stages and transitions
    const { data: transitions, error: transitionsError } = await dbClient
        .from('dialectic_stage_transitions')
        .select('*')
        .eq('process_template_id', payload.templateId);

    if (transitionsError) {
        logger.error('Error fetching transitions for process template', { error: transitionsError, templateId: payload.templateId });
        return { error: { message: 'Error fetching transitions', code: 'DB_ERROR' }, status: 500 };
    }

    const stageIds = new Set<string>();
    (transitions || []).forEach(t => {
        stageIds.add(t.source_stage_id);
        stageIds.add(t.target_stage_id);
    });

    if (stageIds.size === 0) {
        // If there are no transitions, there might be a single starting stage
        if (templateData.starting_stage_id) {
            stageIds.add(templateData.starting_stage_id);
        } else {
             // No transitions and no starting stage, return template with empty stages/transitions
            const emptyTemplate: DialecticProcessTemplate = {
                ...templateData,
                stages: [],
                transitions: [],
            };
            return { data: emptyTemplate, status: 200 };
        }
    }

    const { data: stages, error: stagesError } = await dbClient
        .from('dialectic_stages')
        .select('*')
        .in('id', Array.from(stageIds));

    if (stagesError) {
        logger.error('Error fetching stages for process template', { error: stagesError, templateId: payload.templateId });
        return { error: { message: 'Error fetching stages', code: 'DB_ERROR' }, status: 500 };
    }
    
    const fullTemplate: DialecticProcessTemplate = {
        ...templateData,
        stages: stages || [],
        transitions: transitions || [],
    };
    
    return { data: fullTemplate, status: 200 };
  } catch (e) {
    logger.error('Unexpected error in fetchProcessTemplate handler', { error: e });
    return { error: { message: 'An unexpected error occurred.', code: 'UNEXPECTED_ERROR' }, status: 500 };
  }
} 