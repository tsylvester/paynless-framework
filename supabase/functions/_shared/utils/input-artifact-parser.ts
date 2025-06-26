import type { InputArtifactRules, ArtifactSourceRule, StageSpecificArtifactSourceRule, InitialPromptArtifactSourceRule } from '../../dialectic-service/dialectic.interface.ts';
import type { Json } from '../../types_db.ts';

export function parseInputArtifactRules(data: Json | null): InputArtifactRules {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Rules must be a JSON object.');
  }

  if (!('sources' in data) || !Array.isArray(data.sources)) {
    throw new Error('Rules object must contain a "sources" array.');
  }

  const sourcesRaw: (Json | undefined)[] = data.sources;

  const parsedSources: ArtifactSourceRule[] = sourcesRaw.map(
    (sourceRuleData: Json | undefined, index: number): ArtifactSourceRule => {
      if (sourceRuleData === null || typeof sourceRuleData !== 'object' || Array.isArray(sourceRuleData)) {
        throw new Error(`Source at index ${index} must be a JSON object.`);
      }

      if (!('type' in sourceRuleData) || typeof sourceRuleData.type !== 'string') {
        throw new Error(
          `Source at index ${index} must contain a valid "type" string property.`
        );
      }
      const type = sourceRuleData.type;

      let parsedRuleBase: Partial<Omit<ArtifactSourceRule, 'type'>> = {}; // For common optional fields

      // Process optional fields first (common to all types)
      const purpose = sourceRuleData.purpose;
      const required = sourceRuleData.required;
      const multiple = sourceRuleData.multiple;
      const section_header = sourceRuleData.section_header;

      if (purpose !== undefined) {
        if (typeof purpose === 'string') {
          parsedRuleBase.purpose = purpose;
        } else {
          throw new Error(`Source at index ${index} has 'purpose' with incorrect type. Expected string, got ${typeof purpose}.`);
        }
      }
      if (required !== undefined) {
        if (typeof required === 'boolean') {
          parsedRuleBase.required = required;
        } else {
          throw new Error(`Source at index ${index} has 'required' with incorrect type. Expected boolean, got ${typeof required}.`);
        }
      }
      if (multiple !== undefined) {
        if (typeof multiple === 'boolean') {
          parsedRuleBase.multiple = multiple;
        } else {
          throw new Error(`Source at index ${index} has 'multiple' with incorrect type. Expected boolean, got ${typeof multiple}.`);
        }
      }
      if (section_header !== undefined) {
        if (typeof section_header === 'string') {
          parsedRuleBase.section_header = section_header;
        } else {
          throw new Error(`Source at index ${index} has 'section_header' with incorrect type. Expected string, got ${typeof section_header}.`);
        }
      }

      if (type === 'contribution' || type === 'feedback') {
        if (!('stage_slug' in sourceRuleData) || typeof sourceRuleData.stage_slug !== 'string') {
          throw new Error(
            `Source at index ${index} of type '${type}' must contain a valid string "stage_slug" property.`
          );
        }
        return {
          type: type as 'contribution' | 'feedback',
          stage_slug: sourceRuleData.stage_slug,
          ...parsedRuleBase,
        } as StageSpecificArtifactSourceRule;
      } else if (type === 'initial_project_prompt') {
        // stage_slug is not applicable for initial_project_prompt
        if ('stage_slug' in sourceRuleData && sourceRuleData.stage_slug !== undefined) {
             throw new Error(
                `Source at index ${index} of type 'initial_project_prompt' should not contain a "stage_slug" property.`
             );
        }
        return {
          type: 'initial_project_prompt',
          // stage_slug is intentionally omitted or can be 'undefined' based on type def
          ...parsedRuleBase,
        } as InitialPromptArtifactSourceRule;
      } else {
        throw new Error(
          `Source at index ${index} has an invalid "type". Expected 'contribution', 'feedback', or 'initial_project_prompt', got "${type}".`
        );
      }
    }
  );

  const finalRules: InputArtifactRules = {
    sources: parsedSources,
  };

  return finalRules;
} 