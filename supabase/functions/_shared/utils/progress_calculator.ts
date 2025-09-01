import type { ProcessingStrategy } from '../../dialectic-service/dialectic.interface.ts';

export function calculateTotalSteps(
    strategy: ProcessingStrategy,
    models: unknown[],
    contributions: unknown[]
): number {
    if (!models.length || !contributions.length) {
        return 0;
    }

    switch (strategy.granularity) {
        case 'per_thesis_contribution':
            return models.length * contributions.length;
        case 'per_pairwise_synthesis':
            // This will become more complex in Phase 9. For now, it's n * m.
            return models.length * contributions.length;
        default:
            return 0;
    }
} 