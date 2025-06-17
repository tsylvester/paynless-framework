import { describe, it, expect } from 'vitest';
import {
    selectDomains,
    selectIsLoadingDomains,
    selectDomainsError,
    selectSelectedDomain,
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
    selectContributionContentCache,
    selectCurrentProcessTemplate,
    selectIsLoadingProcessTemplate,
    selectProcessTemplateError,
    selectCurrentProjectInitialPrompt,
    selectCurrentProjectSessions,
    selectIsUpdatingProjectPrompt,
    selectCurrentProjectId,
    selectSelectedModelIds,
    selectContributionById,
    selectSaveContributionEditError,
    selectActiveContextProjectId,
    selectActiveContextSessionId,
    selectActiveContextStage
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import type { 
    DialecticStateValues, 
    ApiError, 
    DomainOverlayDescriptor, 
    DialecticProject, 
    AIModelCatalogEntry, 
    DialecticDomain, 
    DialecticStage,
    DialecticProcessTemplate,
    DialecticSession,
    DialecticContribution,
} from '@paynless/types';

const mockThesisStage: DialecticStage = {
    id: 's1',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'Mock thesis stage',
    created_at: new Date().toISOString(),
    default_system_prompt_id: 'sp-1',
    input_artifact_rules: null,
    expected_output_artifacts: null,
};

const mockSynthesisStage: DialecticStage = {
    ...mockThesisStage,
    id: 's3',
    slug: 'synthesis',
    display_name: 'Synthesis',
};

describe('Dialectic Store Selectors', () => {
    const mockOverlays: DomainOverlayDescriptor[] = [
        { id: 'ov1', domainId: 'dom1', description: 'Desc 1', stageAssociation: 'thesis', domainName: 'Domain 1', overlay_values: {} },
        { id: 'ov2', domainId: 'dom2', description: null, stageAssociation: 'thesis', domainName: 'Domain 2', overlay_values: {} },
    ];
    const mockOverlayError: ApiError = { code: 'OVERLAY_ERR', message: 'Test Overlay Error' };
    const mockDomains: DialecticDomain[] = [
        { id: 'dom1', name: 'Domain 1', description: 'Test domain 1', parent_domain_id: null },
        { id: 'dom2', name: 'Domain 2', description: 'Test domain 2', parent_domain_id: null },
    ];
    const mockDomainsError: ApiError = { code: 'DOMAIN_ERR', message: 'Test Domain Error' };
    const mockProcessTemplate: DialecticProcessTemplate = {
        id: 'pt-1',
        name: 'Test Template',
        description: 'A test template',
        domain_id: 'dom1',
        created_at: new Date().toISOString(),
        starting_stage_id: 's1'
    };
    const mockProcessTemplateError: ApiError = { code: 'TEMPLATE_ERR', message: 'Test Template Error' };
    const mockSaveContributionError: ApiError = { code: 'SAVE_ERR', message: 'Test Save Error' };

    const mockSessions: DialecticSession[] = [
        {
            id: 'session-1',
            project_id: 'projDetail1',
            session_description: 'Session One',
            iteration_count: 1,
            selected_model_catalog_ids: ['model-1'],
            status: 'active',
            associated_chat_id: 'chat-1',
            current_stage_id: 's1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_input_reference_url: null,
            dialectic_contributions: [
                { id: 'c1', session_id: 'session-1' } as DialecticContribution,
            ]
        }
    ];

    const mockProjectDetail: DialecticProject = {
        id: 'projDetail1',
        user_id: 'user1',
        project_name: 'Detailed Project',
        initial_user_prompt: 'Initial Prompt Text',
        selected_domain_id: 'domain1',
        dialectic_domains: { name: 'Tech' },
        selected_domain_overlay_id: 'overlay1',
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: mockSessions,
        resources: [],
        process_template_id: 'pt1',
        dialectic_process_templates: mockProcessTemplate,
    };

    const testState: DialecticStateValues = {
        ...initialDialecticStateValues,
        domains: mockDomains,
        isLoadingDomains: true,
        domainsError: mockDomainsError,
        selectedDomain: mockDomains[0],
        selectedStageAssociation: mockThesisStage,
        availableDomainOverlays: mockOverlays,
        isLoadingDomainOverlays: true,
        domainOverlaysError: mockOverlayError,
        currentProcessTemplate: mockProcessTemplate,
        isLoadingProcessTemplate: true,
        processTemplateError: mockProcessTemplateError,
        isUpdatingProjectPrompt: true,
        selectedModelIds: ['model-1', 'model-2'],
        saveContributionEditError: mockSaveContributionError,
        activeContextProjectId: 'projDetail1',
        activeContextSessionId: 'session-1',
        activeContextStage: mockThesisStage,
        currentProjectDetail: mockProjectDetail,
    };

    const initialState: DialecticStateValues = {
        ...initialDialecticStateValues,
    };

    it('selectDomains should return domains from testState', () => {
        expect(selectDomains(testState)).toEqual(mockDomains);
    });

    it('selectDomains should return initial empty array from initialState', () => {
        expect(selectDomains(initialState)).toEqual([]);
    });

    it('selectIsLoadingDomains should return isLoadingDomains from testState', () => {
        expect(selectIsLoadingDomains(testState)).toBe(true);
    });

    it('selectIsLoadingDomains should return initial false from initialState', () => {
        expect(selectIsLoadingDomains(initialState)).toBe(false);
    });

    it('selectDomainsError should return domainsError from testState', () => {
        expect(selectDomainsError(testState)).toEqual(mockDomainsError);
    });

    it('selectDomainsError should return initial null from initialState', () => {
        expect(selectDomainsError(initialState)).toBeNull();
    });

    it('selectSelectedDomain should return selectedDomain from testState', () => {
        expect(selectSelectedDomain(testState)).toEqual(mockDomains[0]);
    });

    it('selectSelectedDomain should return initial null from initialState', () => {
        expect(selectSelectedDomain(initialState)).toBeNull();
    });

    it('selectSelectedStageAssociation should return selectedStageAssociation from testState', () => {
        expect(selectSelectedStageAssociation(testState)).toEqual(mockThesisStage);
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
            selectedStageAssociation: mockThesisStage,
            availableDomainOverlays: [
                { id: 'ov1', domainId: 'dom1', description: 'Tech Thesis Overlay 1', stageAssociation: 'thesis', domainName: 'Domain 1', overlay_values: {} },
                { id: 'ov2', domainId: 'dom1', description: 'Tech Thesis Overlay 2', stageAssociation: 'thesis', domainName: 'Domain 1', overlay_values: {} },
                { id: 'ov3', domainId: 'dom2', description: 'Health Thesis Overlay', stageAssociation: 'thesis', domainName: 'Domain 2', overlay_values: {} },
                { id: 'ov4', domainId: 'dom1', description: 'Tech Antithesis Overlay', stageAssociation: 'antithesis', domainName: 'Domain 1', overlay_values: {} },
            ],
        };

        it('should return overlays filtered by domainId and selectedStageAssociation', () => {
            const result = selectOverlay(overlayState, 'dom1');
            expect(result).toEqual([
                { id: 'ov1', domainId: 'dom1', description: 'Tech Thesis Overlay 1', stageAssociation: 'thesis', domainName: 'Domain 1', overlay_values: {} },
                { id: 'ov2', domainId: 'dom1', description: 'Tech Thesis Overlay 2', stageAssociation: 'thesis', domainName: 'Domain 1', overlay_values: {} },
            ]);
        });

        it('should return an empty array if domainId is null', () => {
            const result = selectOverlay(overlayState, null);
            expect(result).toEqual([]);
        });

        it('should return an empty array if selectedStageAssociation is null', () => {
            const stateWithNullStage = { ...overlayState, selectedStageAssociation: null };
            const result = selectOverlay(stateWithNullStage, 'dom1');
            expect(result).toEqual([]);
        });

        it('should return an empty array if availableDomainOverlays is null', () => {
            const stateWithNullOverlays = { ...overlayState, availableDomainOverlays: null };
            const result = selectOverlay(stateWithNullOverlays, 'dom1');
            expect(result).toEqual([]);
        });

        it('should return an empty array if availableDomainOverlays is empty', () => {
            const stateWithEmptyOverlays = { ...overlayState, availableDomainOverlays: [] };
            const result = selectOverlay(stateWithEmptyOverlays, 'dom1');
            expect(result).toEqual([]);
        });

        it('should return an empty array if no overlays match the domainId', () => {
            const result = selectOverlay(overlayState, 'dom3');
            expect(result).toEqual([]);
        });

        it('should return an empty array if no overlays match the stageAssociation (even if domainId matches)', () => {
            const stateWithDifferentStageSelected = { ...overlayState, selectedStageAssociation: mockSynthesisStage};
            const result = selectOverlay(stateWithDifferentStageSelected, 'dom1'); // dom1 overlays exist, but for thesis/antithesis
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
        expect(selectCurrentProjectDetail(testState)).toEqual(mockProjectDetail);
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
        testState.contributionContentCache = { 'c1': { isLoading: false } };
        expect(selectContributionContentCache(testState)).toEqual(testState.contributionContentCache);
        expect(selectContributionContentCache(initialState)).toEqual(initialDialecticStateValues.contributionContentCache);
    });

    it('selectCurrentProcessTemplate should return process template from testState and initial', () => {
        expect(selectCurrentProcessTemplate(testState)).toEqual(mockProcessTemplate);
        expect(selectCurrentProcessTemplate(initialState)).toBeNull();
    });

    it('selectIsLoadingProcessTemplate should return isLoading from testState and initial', () => {
        expect(selectIsLoadingProcessTemplate(testState)).toBe(true);
        expect(selectIsLoadingProcessTemplate(initialState)).toBe(false);
    });

    it('selectProcessTemplateError should return error from testState and initial', () => {
        expect(selectProcessTemplateError(testState)).toEqual(mockProcessTemplateError);
        expect(selectProcessTemplateError(initialState)).toBeNull();
    });

    it('selectCurrentProjectInitialPrompt should return the initial prompt from the current project', () => {
        expect(selectCurrentProjectInitialPrompt(testState)).toBe('Initial Prompt Text');
        expect(selectCurrentProjectInitialPrompt(initialState)).toBeUndefined();
    });

    it('selectCurrentProjectSessions should return sessions from the current project', () => {
        expect(selectCurrentProjectSessions(testState)).toEqual(mockSessions);
        expect(selectCurrentProjectSessions(initialState)).toBeUndefined();
    });

    it('selectIsUpdatingProjectPrompt should return the update status', () => {
        expect(selectIsUpdatingProjectPrompt(testState)).toBe(true);
        expect(selectIsUpdatingProjectPrompt(initialState)).toBe(false);
    });

    it('selectCurrentProjectId should return the ID from the current project', () => {
        expect(selectCurrentProjectId(testState)).toBe('projDetail1');
        expect(selectCurrentProjectId(initialState)).toBeUndefined();
    });

    it('selectSelectedModelIds should return the array of selected model IDs', () => {
        expect(selectSelectedModelIds(testState)).toEqual(['model-1', 'model-2']);
        expect(selectSelectedModelIds(initialState)).toEqual([]);
    });

    describe('selectContributionById', () => {
        it('should return the correct contribution when found', () => {
            const result = selectContributionById(testState, 'c1');
            expect(result).toBeDefined();
            expect(result?.id).toBe('c1');
        });

        it('should return undefined if the contribution is not found', () => {
            const result = selectContributionById(testState, 'c-nonexistent');
            expect(result).toBeUndefined();
        });

        it('should return undefined if there are no sessions', () => {
            const stateWithoutSessions = { ...testState, currentProjectDetail: { ...testState.currentProjectDetail, dialectic_sessions: [] } as DialecticProject };
            const result = selectContributionById(stateWithoutSessions, 'c1');
            expect(result).toBeUndefined();
        });
    });

    it('selectSaveContributionEditError should return the save error', () => {
        expect(selectSaveContributionEditError(testState)).toEqual(mockSaveContributionError);
        expect(selectSaveContributionEditError(initialState)).toBeNull();
    });

    it('selectActiveContextProjectId should return the active project ID', () => {
        expect(selectActiveContextProjectId(testState)).toBe('projDetail1');
        expect(selectActiveContextProjectId(initialState)).toBeNull();
    });

    it('selectActiveContextSessionId should return the active session ID', () => {
        expect(selectActiveContextSessionId(testState)).toBe('session-1');
        expect(selectActiveContextSessionId(initialState)).toBeNull();
    });

    it('selectActiveContextStage should return the active stage', () => {
        expect(selectActiveContextStage(testState)).toEqual(mockThesisStage);
        expect(selectActiveContextStage(initialState)).toBeNull();
    });
}); 