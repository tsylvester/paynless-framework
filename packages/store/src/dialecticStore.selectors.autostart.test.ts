import { describe, it, expect } from 'vitest';
import { selectDefaultGenerationModels } from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type { DialecticStateValues, AIModelCatalogEntry, SelectedModels } from '@paynless/types';

function catalogEntry(overrides: Partial<AIModelCatalogEntry>): AIModelCatalogEntry {
  const base: AIModelCatalogEntry = {
    id: 'base-id',
    provider_name: 'Provider',
    model_name: 'Base Model',
    api_identifier: 'api-id',
    description: null,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    is_default_generation: false,
  };
  return { ...base, ...overrides };
}

function stateWithCatalog(entries: AIModelCatalogEntry[]): DialecticStateValues {
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
      catalogEntry({ id: 'm1', model_name: 'Model One', is_default_generation: false, is_active: true }),
      catalogEntry({ id: 'm2', model_name: 'Model Two', is_default_generation: false, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([]);
  });

  it('returns only models where both is_default_generation === true and is_active === true', () => {
    const state: DialecticStateValues = stateWithCatalog([
      catalogEntry({ id: 'default-active', model_name: 'Default Active', is_default_generation: true, is_active: true }),
      catalogEntry({ id: 'not-default', model_name: 'Not Default', is_default_generation: false, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([{ id: 'default-active', displayName: 'Default Active' }]);
  });

  it('excludes models where is_default_generation === true but is_active === false', () => {
    const state: DialecticStateValues = stateWithCatalog([
      catalogEntry({ id: 'default-inactive', model_name: 'Default Inactive', is_default_generation: true, is_active: false }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([]);
  });

  it('returns correct SelectedModels shape { id, displayName } mapped from AIModelCatalogEntry', () => {
    const state: DialecticStateValues = stateWithCatalog([
      catalogEntry({ id: 'model-a', model_name: 'Model A Display', is_default_generation: true, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'model-a', displayName: 'Model A Display' });
    expect(typeof result[0].id).toBe('string');
    expect(typeof result[0].displayName).toBe('string');
  });

  it('handles multiple default models correctly and returns all matching', () => {
    const state: DialecticStateValues = stateWithCatalog([
      catalogEntry({ id: 'd1', model_name: 'Default One', is_default_generation: true, is_active: true }),
      catalogEntry({ id: 'd2', model_name: 'Default Two', is_default_generation: true, is_active: true }),
      catalogEntry({ id: 'other', model_name: 'Other', is_default_generation: false, is_active: true }),
    ]);
    const result: SelectedModels[] = selectDefaultGenerationModels(state);
    expect(result).toEqual([
      { id: 'd1', displayName: 'Default One' },
      { id: 'd2', displayName: 'Default Two' },
    ]);
  });
});
