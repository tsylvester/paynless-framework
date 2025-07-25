-- Step 25.a: Enhance Jobs Table for Prerequisite Tracking
-- Add the prerequisite_job_id column to track job dependencies
ALTER TABLE public.dialectic_generation_jobs
ADD COLUMN prerequisite_job_id UUID NULL REFERENCES public.dialectic_generation_jobs(id) ON DELETE SET NULL;

-- Step 25.d & 29.f: Implement Orchestration for Prerequisite and Failed Child Jobs
-- We refactor the existing function to be a more generic orchestrator.
CREATE OR REPLACE FUNCTION public.handle_job_completion()
RETURNS TRIGGER AS $$
DECLARE
    parent_id_val UUID;
    prereq_for_job_id UUID;
    total_siblings INTEGER;
    terminal_siblings INTEGER;
    failed_siblings INTEGER;
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
        RETURN NEW; -- Not a child job, nothing more to do.
    END IF;

    -- Count total and terminal siblings
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'retry_loop_failed'))
    INTO total_siblings, terminal_siblings
    FROM public.dialectic_generation_jobs
    WHERE parent_job_id = parent_id_val;

    -- If all siblings are now in a terminal state, we can act on the parent.
    IF total_siblings = terminal_siblings THEN
        -- Check if any sibling failed.
        SELECT COUNT(*)
        INTO failed_siblings
        FROM public.dialectic_generation_jobs
        WHERE parent_job_id = parent_id_val AND status IN ('failed', 'retry_loop_failed');

        IF failed_siblings > 0 THEN
            -- If any child failed, the entire parent plan fails.
            UPDATE public.dialectic_generation_jobs
            SET status = 'failed',
                error_details = jsonb_build_object('reason', 'One or more child jobs failed.')
            WHERE id = parent_id_val AND status = 'waiting_for_children';
        ELSE
            -- All children completed successfully, wake up the parent for the next step.
            UPDATE public.dialectic_generation_jobs
            SET status = 'pending_next_step'
            WHERE id = parent_id_val AND status = 'waiting_for_children';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing triggers to use the new function name.
DROP TRIGGER IF EXISTS trigger_handle_child_job_completion_on_update ON public.dialectic_generation_jobs;
CREATE TRIGGER trigger_handle_job_completion_on_update
    AFTER UPDATE OF status ON public.dialectic_generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_job_completion();

DROP TRIGGER IF EXISTS trigger_handle_child_job_completion_on_insert ON public.dialectic_generation_jobs;
CREATE TRIGGER trigger_handle_job_completion_on_insert
    AFTER INSERT ON public.dialectic_generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_job_completion();


-- Steps 25.b & 27.a: Seed the combination and synthesis prompts
INSERT INTO public.system_prompts (id, name, prompt_text, is_active, version)
VALUES
    ('a2b3c4d5-e6f7-4a1b-8c9d-0e1f2a3b4c5d', 'Tier 2 Document Combiner', 'You are a document synthesis agent. Your task is to combine the following documents into a single, coherent text. You MUST preserve every unique fact, requirement, argument, and detail. You must ONLY eliminate redundant phrasing, repeated sentences, or conversational filler. The final output must be a complete and faithful representation of all unique information present in the source documents.', true, 1),
    ('b3c4d5e6-f7a1-4b8c-9d0e-1f2a3b4c5d6e', 'Synthesis Step 1: Pairwise', 'As an expert synthesizer, your task is to analyze the following user prompt, an original thesis written to address it, and a single antithesis that critiques the thesis. Combine the thesis and antithesis into a more complete and accurate response that is more fit-for-purpose against the original user prompt. Preserve all critical details.', true, 1),
    ('c4d5e6f7-a1b8-4c9d-0e1f-2a3b4c5d6e7f', 'Synthesis Step 2: Combine Per-Thesis', 'As an expert editor, your task is to analyze the following user prompt and a set of preliminary syntheses that were all derived from the same original thesis. Combine these documents into a single, unified synthesis that is maximally fit-for-purpose against the original user prompt. You must eliminate redundancy and conflicting information while ensuring every unique and critical detail is preserved.', true, 1),
    ('d5e6f7a1-b8c9-4d0e-1f2a-3b4c5d6e7f80', 'Synthesis Step 3: Final Combination', 'As a master synthesizer, your task is to analyze the following user prompt and a set of refined syntheses. Each refined synthesis was created from a different original thesis. Combine these documents into a single, final, and comprehensive document that is maximally fit-for-purpose against the original user prompt. The final output should be a polished, professional, and complete response that incorporates the best aspects of all provided materials.', true, 1)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    prompt_text = EXCLUDED.prompt_text,
    is_active = EXCLUDED.is_active,
    version = EXCLUDED.version;
