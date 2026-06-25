import type {
    ComputeCostCeilingDeps,
    ComputeCostCeilingParams,
    ComputeCostCeilingPayload,
    ComputeCostCeilingReturn,
    ComputeCostCeilingSuccessReturn,
    ComputeCostCeilingErrorReturn,
} from './computeCostCeiling.interface';
import { isComputeCostCeilingPayload } from './computeCostCeiling.guard';

export function computeCostCeiling(
    _deps: ComputeCostCeilingDeps,
    _params: ComputeCostCeilingParams,
    payload: ComputeCostCeilingPayload,
): ComputeCostCeilingReturn {

    if (!isComputeCostCeilingPayload(payload)) {
        const errorResult: ComputeCostCeilingErrorReturn = {
            error: {
                code: 'VALIDATION',
                message: 'invalid payload',
            },
        };
        return errorResult;
    }

    const ratesSum: number = payload.outputTokenCostRates.reduce(
        (sum: number, rate: number) => sum + rate,
        0,
    );
    const meanRate: number = ratesSum / payload.outputTokenCostRates.length;

    const stageCeilings: Record<string, number> = {};
    let projectCeiling: number = 0;

    for (const stage of payload.stages) {
        if (stage.contributions.length === 0) {
            const estimate: number =
                stage.expectedCount * payload.maxOutputTokens * meanRate;
            stageCeilings[stage.stageSlug] = estimate;
            projectCeiling += estimate;
        } else {
            let actual: number = 0;
            for (const contribution of stage.contributions) {
                actual +=
                    contribution.tokensUsedInput * contribution.inputTokenCostRate +
                    contribution.tokensUsedOutput * contribution.outputTokenCostRate;
            }
            stageCeilings[stage.stageSlug] = actual;
            projectCeiling += actual;
        }
    }

    const success: ComputeCostCeilingSuccessReturn = {
        stageCeilings,
        projectCeiling,
    };
    return success;
}
