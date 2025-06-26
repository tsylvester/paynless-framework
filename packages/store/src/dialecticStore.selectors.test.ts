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
    selectActiveContextStage,
    selectIsStageReadyForSessionIteration,
    selectContributionGenerationStatus,
    selectGenerateContributionsError,
    selectAllContributionsFromCurrentProject,
    selectSessionById,
    selectStageById,
    selectFeedbackForStageIteration
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
    DialecticProjectResource,
    DialecticFeedback
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
    const mockStage1: DialecticStage = { 
        id: 'stage-abc', 
        slug: 'mock-stage-1', 
        display_name: 'Mock Stage 1', 
        description: 'First mock stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'sp-1',
        input_artifact_rules: null,
        expected_output_artifacts: null,
    };
    const mockStage2: DialecticStage = { 
        id: 'stage-def', 
        slug: 'mock-stage-2', 
        display_name: 'Mock Stage 2', 
        description: 'Second mock stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'sp-2',
        input_artifact_rules: null,
        expected_output_artifacts: null,
    };
    const mockProcessTemplate: DialecticProcessTemplate = {
        id: 'pt-1',
        name: 'Test Template',
        description: 'A test template',
        created_at: new Date().toISOString(),
        starting_stage_id: 'stage-abc',
        stages: [mockStage1, mockStage2],
    };
    const mockProcessTemplateError: ApiError = { code: 'TEMPLATE_ERR', message: 'Test Template Error' };
    const mockSaveContributionError: ApiError = { code: 'SAVE_ERR', message: 'Test Save Error' };
    const mockGenerateContributionsError: ApiError = { code: 'GEN_ERR', message: 'Test Generation Error' };

    const mockFeedback1S1ThesisIter1: DialecticFeedback = {
        id: 'fb1-s1-thesis-i1',
        session_id: 'session-1',
        project_id: 'projDetail1',
        user_id: 'user1',
        stage_slug: 'thesis',
        iteration_number: 1,
        storage_bucket: 'test-bucket',
        storage_path: 'path/to/feedback1.md',
        file_name: 'feedback1.md',
        mime_type: 'text/markdown',
        size_bytes: 100,
        feedback_type: 'StageReviewSummary_v1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockFeedback2S1ThesisIter1: DialecticFeedback = {
        ...mockFeedback1S1ThesisIter1,
        id: 'fb2-s1-thesis-i1',
        file_name: 'feedback2.md',
    };

    const mockFeedbackS1AntithesisIter1: DialecticFeedback = {
        ...mockFeedback1S1ThesisIter1,
        id: 'fb1-s1-antithesis-i1',
        stage_slug: 'antithesis',
        file_name: 'feedback_antithesis.md',
    };

    const mockFeedbackS1ThesisIter2: DialecticFeedback = {
        ...mockFeedback1S1ThesisIter1,
        id: 'fb1-s1-thesis-i2',
        iteration_number: 2,
        file_name: 'feedback_iter2.md',
    };

    const mockSessions: DialecticSession[] = [
        {
            id: 'session-1',
            project_id: 'projDetail1',
            session_description: 'Session One',
            iteration_count: 1,
            selected_model_ids: ['model-1'],
            status: 'active',
            associated_chat_id: 'chat-1',
            current_stage_id: 's1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_input_reference_url: null,
            dialectic_contributions: [
                { id: 'c1-s1', session_id: 'session-1' } as DialecticContribution,
                { id: 'c2-s1', session_id: 'session-1' } as DialecticContribution,
            ],
            feedback: [mockFeedback1S1ThesisIter1, mockFeedback2S1ThesisIter1, mockFeedbackS1AntithesisIter1, mockFeedbackS1ThesisIter2],
        },
        {
            id: 'session-2',
            project_id: 'projDetail1',
            session_description: 'Session Two',
            iteration_count: 1,
            selected_model_ids: ['model-2'],
            status: 'active',
            associated_chat_id: 'chat-2',
            current_stage_id: 's1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_input_reference_url: null,
            dialectic_contributions: [
                { id: 'c1-s2', session_id: 'session-2' } as DialecticContribution,
            ],
            feedback: [],
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
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
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
        contributionGenerationStatus: 'generating',
        generateContributionsError: mockGenerateContributionsError,
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
            const result = selectContributionById(testState, 'c1-s1');
            expect(result).toBeDefined();
            expect(result?.id).toBe('c1-s1');
        });

        it('should return undefined if the contribution is not found', () => {
            const result = selectContributionById(testState, 'c-nonexistent');
            expect(result).toBeUndefined();
        });

        it('should return undefined if there are no sessions', () => {
            const stateWithoutSessions = { ...testState, currentProjectDetail: { ...testState.currentProjectDetail, dialectic_sessions: [] } as DialecticProject };
            const result = selectContributionById(stateWithoutSessions, 'c1-s1');
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

    // Tests for selectContributionGenerationStatus
    it('selectContributionGenerationStatus should return status from testState', () => {
        expect(selectContributionGenerationStatus(testState)).toBe('generating');
    });

    it('selectContributionGenerationStatus should return initial "idle" from initialState', () => {
        expect(selectContributionGenerationStatus(initialState)).toBe('idle');
    });

    it('selectContributionGenerationStatus should return "failed" when set in state', () => {
        const failedState: DialecticStateValues = { ...initialState, contributionGenerationStatus: 'failed' };
        expect(selectContributionGenerationStatus(failedState)).toBe('failed');
    });

    // Tests for selectGenerateContributionsError
    it('selectGenerateContributionsError should return error from testState', () => {
        expect(selectGenerateContributionsError(testState)).toEqual(mockGenerateContributionsError);
    });

    it('selectGenerateContributionsError should return initial null from initialState', () => {
        expect(selectGenerateContributionsError(initialState)).toBeNull();
    });

    // Tests for selectAllContributionsFromCurrentProject
    describe('selectAllContributionsFromCurrentProject', () => {
        it('should return all contributions from all sessions in testState', () => {
            const expectedContributions = [
                { id: 'c1-s1', session_id: 'session-1' } as DialecticContribution,
                { id: 'c2-s1', session_id: 'session-1' } as DialecticContribution,
                { id: 'c1-s2', session_id: 'session-2' } as DialecticContribution,
            ];
            expect(selectAllContributionsFromCurrentProject(testState)).toEqual(expectedContributions);
        });

        it('should return an empty array if currentProjectDetail is null', () => {
            const stateWithNullProject: DialecticStateValues = { ...initialState, currentProjectDetail: null };
            expect(selectAllContributionsFromCurrentProject(stateWithNullProject)).toEqual([]);
        });
        
        it('should return an empty array if currentProjectDetail is null (using initialState)', () => {
            expect(selectAllContributionsFromCurrentProject(initialState)).toEqual([]);
        });

        it('should return an empty array if dialectic_sessions is null', () => {
            const stateWithNullSessions: DialecticStateValues = {
                ...testState,
                currentProjectDetail: { ...mockProjectDetail, dialectic_sessions: null as any }, // Type assertion for test
            };
            expect(selectAllContributionsFromCurrentProject(stateWithNullSessions)).toEqual([]);
        });

        it('should return an empty array if dialectic_sessions is empty', () => {
            const stateWithEmptySessions: DialecticStateValues = {
                ...testState,
                currentProjectDetail: { ...mockProjectDetail, dialectic_sessions: [] },
            };
            expect(selectAllContributionsFromCurrentProject(stateWithEmptySessions)).toEqual([]);
        });

        it('should return an empty array if sessions have no contributions', () => {
            const projectWithEmptyContributions: DialecticProject = {
                ...mockProjectDetail,
                dialectic_sessions: [
                    { ...mockSessions[0], dialectic_contributions: [] },
                    { ...mockSessions[1], dialectic_contributions: null as any }, // Test with null contributions too
                ],
            };
            const stateWithEmptyContributions: DialecticStateValues = {
                ...testState,
                currentProjectDetail: projectWithEmptyContributions,
            };
            expect(selectAllContributionsFromCurrentProject(stateWithEmptyContributions)).toEqual([]);
        });
    });

    // Tests for selectSessionById
    describe('selectSessionById', () => {
        const existingSessionId = 'session-1';
        const nonExistingSessionId = 'session-non-exist';

        it('should return the correct session when found in testState', () => {
            const result = selectSessionById(testState, existingSessionId);
            expect(result).toBeDefined();
            expect(result?.id).toBe(existingSessionId);
            expect(result?.session_description).toBe('Session One');
        });

        it('should return undefined if the session ID is not found in testState', () => {
            const result = selectSessionById(testState, nonExistingSessionId);
            expect(result).toBeUndefined();
        });

        it('should return undefined if currentProjectDetail is null (using initialState)', () => {
            const result = selectSessionById(initialState, existingSessionId);
            expect(result).toBeUndefined();
        });

        it('should return undefined if dialectic_sessions is null', () => {
            const stateWithNullSessions: DialecticStateValues = {
                ...testState,
                currentProjectDetail: { ...mockProjectDetail, dialectic_sessions: null as any },
            };
            const result = selectSessionById(stateWithNullSessions, existingSessionId);
            expect(result).toBeUndefined();
        });

        it('should return undefined if dialectic_sessions is empty', () => {
            const stateWithEmptySessions: DialecticStateValues = {
                ...testState,
                currentProjectDetail: { ...mockProjectDetail, dialectic_sessions: [] },
            };
            const result = selectSessionById(stateWithEmptySessions, existingSessionId);
            expect(result).toBeUndefined();
        });
    });

    // Tests for selectStageById
    describe('selectStageById', () => {
        const existingStageId = 'stage-abc';
        const nonExistingStageId = 'stage-non-exist';

        it('should return the correct stage when found in testState', () => {
            const result = selectStageById(testState, existingStageId);
            expect(result).toBeDefined();
            expect(result?.id).toBe(existingStageId);
            expect(result?.display_name).toBe('Mock Stage 1');
        });

        it('should return undefined if the stage ID is not found in testState', () => {
            const result = selectStageById(testState, nonExistingStageId);
            expect(result).toBeUndefined();
        });

        it('should return undefined if currentProcessTemplate is null (using initialState)', () => {
            const result = selectStageById(initialState, existingStageId);
            expect(result).toBeUndefined();
        });

        it('should return undefined if currentProcessTemplate.stages is null', () => {
            const stateWithNullStages: DialecticStateValues = {
                ...testState,
                currentProcessTemplate: { ...mockProcessTemplate, stages: null as any },
            };
            const result = selectStageById(stateWithNullStages, existingStageId);
            expect(result).toBeUndefined();
        });

        it('should return undefined if currentProcessTemplate.stages is empty', () => {
            const stateWithEmptyStages: DialecticStateValues = {
                ...testState,
                currentProcessTemplate: { ...mockProcessTemplate, stages: [] },
            };
            const result = selectStageById(stateWithEmptyStages, existingStageId);
            expect(result).toBeUndefined();
        });
    });

    // Tests for selectFeedbackForStageIteration
    describe('selectFeedbackForStageIteration', () => {
        it('should return correct feedback for a given session, stage, and iteration', () => {
            const result = selectFeedbackForStageIteration(testState, 'session-1', 'thesis', 1);
            expect(result).toEqual([mockFeedback1S1ThesisIter1, mockFeedback2S1ThesisIter1]);
        });

        it('should return feedback for a different stage in the same session and iteration', () => {
            const result = selectFeedbackForStageIteration(testState, 'session-1', 'antithesis', 1);
            expect(result).toEqual([mockFeedbackS1AntithesisIter1]);
        });

        it('should return feedback for a different iteration of the same stage and session', () => {
            const result = selectFeedbackForStageIteration(testState, 'session-1', 'thesis', 2);
            expect(result).toEqual([mockFeedbackS1ThesisIter2]);
        });

        it('should return an empty array if currentProjectDetail is null', () => {
            const stateWithNoProject = { ...initialDialecticStateValues, currentProjectDetail: null };
            const result = selectFeedbackForStageIteration(stateWithNoProject, 'session-1', 'thesis', 1);
            expect(result).toEqual([]);
        });

        it('should return an empty array if project has no sessions', () => {
            const projectWithNoSessions: DialecticProject = { ...mockProjectDetail, dialectic_sessions: [] };
            const stateWithNoSessions = { ...testState, currentProjectDetail: projectWithNoSessions };
            const result = selectFeedbackForStageIteration(stateWithNoSessions, 'session-1', 'thesis', 1);
            expect(result).toEqual([]);
        });
        
        it('should return an empty array if project sessions is null', () => {
            const projectWithNullSessions: DialecticProject = { ...mockProjectDetail, dialectic_sessions: null as any }; // Cast to any to bypass TS error for testing
            const stateWithNullSessions = { ...testState, currentProjectDetail: projectWithNullSessions };
            const result = selectFeedbackForStageIteration(stateWithNullSessions, 'session-1', 'thesis', 1);
            expect(result).toEqual([]);
        });

        it('should return an empty array if session is not found', () => {
            const result = selectFeedbackForStageIteration(testState, 'non-existent-session', 'thesis', 1);
            expect(result).toEqual([]);
        });

        it('should return an empty array if session has no feedback property', () => {
            const sessionWithoutFeedback: DialecticSession = { ...mockSessions[0], feedback: undefined };
            const projectWithModifiedSession: DialecticProject = { 
                ...mockProjectDetail, 
                dialectic_sessions: [sessionWithoutFeedback, mockSessions[1]] 
            };
            const stateWithModifiedSession = { ...testState, currentProjectDetail: projectWithModifiedSession };
            const result = selectFeedbackForStageIteration(stateWithModifiedSession, 'session-1', 'thesis', 1);
            expect(result).toEqual([]);
        });
        
        it('should return an empty array if session feedback is null', () => {
            const sessionWithNullFeedback: DialecticSession = { ...mockSessions[0], feedback: null as any };  // Cast to any to bypass TS error for testing
            const projectWithModifiedSession: DialecticProject = { 
                ...mockProjectDetail, 
                dialectic_sessions: [sessionWithNullFeedback, mockSessions[1]] 
            };
            const stateWithModifiedSession = { ...testState, currentProjectDetail: projectWithModifiedSession };
            const result = selectFeedbackForStageIteration(stateWithModifiedSession, 'session-1', 'thesis', 1);
            expect(result).toEqual([]);
        });

        it('should return an empty array if no feedback matches stageSlug', () => {
            const result = selectFeedbackForStageIteration(testState, 'session-1', 'non-existent-stage', 1);
            expect(result).toEqual([]);
        });

        it('should return an empty array if no feedback matches iterationNumber', () => {
            const result = selectFeedbackForStageIteration(testState, 'session-1', 'thesis', 99);
            expect(result).toEqual([]);
        });

        it('should return an empty array for a session that has no feedback records', () => {
            const result = selectFeedbackForStageIteration(testState, 'session-2', 'thesis', 1);
            expect(result).toEqual([]);
        });
    });
});

describe('selectIsStageReadyForSessionIteration', () => {
    const projectId = 'proj-1';
    const sessionId = 'session-1';
    const stageSlug = 'thesis';
    const iterationNumber = 1;

    const mockSeedPromptResource: DialecticProjectResource = {
        id: 'resource-1',
        project_id: projectId,
        storage_path: 'path/to/seed_prompt.md',
        file_name: 'seed_prompt.md',
        mime_type: 'text/markdown',
        size_bytes: 100,
        resource_description: JSON.stringify({
            type: 'seed_prompt',
            session_id: sessionId,
            stage_slug: stageSlug,
            iteration: iterationNumber,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const projectWithResource: DialecticProject = {
        id: projectId,
        user_id: 'user-1',
        project_name: 'Test Project',
        initial_user_prompt: 'Test prompt',
        selected_domain_id: 'dom-1',
        dialectic_domains: { name: 'Generic' }, // Simplified for this test
        selected_domain_overlay_id: null,
        repo_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [{ id: sessionId, iteration_count: iterationNumber } as DialecticSession], // Simplified
        resources: [mockSeedPromptResource],
        process_template_id: 'pt-1',
        dialectic_process_templates: { id: 'pt-1' } as DialecticProcessTemplate, // Simplified
        // Add missing DialecticProject fields
        isLoadingProcessTemplate: false,
        processTemplateError: null,
        contributionGenerationStatus: 'idle',
        generateContributionsError: null,
        isSubmittingStageResponses: false,
        submitStageResponsesError: null,
        isSavingContributionEdit: false,
        saveContributionEditError: null,
    };

    it('should return true if project, session, stage, and matching seed prompt resource exist', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return false if currentProjectDetail is null', () => {
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: null,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if project.resources is null', () => {
        const projectWithoutResources: DialecticProject = {
            ...projectWithResource,
            resources: null as any, // Testing null case
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithoutResources,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });
    
    it('should return false if project.resources is empty', () => {
        const projectWithEmptyResources: DialecticProject = {
            ...projectWithResource,
            resources: [], 
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithEmptyResources,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if resource_description is not parseable JSON', () => {
        const resourceWithUnparseableDesc: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            resource_description: 'not json',
        };
        const projectWithBadResource: DialecticProject = {
            ...projectWithResource,
            resources: [resourceWithUnparseableDesc],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithBadResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if resource_description is null', () => {
        const resourceWithNullDesc: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            resource_description: null as any,
        };
        const projectWithNullDescResource: DialecticProject = {
            ...projectWithResource,
            resources: [resourceWithNullDesc],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithNullDescResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });
    
    it('should return false if parsed desc.type is not "seed_prompt"', () => {
        const resourceWithWrongType: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            resource_description: JSON.stringify({ type: 'not_seed_prompt' }),
        };
        const projectWithWrongTypeResource: DialecticProject = {
            ...projectWithResource,
            resources: [resourceWithWrongType],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithWrongTypeResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if desc.session_id does not match', () => {
        const resourceWithWrongSession: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            resource_description: JSON.stringify({ ...JSON.parse(mockSeedPromptResource.resource_description!), session_id: 'wrong-session' }),
        };
        const projectWithWrongSessionResource: DialecticProject = {
            ...projectWithResource,
            resources: [resourceWithWrongSession],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithWrongSessionResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if desc.stage_slug does not match', () => {
        const resourceWithWrongStage: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            resource_description: JSON.stringify({ ...JSON.parse(mockSeedPromptResource.resource_description!), stage_slug: 'wrong-stage' }),
        };
        const projectWithWrongStageResource: DialecticProject = {
            ...projectWithResource,
            resources: [resourceWithWrongStage],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithWrongStageResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if desc.iteration does not match', () => {
        const resourceWithWrongIteration: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            resource_description: JSON.stringify({ ...JSON.parse(mockSeedPromptResource.resource_description!), iteration: iterationNumber + 1 }),
        };
        const projectWithWrongIterationResource: DialecticProject = {
            ...projectWithResource,
            resources: [resourceWithWrongIteration],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithWrongIterationResource,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });
    
    it('should return false if project has no sessions', () => {
        const projectWithNoSessions: DialecticProject = {
            ...projectWithResource,
            dialectic_sessions: [],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithNoSessions,
        };
        // This test might seem redundant given the true case requires a session,
        // but it ensures robustness if the selector logic changes.
        // The current plan implies the selector doesn't directly use session from project.dialectic_sessions
        // but it's good to be aware if that changes.
        // For now, based on the plan, the selector only looks at project.resources and currentProjectDetail.
        // The sessionId parameter is used to match against resource_description.
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
        // Correcting the expectation based on the idea that the project and its resources are the primary source of truth.
        // If the `sessionId` passed to the selector matches a `resource_description`'s `session_id`, it should still find it.
        // The `dialectic_sessions` array on the project isn't directly queried by the selector according to the plan.
    });

    it('should return true even if multiple resources exist, as long as one matches', () => {
        const otherResource: DialecticProjectResource = {
            ...mockSeedPromptResource,
            project_id: projectId,
            id: 'resource-2',
            resource_description: JSON.stringify({ type: 'other_type' }),
        };
        const projectWithMultipleResources: DialecticProject = {
            ...projectWithResource,
            resources: [otherResource, mockSeedPromptResource],
        };
        const state: DialecticStateValues = {
            ...initialDialecticStateValues,
            currentProjectDetail: projectWithMultipleResources,
        };
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });
}); 