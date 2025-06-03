import { describe, it, expect } from 'vitest';
import {
    selectAvailableDomainTags,
    selectIsLoadingDomainTags,
    selectDomainTagsError,
    selectSelectedDomainTag,
    selectSelectedStageAssociation,
    selectAvailableDomainOverlays,
    selectIsLoadingDomainOverlays,
    selectDomainOverlaysError
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type { DialecticStateValues } from './dialecticStore';
import type { ApiError, DomainOverlayDescriptor } from '@paynless/types';

describe('Dialectic Store Selectors', () => {
    const mockOverlays: DomainOverlayDescriptor[] = [
        { id: 'ov1', domainTag: 'Overlay 1', description: 'Desc 1', stageAssociation: 'thesis' },
        { id: 'ov2', domainTag: 'Overlay 2', description: null, stageAssociation: 'thesis' },
    ];
    const mockOverlayError: ApiError = { code: 'OVERLAY_ERR', message: 'Test Overlay Error' };

    const testState: DialecticStateValues = {
        ...initialDialecticStateValues,
        availableDomainTags: [ { id: 'tag1', domainTag: 'Test Tag 1', description: null, stageAssociation: null } ],
        isLoadingDomainTags: true,
        domainTagsError: { code: 'ERR', message: 'Test Error' } as ApiError,
        selectedDomainTag: 'tag1',
        selectedStageAssociation: 'thesis',
        availableDomainOverlays: mockOverlays,
        isLoadingDomainOverlays: true,
        domainOverlaysError: mockOverlayError,
    };

    const initialState: DialecticStateValues = {
        ...initialDialecticStateValues,
    };

    it('selectAvailableDomainTags should return availableDomainTags from testState', () => {
        expect(selectAvailableDomainTags(testState)).toEqual([ { id: 'tag1', domainTag: 'Test Tag 1', description: null, stageAssociation: null } ]);
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
        expect(selectSelectedDomainTag(testState)).toBe('tag1');
    });

    it('selectSelectedDomainTag should return initial null from initialState', () => {
        expect(selectSelectedDomainTag(initialState)).toBeNull();
    });

    it('selectSelectedStageAssociation should return selectedStageAssociation from testState', () => {
        expect(selectSelectedStageAssociation(testState)).toBe('thesis');
    });

    it('selectSelectedStageAssociation should return initial null from initialState', () => {
        expect(selectSelectedStageAssociation(initialState)).toBeNull();
    });

    it('selectAvailableDomainOverlays should return availableDomainOverlays from testState', () => {
        expect(selectAvailableDomainOverlays(testState)).toEqual(mockOverlays);
    });

    it('selectAvailableDomainOverlays should return initial empty array from initialState', () => {
        expect(selectAvailableDomainOverlays(initialState)).toEqual([]);
    });

    it('selectIsLoadingDomainOverlays should return isLoadingDomainOverlays from testState', () => {
        expect(selectIsLoadingDomainOverlays(testState)).toBe(true);
    });

    it('selectIsLoadingDomainOverlays should return initial false from initialState', () => {
        expect(selectIsLoadingDomainOverlays(initialState)).toBe(false);
    });

    it('selectDomainOverlaysError should return domainOverlaysError from testState', () => {
        expect(selectDomainOverlaysError(testState)).toEqual(mockOverlayError);
    });

    it('selectDomainOverlaysError should return initial null from initialState', () => {
        expect(selectDomainOverlaysError(initialState)).toBeNull();
    });
}); 