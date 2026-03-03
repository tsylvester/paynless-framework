-- superseded job status for regenerated document jobs
--
-- Introduces the terminal status 'superseded'. When a document is regenerated, the original
-- (e.g. failed) job is marked superseded rather than remaining failed. Superseded jobs must
-- be treated as terminal by handle_job_completion() (do not wake parents or prerequisite
-- chains), must not appear in worker-invoking trigger WHEN clauses, and must not be resumed
-- by resume_paused_nsf_jobs (that RPC only updates status = 'paused_nsf', so superseded is
-- already excluded).

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
    v_current_stage_id UUID;
    v_process_template_id UUID;
    v_next_stage_id UUID;
    v_next_stage_slug TEXT;
BEGIN
    -- Only act on jobs entering a terminal state.
    IF NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed', 'superseded') THEN
        RETURN NEW;
    END IF;

    -- For updates, ensure it wasn't already in a terminal state to prevent re-triggering.
    IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'failed', 'retry_loop_failed', 'superseded') THEN
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
        SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'retry_loop_failed', 'superseded'))
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
    -- Check if this is a root PLAN job completion
    IF NEW.parent_job_id IS NULL AND NEW.job_type = 'PLAN' AND NEW.status = 'completed' THEN
        -- Extract identifiers from job table columns (NOT payload)
        v_session_id := NEW.session_id;
        v_stage_slug := NEW.stage_slug;
        v_iteration_number := COALESCE(NEW.iteration_number, 1);

        -- Query root jobs for stage completion
        -- Note: We don't use FOR UPDATE here because we're using aggregate functions
        -- The transaction isolation level provides sufficient protection against race conditions
        -- Count PLAN jobs (all PLAN jobs, regardless of status, to get total)
        -- Count incomplete jobs (non-RENDER, non-waiting jobs that aren't in terminal states)
        SELECT 
            COUNT(*) FILTER (WHERE job_type = 'PLAN' AND status = 'completed') as completed_plans,
            COUNT(*) FILTER (WHERE job_type = 'PLAN') as total_plans,
            COUNT(*) FILTER (
                WHERE job_type != 'RENDER' 
                  AND status != 'waiting_for_prerequisite'
                  AND status NOT IN ('completed', 'failed', 'retry_loop_failed', 'superseded')
            ) as incomplete_jobs
        INTO v_completed_plans, v_total_plans, v_incomplete_jobs
        FROM public.dialectic_generation_jobs
        WHERE parent_job_id IS NULL
          AND session_id = v_session_id
          AND stage_slug = v_stage_slug
          AND COALESCE(iteration_number, 1) = v_iteration_number;

        -- Check completion condition: all PLAN jobs completed and no incomplete jobs
        IF v_completed_plans = v_total_plans AND v_total_plans > 0 AND v_incomplete_jobs = 0 THEN
            -- Get current stage ID
            SELECT id INTO v_current_stage_id
            FROM public.dialectic_stages
            WHERE slug = v_stage_slug;

            -- Only proceed if stage ID was found
            IF v_current_stage_id IS NOT NULL THEN
                -- Get process template ID via session → project join
                SELECT p.process_template_id INTO v_process_template_id
                FROM public.dialectic_sessions s
                JOIN public.dialectic_projects p ON s.project_id = p.id
                WHERE s.id = v_session_id;

                -- Only proceed if process template ID was found
                IF v_process_template_id IS NOT NULL THEN
                    -- Query stage transitions to find next stage (get both ID and slug)
                    SELECT ds.id, ds.slug INTO v_next_stage_id, v_next_stage_slug
                    FROM public.dialectic_stage_transitions dst
                    JOIN public.dialectic_stages ds ON dst.target_stage_id = ds.id
                    WHERE dst.source_stage_id = v_current_stage_id
                      AND dst.process_template_id = v_process_template_id
                    LIMIT 1;

                    -- Update session status and current_stage_id synchronously (in same transaction)
                    UPDATE public.dialectic_sessions
                    SET status = CASE 
                        WHEN v_next_stage_slug IS NOT NULL THEN 'pending_' || v_next_stage_slug
                        ELSE 'iteration_complete_pending_review'
                    END,
                    current_stage_id = CASE 
                        WHEN v_next_stage_id IS NOT NULL THEN v_next_stage_id
                        ELSE current_stage_id  -- Keep current stage if terminal
                    END,
                    updated_at = now()
                    WHERE id = v_session_id;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_job_completion() IS 'Trigger function that handles job completion logic in three parts: (1) Prerequisite dependencies - unblocks jobs waiting for prerequisites, (2) Parent/child dependencies - updates parent job status when all children complete, (3) Session status update - advances session to next stage when all root PLAN jobs for a stage complete. Terminal statuses: completed, failed, retry_loop_failed, superseded. Excludes RENDER jobs and waiting_for_prerequisite jobs from completion checks.';
