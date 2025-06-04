import { describe, it, expect } from 'vitest';
import {
    selectAvailableDomainTags,
    selectIsLoadingDomainTags,
    selectDomainTagsError,
    selectSelectedDomainTag,
    selectSelectedStageAssociation,
    selectAvailableDomainOverlays,
    selectIsLoadingDomainOverlays,
    selectDomainOverlaysError,
    selectOverlay,
    selectSelectedDomainOverlayId,
    selectDialecticProjects,
    selectIsLoadingProjects,
    selectProjectsError,
    selectCurrentProjectDetail,
    selectIsLoadingProjectDetail,
    selectProjectDetailError,
    selectModelCatalog,
    selectIsLoadingModelCatalog,
    selectModelCatalogError,
    selectIsCreatingProject,
    selectCreateProjectError,
    selectIsStartingSession,
    selectStartSessionError,
    selectContributionContentCache
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type { DialecticStateValues, ApiError, DomainOverlayDescriptor, DialecticProject, AIModelCatalogEntry } from '@paynless/types';

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

    // Tests for selectOverlay
    describe('selectOverlay', () => {
        const overlayState: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedStageAssociation: 'thesis',
            availableDomainOverlays: [
                { id: 'ov1', domainTag: 'tech', description: 'Tech Thesis Overlay 1', stageAssociation: 'thesis' },
                { id: 'ov2', domainTag: 'tech', description: 'Tech Thesis Overlay 2', stageAssociation: 'thesis' },
                { id: 'ov3', domainTag: 'health', description: 'Health Thesis Overlay', stageAssociation: 'thesis' },
                { id: 'ov4', domainTag: 'tech', description: 'Tech Antithesis Overlay', stageAssociation: 'antithesis' },
            ],
        };

        it('should return overlays filtered by domainTag and selectedStageAssociation', () => {
            const result = selectOverlay(overlayState, 'tech');
            expect(result).toEqual([
                { id: 'ov1', domainTag: 'tech', description: 'Tech Thesis Overlay 1', stageAssociation: 'thesis' },
                { id: 'ov2', domainTag: 'tech', description: 'Tech Thesis Overlay 2', stageAssociation: 'thesis' },
            ]);
        });

        it('should return an empty array if domainTag is null', () => {
            const result = selectOverlay(overlayState, null);
            expect(result).toEqual([]);
        });

        it('should return an empty array if selectedStageAssociation is null', () => {
            const stateWithNullStage = { ...overlayState, selectedStageAssociation: null };
            const result = selectOverlay(stateWithNullStage, 'tech');
            expect(result).toEqual([]);
        });

        it('should return an empty array if availableDomainOverlays is null', () => {
            const stateWithNullOverlays = { ...overlayState, availableDomainOverlays: null };
            const result = selectOverlay(stateWithNullOverlays, 'tech');
            expect(result).toEqual([]);
        });

        it('should return an empty array if availableDomainOverlays is empty', () => {
            const stateWithEmptyOverlays = { ...overlayState, availableDomainOverlays: [] };
            const result = selectOverlay(stateWithEmptyOverlays, 'tech');
            expect(result).toEqual([]);
        });

        it('should return an empty array if no overlays match the domainTag', () => {
            const result = selectOverlay(overlayState, 'finance');
            expect(result).toEqual([]);
        });

        it('should return an empty array if no overlays match the stageAssociation (even if domainTag matches)', () => {
            const stateWithDifferentStageSelected = { ...overlayState, selectedStageAssociation: 'synthesis'};
            const result = selectOverlay(stateWithDifferentStageSelected, 'tech'); // tech overlays exist, but for thesis/antithesis
            expect(result).toEqual([]);
        });
    });

    // Tests for remaining simple selectors
    it('selectSelectedDomainOverlayId should return selectedDomainOverlayId from testState and initial', () => {
        expect(selectSelectedDomainOverlayId(testState)).toBe(initialDialecticStateValues.selectedDomainOverlayId); // Assuming testState doesn't set it differently from initial
        expect(selectSelectedDomainOverlayId(initialState)).toBe(initialDialecticStateValues.selectedDomainOverlayId);
    });

    it('selectDialecticProjects should return projects from testState and initial', () => {
        testState.projects = [{ id: 'proj1' } as DialecticProject]; // Example project
        expect(selectDialecticProjects(testState)).toEqual(testState.projects);
        expect(selectDialecticProjects(initialState)).toEqual(initialDialecticStateValues.projects);
    });

    it('selectIsLoadingProjects should return isLoadingProjects from testState and initial', () => {
        testState.isLoadingProjects = true;
        expect(selectIsLoadingProjects(testState)).toBe(true);
        expect(selectIsLoadingProjects(initialState)).toBe(initialDialecticStateValues.isLoadingProjects);
    });

    it('selectProjectsError should return projectsError from testState and initial', () => {
        testState.projectsError = { code: 'PROJ_ERR', message: 'Project Error' };
        expect(selectProjectsError(testState)).toEqual(testState.projectsError);
        expect(selectProjectsError(initialState)).toBe(initialDialecticStateValues.projectsError);
    });

    it('selectCurrentProjectDetail should return currentProjectDetail from testState and initial', () => {
        testState.currentProjectDetail = { id: 'projDetail1' } as DialecticProject;
        expect(selectCurrentProjectDetail(testState)).toEqual(testState.currentProjectDetail);
        expect(selectCurrentProjectDetail(initialState)).toBe(initialDialecticStateValues.currentProjectDetail);
    });

    it('selectIsLoadingProjectDetail should return isLoadingProjectDetail from testState and initial', () => {
        testState.isLoadingProjectDetail = true;
        expect(selectIsLoadingProjectDetail(testState)).toBe(true);
        expect(selectIsLoadingProjectDetail(initialState)).toBe(initialDialecticStateValues.isLoadingProjectDetail);
    });

    it('selectProjectDetailError should return projectDetailError from testState and initial', () => {
        testState.projectDetailError = { code: 'DETAIL_ERR', message: 'Detail Error' };
        expect(selectProjectDetailError(testState)).toEqual(testState.projectDetailError);
        expect(selectProjectDetailError(initialState)).toBe(initialDialecticStateValues.projectDetailError);
    });

    it('selectModelCatalog should return modelCatalog from testState and initial', () => {
        testState.modelCatalog = [{ id: 'model1' } as AIModelCatalogEntry];
        expect(selectModelCatalog(testState)).toEqual(testState.modelCatalog);
        expect(selectModelCatalog(initialState)).toEqual(initialDialecticStateValues.modelCatalog);
    });

    it('selectIsLoadingModelCatalog should return isLoadingModelCatalog from testState and initial', () => {
        testState.isLoadingModelCatalog = true;
        expect(selectIsLoadingModelCatalog(testState)).toBe(true);
        expect(selectIsLoadingModelCatalog(initialState)).toBe(initialDialecticStateValues.isLoadingModelCatalog);
    });

    it('selectModelCatalogError should return modelCatalogError from testState and initial', () => {
        testState.modelCatalogError = { code: 'CATALOG_ERR', message: 'Catalog Error' };
        expect(selectModelCatalogError(testState)).toEqual(testState.modelCatalogError);
        expect(selectModelCatalogError(initialState)).toBe(initialDialecticStateValues.modelCatalogError);
    });

    it('selectIsCreatingProject should return isCreatingProject from testState and initial', () => {
        testState.isCreatingProject = true;
        expect(selectIsCreatingProject(testState)).toBe(true);
        expect(selectIsCreatingProject(initialState)).toBe(initialDialecticStateValues.isCreatingProject);
    });

    it('selectCreateProjectError should return createProjectError from testState and initial', () => {
        testState.createProjectError = { code: 'CREATE_ERR', message: 'Create Error' };
        expect(selectCreateProjectError(testState)).toEqual(testState.createProjectError);
        expect(selectCreateProjectError(initialState)).toBe(initialDialecticStateValues.createProjectError);
    });

    it('selectIsStartingSession should return isStartingSession from testState and initial', () => {
        testState.isStartingSession = true;
        expect(selectIsStartingSession(testState)).toBe(true);
        expect(selectIsStartingSession(initialState)).toBe(initialDialecticStateValues.isStartingSession);
    });

    it('selectStartSessionError should return startSessionError from testState and initial', () => {
        testState.startSessionError = { code: 'SESSION_ERR', message: 'Session Error' };
        expect(selectStartSessionError(testState)).toEqual(testState.startSessionError);
        expect(selectStartSessionError(initialState)).toBe(initialDialecticStateValues.startSessionError);
    });

    it('selectContributionContentCache should return contributionContentCache from testState and initial', () => {
        testState.contributionContentCache = { 'contrib1': { isLoading: false } };
        expect(selectContributionContentCache(testState)).toEqual(testState.contributionContentCache);
        expect(selectContributionContentCache(initialState)).toEqual(initialDialecticStateValues.contributionContentCache);
    });
}); 