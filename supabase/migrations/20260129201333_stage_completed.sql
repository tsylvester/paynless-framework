-- handle_job_completion: set {stage}_completed status instead of auto-advancing
-- When all root PLAN jobs for a stage complete, session status becomes {current_stage_slug}_completed.
-- Trigger does NOT update current_stage_id; stage advancement is user-initiated only (submitStageResponses).
-- Applies to ALL stages including terminal (e.g. paralysis_completed).

CREATE OR REPLACE FUNCTION public.handle_job_completion()
RETURNS TRIGGER AS $$
DECLARE
    parent_id_val UUID;
    prereq_for_job_id UUID;
    total_siblings INTEGER;
    terminal_siblings INTEGER;
    failed_siblings INTEGER;
    parent_payload JSONB;
    current_step INTEGER;
    total_steps INTEGER;
    -- Part 3 variables for session status update
    v_session_id UUID;
    v_stage_slug TEXT;
    v_iteration_number INTEGER;
    v_completed_plans INTEGER;
    v_total_plans INTEGER;
    v_incomplete_jobs INTEGER;
BEGIN
    -- Only act on jobs entering a terminal state.
    IF NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed') THEN
        RETURN NEW;
    END IF;

    -- For updates, ensure it wasn't already in a terminal state to prevent re-triggering.
    IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'failed', 'retry_loop_failed') THEN
        RETURN NEW;
    END IF;

    -- --- Part 1: Handle Prerequisite Dependencies ---
    -- Check if any job was waiting on this one to complete.
    SELECT id INTO prereq_for_job_id
    FROM public.dialectic_generation_jobs
    WHERE prerequisite_job_id = NEW.id
    AND status = 'waiting_for_prerequisite'
    LIMIT 1;

    IF prereq_for_job_id IS NOT NULL AND NEW.status = 'completed' THEN
        -- The prerequisite was met, so set the waiting job to pending.
        UPDATE public.dialectic_generation_jobs
        SET status = 'pending'
        WHERE id = prereq_for_job_id;
    ELSIF prereq_for_job_id IS NOT NULL AND NEW.status != 'completed' THEN
        -- The prerequisite failed, so fail the waiting job.
        UPDATE public.dialectic_generation_jobs
        SET status = 'failed',
            error_details = jsonb_build_object('reason', 'Prerequisite job failed.', 'prerequisite_id', NEW.id)
        WHERE id = prereq_for_job_id;
    END IF;

    -- --- Part 2: Handle Parent/Child Dependencies ---
    parent_id_val := NEW.parent_job_id;
    IF parent_id_val IS NULL THEN
        -- Not a child job, but might be a root PLAN job that completes a stage
        -- Continue to Part 3 to check for stage completion
    ELSE
        -- Count total and terminal siblings (ALWAYS exclude RENDER jobs - they never block recipe continuation)
        SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'retry_loop_failed'))
        INTO total_siblings, terminal_siblings
        FROM public.dialectic_generation_jobs
        WHERE parent_job_id = parent_id_val AND job_type != 'RENDER';

        -- If all siblings are now in a terminal state, we can act on the parent.
        IF total_siblings = terminal_siblings THEN
            -- Check if any sibling failed (ALWAYS exclude RENDER jobs - their failures never affect parent jobs)
            SELECT COUNT(*)
            INTO failed_siblings
            FROM public.dialectic_generation_jobs
            WHERE parent_job_id = parent_id_val AND status IN ('failed', 'retry_loop_failed') AND job_type != 'RENDER';

            IF failed_siblings > 0 THEN
                -- If any child failed, the entire parent plan fails.
                UPDATE public.dialectic_generation_jobs
                SET status = 'failed',
                    error_details = jsonb_build_object('reason', 'One or more child jobs failed.')
                WHERE id = parent_id_val AND status = 'waiting_for_children';
            ELSE
                -- All children completed successfully. Check if it's the final step of a multi-step job.
                SELECT payload INTO parent_payload
                FROM public.dialectic_generation_jobs
                WHERE id = parent_id_val;

                IF parent_payload IS NOT NULL AND jsonb_path_exists(parent_payload, '$.step_info.current_step') AND jsonb_path_exists(parent_payload, '$.step_info.total_steps') THEN
                    current_step := (parent_payload->'step_info'->>'current_step')::INTEGER;
                    total_steps := (parent_payload->'step_info'->>'total_steps')::INTEGER;

                    IF current_step >= total_steps THEN
                        -- This was the final step, so the parent job is now complete.
                        UPDATE public.dialectic_generation_jobs
                        SET status = 'completed'
                        WHERE id = parent_id_val AND status = 'waiting_for_children';
                    ELSE
                        -- There are more steps, wake up the parent for the next one.
                        UPDATE public.dialectic_generation_jobs
                        SET status = 'pending_next_step'
                        WHERE id = parent_id_val AND status = 'waiting_for_children';
                    END IF;
                ELSE
                    -- Not a multi-step job, or payload is missing info. Default to waking parent.
                    UPDATE public.dialectic_generation_jobs
                    SET status = 'pending_next_step'
                    WHERE id = parent_id_val AND status = 'waiting_for_children';
                END IF;
            END IF;
        END IF;

        -- After handling parent/child, return (child jobs don't trigger stage completion)
        RETURN NEW;
    END IF;

    -- --- Part 3: Session status update on stage completion ---
    -- Set status to {stage}_completed only; do NOT update current_stage_id (user-initiated advancement only).
    IF NEW.parent_job_id IS NULL AND NEW.job_type = 'PLAN' AND NEW.status = 'completed' THEN
        v_session_id := NEW.session_id;
        v_stage_slug := NEW.stage_slug;
        v_iteration_number := COALESCE(NEW.iteration_number, 1);

        SELECT 
            COUNT(*) FILTER (WHERE job_type = 'PLAN' AND status = 'completed') as completed_plans,
            COUNT(*) FILTER (WHERE job_type = 'PLAN') as total_plans,
            COUNT(*) FILTER (
                WHERE job_type != 'RENDER' 
                  AND status != 'waiting_for_prerequisite'
                  AND status NOT IN ('completed', 'failed', 'retry_loop_failed')
            ) as incomplete_jobs
        INTO v_completed_plans, v_total_plans, v_incomplete_jobs
        FROM public.dialectic_generation_jobs
        WHERE parent_job_id IS NULL
          AND session_id = v_session_id
          AND stage_slug = v_stage_slug
          AND COALESCE(iteration_number, 1) = v_iteration_number;

        IF v_completed_plans = v_total_plans AND v_total_plans > 0 AND v_incomplete_jobs = 0 THEN
            UPDATE public.dialectic_sessions
            SET status = v_stage_slug || '_completed',
                updated_at = now()
            WHERE id = v_session_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_job_completion() IS 'Trigger function that handles job completion logic in three parts: (1) Prerequisite dependencies - unblocks jobs waiting for prerequisites, (2) Parent/child dependencies - updates parent job status when all children complete, (3) Session status update - sets dialectic_sessions.status to {stage_slug}_completed when all root PLAN jobs for a stage complete. Does NOT update current_stage_id; stage advancement is user-initiated only. Excludes RENDER jobs and waiting_for_prerequisite jobs from completion checks.';
