import { describe, it, expect } from 'vitest';
import { selectDefaultGenerationModels } from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type { AiProvidersRow, DialecticStateValues, SelectedModels } from '@paynless/types';
import { mockAiProvidersRow } from '../../../apps/web/src/mocks/dialecticStore.mock';

function stateWithCatalog(entries: AiProvidersRow[]): DialecticStateValues {
  return { ...initialDialecticStateValues, modelCatalog: entries };
}

describe('selectDefaultGenerationModels', () => {
  it('returns empty array when modelCatalog is empty', () => {
    const state: DialecticStateValues = stateWithCatalog([]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([]);
  });

  it('returns empty array when no models have is_default_generation === true', () => {
    const state: DialecticStateValues = stateWithCatalog([
      mockAiProvidersRow({ id: 'm1', name: 'Model One', is_default_generation: false, is_active: true }),
      mockAiProvidersRow({ id: 'm2', name: 'Model Two', is_default_generation: false, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([]);
  });

  it('returns only models where both is_default_generation === true and is_active === true', () => {
    const state: DialecticStateValues = stateWithCatalog([
      mockAiProvidersRow({ id: 'default-active', name: 'Default Active', is_default_generation: true, is_active: true }),
      mockAiProvidersRow({ id: 'not-default', name: 'Not Default', is_default_generation: false, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([{ id: 'default-active', displayName: 'Default Active' }]);
  });

  it('excludes models where is_default_generation === true but is_active === false', () => {
    const state: DialecticStateValues = stateWithCatalog([
      mockAiProvidersRow({ id: 'default-inactive', name: 'Default Inactive', is_default_generation: true, is_active: false }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([]);
  });

  it('returns correct SelectedModels shape { id, displayName } mapped from AiProvidersRow', () => {
    const state: DialecticStateValues = stateWithCatalog([
      mockAiProvidersRow({ id: 'model-a', name: 'Model A Display', is_default_generation: true, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'model-a', displayName: 'Model A Display' });
    expect(typeof result[0].id).toBe('string');
    expect(typeof result[0].displayName).toBe('string');
  });

  it('handles multiple default models correctly and returns all matching', () => {
    const state: DialecticStateValues = stateWithCatalog([
      mockAiProvidersRow({ id: 'd1', name: 'Default One', is_default_generation: true, is_active: true }),
      mockAiProvidersRow({ id: 'd2', name: 'Default Two', is_default_generation: true, is_active: true }),
      mockAiProvidersRow({ id: 'other', name: 'Other', is_default_generation: false, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([
      { id: 'd1', displayName: 'Default One' },
      { id: 'd2', displayName: 'Default Two' },
    ]);
  });

  it('selectDefaultGenerationModels does not filter by min_plan_tier_level', () => {
    const state: DialecticStateValues = stateWithCatalog([
      mockAiProvidersRow({
        id: 'high-tier-default',
        name: 'High Tier Default',
        is_default_generation: true,
        is_active: true,
        min_plan_tier_level: 30,
      }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([
      { id: 'high-tier-default', displayName: 'High Tier Default' },
    ]);
  });
});
