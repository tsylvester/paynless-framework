import { DialecticStage } from '@paynless/types'; // Import the enum

export interface DialecticStageDefinition {
  name: string; // e.g., 'THESIS', maps to DialecticStage enum keys
  displayName: string; // e.g., 'Hypothesis', 'Antithesis' for UI
  stageNumber: number; // e.g., 1, 2, for ordering or display
  slug: DialecticStage; // e.g., DialecticStage.THESIS (which is 'thesis'), for internal logic and matching enum
  // Add any other stage-specific properties if needed later
}

export const DIALECTIC_STAGES: DialecticStageDefinition[] = [
  {
    name: 'THESIS',
    displayName: 'Hypothesis',
    stageNumber: 1,
    slug: DialecticStage.THESIS, // 'thesis'
  },
  {
    name: 'ANTITHESIS',
    displayName: 'Antithesis',
    stageNumber: 2,
    slug: DialecticStage.ANTITHESIS, // 'antithesis'
  },
  {
    name: 'SYNTHESIS',
    displayName: 'Synthesis',
    stageNumber: 3,
    slug: DialecticStage.SYNTHESIS, // 'synthesis'
  },
  {
    name: 'PARENTHESIS',
    displayName: 'Parenthesis',
    stageNumber: 4,
    slug: DialecticStage.PARENTHESIS, // 'parenthesis'
  },
  {
    name: 'PARALYSIS',
    displayName: 'Paralysis',
    stageNumber: 5,
    slug: DialecticStage.PARALYSIS, // 'paralysis'
  },
  // Add more stages here as defined in the project phases
];

/**
 * Derives the stage slug (from DialecticStage enum) from a session status string.
 * Examples: 'pending_thesis' -> 'thesis', 'antithesis_complete' -> 'antithesis'
 * @param sessionStatus The status string from the dialectic_sessions table.
 * @returns The corresponding stage slug (a DialecticStage enum value), or null if no match.
 */
export const getStageSlugFromStatus = (sessionStatus: string | null | undefined): DialecticStage | null => {
  if (!sessionStatus) return null;

  const lowerStatus = sessionStatus.toLowerCase();

  // Prioritize checking if the status string *contains* one of the known stage slugs (enum values)
  // Sort by slug length descending to catch longer slugs (e.g., "antithesis") before shorter ones ("thesis")
  const sortedStages = [...DIALECTIC_STAGES].sort((a, b) => b.slug.length - a.slug.length);

  for (const stage of sortedStages) {
    if (lowerStatus.includes(stage.slug)) {
      return stage.slug;
    }
  }
  
  // Fallback for patterns like 'pending_...', '..._complete', '..._error'
  const match = lowerStatus.match(/^(?:pending_)?(thesis|antithesis|synthesis|parenthesis|paralysis)(?:_complete|_error|_generating)?$/);
  if (match && match[1]) {
    const potentialSlug = match[1] as DialecticStage;
    if (DIALECTIC_STAGES.some(s => s.slug === potentialSlug)) {
      return potentialSlug;
    }
  }

  // Default to the first stage's slug if it's a very early, undefined status
  if (DIALECTIC_STAGES.length > 0 && (lowerStatus === 'active' || lowerStatus === 'session_started')) {
      return DIALECTIC_STAGES[0].slug; 
  }

  console.warn(`[getStageSlugFromStatus] Could not derive valid stage slug from status: ${sessionStatus}`);
  // Return null or a default first stage if no specific match, to prevent errors.
  // Returning the first stage slug might be a safer default for the UI to show *something*.
  return DIALECTIC_STAGES.length > 0 ? DIALECTIC_STAGES[0].slug : null;
}; 