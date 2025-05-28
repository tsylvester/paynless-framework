import { describe, it, expect } from 'vitest';
import {
    selectAvailableDomainTags,
    selectIsLoadingDomainTags,
    selectDomainTagsError,
    selectSelectedDomainTag
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type { DialecticStateValues } from './dialecticStore';
import type { ApiError } from '@paynless/types';

describe('Dialectic Store Selectors', () => {
    const testState: DialecticStateValues = {
        ...initialDialecticStateValues,
        availableDomainTags: ['test1', 'test2'],
        isLoadingDomainTags: true,
        domainTagsError: { code: 'ERR', message: 'Test Error' } as ApiError,
        selectedDomainTag: 'test1',
    };

    const initialState: DialecticStateValues = {
        ...initialDialecticStateValues,
    };

    it('selectAvailableDomainTags should return availableDomainTags from testState', () => {
        expect(selectAvailableDomainTags(testState)).toEqual(['test1', 'test2']);
    });

    it('selectAvailableDomainTags should return initial empty array from initialState', () => {
        expect(selectAvailableDomainTags(initialState)).toEqual([]);
    });

    it('selectIsLoadingDomainTags should return isLoadingDomainTags from testState', () => {
        expect(selectIsLoadingDomainTags(testState)).toBe(true);
    });

    it('selectIsLoadingDomainTags should return initial false from initialState', () => {
        expect(selectIsLoadingDomainTags(initialState)).toBe(false);
    });

    it('selectDomainTagsError should return domainTagsError from testState', () => {
        expect(selectDomainTagsError(testState)).toEqual({ code: 'ERR', message: 'Test Error' });
    });

    it('selectDomainTagsError should return initial null from initialState', () => {
        expect(selectDomainTagsError(initialState)).toBeNull();
    });

    it('selectSelectedDomainTag should return selectedDomainTag from testState', () => {
        expect(selectSelectedDomainTag(testState)).toBe('test1');
    });

    it('selectSelectedDomainTag should return initial null from initialState', () => {
        expect(selectSelectedDomainTag(initialState)).toBeNull();
    });
}); 