import {
    JobResultsWithModelProcessing,
    ModelProcessingResult,
} from '../../../dialectic-service/dialectic.interface.ts';

export function isModelProcessingResultStatus(
    value: unknown,
): value is ModelProcessingResult['status'] {
    if (typeof value !== 'string') {
        return false;
    }
    return (
        value === 'completed' ||
        value === 'failed' ||
        value === 'needs_continuation' ||
        value === 'continuation_limit_reached'
    );
}

export function isModelProcessingResult(record: unknown): record is ModelProcessingResult {
    if (typeof record !== 'object' || record === null) {
        return false;
    }

    const checks: { key: keyof ModelProcessingResult; type: string; nullable?: boolean }[] = [
        { key: 'modelId', type: 'string' },
        { key: 'status', type: 'string' },
        { key: 'attempts', type: 'number' },
        { key: 'contributionId', type: 'string', nullable: true },
        { key: 'error', type: 'string', nullable: true },
    ];

    for (const check of checks) {
        const descriptor = Object.getOwnPropertyDescriptor(record, check.key);

        if (!descriptor) {
            if (check.nullable) continue;
            return false;
        }

        const value: unknown = descriptor.value;

        if (check.nullable && (value === null || typeof value === 'undefined')) {
            continue;
        }

        if (typeof value !== check.type) {
            return false;
        }

        if (check.key === 'status') {
            if (!isModelProcessingResultStatus(value)) {
                return false;
            }
        }
    }
    return true;
}

export function isJobResultsWithModelProcessing(
    results: unknown,
): results is JobResultsWithModelProcessing {
    if (typeof results !== 'object' || results === null || !('modelProcessingResults' in results)) {
        return false;
    }
    const { modelProcessingResults } = results;
    if (!Array.isArray(modelProcessingResults)) {
        return false;
    }

    return modelProcessingResults.every(isModelProcessingResult);
}
