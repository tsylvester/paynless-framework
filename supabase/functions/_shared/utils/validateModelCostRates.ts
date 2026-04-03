export type ValidatedCostRates = {
    inputRate: number;
    outputRate: number;
};

export function validateModelCostRates(
    inputRate: number | null,
    outputRate: number | null,
): ValidatedCostRates {
    if (typeof inputRate !== 'number' || inputRate < 0 || typeof outputRate !== 'number' || outputRate <= 0) {
        throw new Error('Model configuration is missing valid token cost rates.');
    }
    const validated: ValidatedCostRates = { inputRate, outputRate };
    return validated;
}
