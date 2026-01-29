import type { InputRule } from '../../dialectic-service/dialectic.interface.ts';

const validRuleTypes = new Set(['document', 'feedback', 'header_context', 'seed_prompt', 'project_resource', 'contribution']);

export function parseInputArtifactRules(rules: InputRule[]): InputRule[] {
    if (!Array.isArray(rules)) {
        throw new Error('Input rules must be an array.');
    }

    const parsedRules: InputRule[] = rules.map(
        (rule: InputRule, index: number): InputRule => {
            if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
                throw new Error(`Input rule at index ${index} must be a JSON object.`);
            }

            if (!('type' in rule) || typeof rule.type !== 'string') {
                throw new Error(
                    `Input rule at index ${index} must contain a valid "type" string property.`
                );
            }

            if (!validRuleTypes.has(rule.type)) {
                throw new Error(`Input rule at index ${index} has an invalid "type".`);
            }

            // The object is already of type InputRule, so we just need to validate it
            // and return it. We can add more granular validation here if needed in the future.
            return rule;
        }
    );

    return parsedRules;
} 