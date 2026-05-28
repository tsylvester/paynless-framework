import { describe, it, expect, vi, afterEach } from 'vitest';
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
    selectSelectedModels,
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
    selectFeedbackForStageIteration,
    selectSortedStages,
    selectStageProgressSummary,
    selectStageDocumentResource,
    selectEditedDocumentByKey,
    selectValidMarkdownDocumentKeys,
    selectUnifiedProjectProgress,
    selectStageHasUnsavedChanges,
} from './dialecticStore.selectors';
import { initialDialecticStateValues } from './dialecticStore';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import type {
    DialecticStateValues,
    ApiError,
    DomainOverlayDescriptor,
    DialecticProject,
    DialecticDomain,
    DialecticStage,
    DialecticProcessTemplate,
    DialecticSession,
    DialecticContribution,
    DialecticProjectResource,
    DialecticFeedback,
    DialecticStageTransition,
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    AssembledPrompt,
    StageDocumentContentState,
    StageRenderedDocumentDescriptor,
    SelectedModels,
    JobProgressEntry,
    JobProgressDto,
    AiProvidersRow,
} from '@paynless/types';
import {
    mockDialecticDomain,
    mockDomainOverlayDescriptor,
    mockDialecticStage,
    mockDialecticStageTransition,
    mockDialecticProcessTemplate,
    mockDialecticProject,
    mockSession,
    mockDialecticFeedback,
    mockDialecticContribution,
    mockSelectedModel,
    mockDialecticStageRecipe,
    mockDialecticStageRecipeStep,
    mockStageRunProgressSnapshot,
    mockJobProgressEntry,
    mockJobProgressDto,
    mockAssembledPrompt,
    mockDialecticProjectResource,
    mockStageRenderedDocumentDescriptor,
    mockStageDocumentContentState,
    mockAiProvidersRow,
    mockContributionCacheEntry,
} from '../../../apps/web/src/mocks/dialecticStore.mock';

const mockThesisStage: DialecticStage = mockDialecticStage({
    id: 's1',
    slug: 'thesis',
    display_name: 'Thesis',
    description: 'Mock thesis stage',
    minimum_balance: 0,
});

const mockSynthesisStage: DialecticStage = mockDialecticStage({
    id: 's3',
    slug: 'synthesis',
    display_name: 'Synthesis',
    description: 'Mock thesis stage',
    minimum_balance: 0,
});

describe('Dialectic Store Selectors', () => {
    const mockOverlays: DomainOverlayDescriptor[] = [
        mockDomainOverlayDescriptor({ id: 'ov1', domainId: 'dom1', description: 'Desc 1', domainName: 'Domain 1' }),
        mockDomainOverlayDescriptor({ id: 'ov2', domainId: 'dom2', description: null, domainName: 'Domain 2' }),
    ];
    const mockOverlayError: ApiError = { code: 'OVERLAY_ERR', message: 'Test Overlay Error' };
    const mockDomains: DialecticDomain[] = [
        mockDialecticDomain({ id: 'dom1', name: 'Domain 1', description: 'Test domain 1' }),
        mockDialecticDomain({ id: 'dom2', name: 'Domain 2', description: 'Test domain 2' }),
    ];
    const mockDomainsError: ApiError = { code: 'DOMAIN_ERR', message: 'Test Domain Error' };
    const mockStage1: DialecticStage = mockDialecticStage({
        id: 'stage-abc',
        slug: 'mock-stage-1',
        display_name: 'Mock Stage 1',
        description: 'First mock stage',
        minimum_balance: 0,
    });
    const mockStage2: DialecticStage = mockDialecticStage({
        id: 'stage-def',
        slug: 'mock-stage-2',
        display_name: 'Mock Stage 2',
        description: 'Second mock stage',
        default_system_prompt_id: 'sp-2',
        minimum_balance: 0,
    });
    const mockProcessTemplate: DialecticProcessTemplate = mockDialecticProcessTemplate({
        starting_stage_id: 'stage-abc',
        stages: [mockStage1, mockStage2],
        transitions: [
            mockDialecticStageTransition({
                id: 't1',
                source_stage_id: 'stage-abc',
                target_stage_id: 'stage-def',
            }),
        ],
    });
    const mockProcessTemplateError: ApiError = { code: 'TEMPLATE_ERR', message: 'Test Template Error' };
    const mockSaveContributionError: ApiError = { code: 'SAVE_ERR', message: 'Test Save Error' };
    const mockGenerateContributionsError: ApiError = { code: 'GEN_ERR', message: 'Test Generation Error' };

    const mockFeedback1S1ThesisIter1: DialecticFeedback = mockDialecticFeedback({
        id: 'fb1-s1-thesis-i1',
        session_id: 'session-1',
        project_id: 'projDetail1',
        user_id: 'user1',
        file_name: 'feedback1.md',
        storage_path: 'path/to/feedback1.md',
    });

    const mockFeedback2S1ThesisIter1: DialecticFeedback = mockDialecticFeedback({
        ...mockFeedback1S1ThesisIter1,
        id: 'fb2-s1-thesis-i1',
        file_name: 'feedback2.md',
    });

    const mockFeedbackS1AntithesisIter1: DialecticFeedback = mockDialecticFeedback({
        ...mockFeedback1S1ThesisIter1,
        id: 'fb1-s1-antithesis-i1',
        stage_slug: 'antithesis',
        file_name: 'feedback_antithesis.md',
    });

    const mockFeedbackS1ThesisIter2: DialecticFeedback = mockDialecticFeedback({
        ...mockFeedback1S1ThesisIter1,
        id: 'fb1-s1-thesis-i2',
        iteration_number: 2,
        file_name: 'feedback_iter2.md',
    });

    const mockSessions: DialecticSession[] = [
        mockSession({
            id: 'session-1',
            project_id: 'projDetail1',
            session_description: 'Session One',
            selected_models: [mockSelectedModel()],
            associated_chat_id: 'chat-1',
            current_stage_id: 's1',
            dialectic_contributions: [
                mockDialecticContribution({ id: 'c1-s1', session_id: 'session-1' }),
                mockDialecticContribution({ id: 'c2-s1', session_id: 'session-1' }),
            ],
            feedback: [mockFeedback1S1ThesisIter1, mockFeedback2S1ThesisIter1, mockFeedbackS1AntithesisIter1, mockFeedbackS1ThesisIter2],
            viewing_stage_id: 'thesis',
        }),
        mockSession({
            id: 'session-2',
            project_id: 'projDetail1',
            session_description: 'Session Two',
            selected_models: [mockSelectedModel({ id: 'model-2', displayName: 'Model 2' })],
            associated_chat_id: 'chat-2',
            current_stage_id: 's1',
            dialectic_contributions: [
                mockDialecticContribution({ id: 'c1-s2', session_id: 'session-2' }),
            ],
            feedback: [],
            viewing_stage_id: 'thesis',
        }),
    ];

    const mockProjectDetail: DialecticProject = mockDialecticProject({
        id: 'projDetail1',
        user_id: 'user1',
        project_name: 'Detailed Project',
        initial_user_prompt: 'Initial Prompt Text',
        selected_domain_id: 'domain1',
        dialectic_domains: { name: 'Tech' },
        selected_domain_overlay_id: 'overlay1',
        dialectic_sessions: mockSessions,
        process_template_id: 'pt1',
        dialectic_process_templates: mockProcessTemplate,
    });

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
        selectedModels: [
            mockSelectedModel(),
            mockSelectedModel({ id: 'model-2', displayName: 'Model 2' }),
        ],
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
                mockDomainOverlayDescriptor({ id: 'ov1', domainId: 'dom1', description: 'Tech Thesis Overlay 1', domainName: 'Domain 1' }),
                mockDomainOverlayDescriptor({ id: 'ov2', domainId: 'dom1', description: 'Tech Thesis Overlay 2', domainName: 'Domain 1' }),
                mockDomainOverlayDescriptor({ id: 'ov3', domainId: 'dom2', description: 'Health Thesis Overlay', domainName: 'Domain 2' }),
                mockDomainOverlayDescriptor({ id: 'ov4', domainId: 'dom1', description: 'Tech Antithesis Overlay', stageAssociation: 'antithesis', domainName: 'Domain 1' }),
            ],
        };

        it('should return overlays filtered by domainId and selectedStageAssociation', () => {
            const result = selectOverlay(overlayState, 'dom1');
            expect(result).toEqual([
                mockDomainOverlayDescriptor({ id: 'ov1', domainId: 'dom1', description: 'Tech Thesis Overlay 1', domainName: 'Domain 1' }),
                mockDomainOverlayDescriptor({ id: 'ov2', domainId: 'dom1', description: 'Tech Thesis Overlay 2', domainName: 'Domain 1' }),
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
        testState.projects = [mockDialecticProject({ id: 'proj1' })];
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
        testState.modelCatalog = [
            mockAiProvidersRow({ id: 'model1', name: 'Model One', api_identifier: 'api-id', provider: 'Provider' }),
        ];
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
        testState.contributionContentCache = { c1: mockContributionCacheEntry({ isLoading: false }) };
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

    it('selectSelectedModels returns state.selectedModels unchanged when defined', () => {
        const expected: SelectedModels[] = [
            mockSelectedModel(),
            mockSelectedModel({ id: 'model-2', displayName: 'Model 2' }),
        ];
        expect(selectSelectedModels(testState)).toEqual(expected);
    });

    it('selectSelectedModels returns empty array when state.selectedModels is empty', () => {
        const stateWithEmptySelectedModels: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedModels: [],
        };
        expect(selectSelectedModels(stateWithEmptySelectedModels)).toEqual([]);
    });

    it('selectSelectedModels returns empty array when state.selectedModels is null', () => {
        const stateWithNullSelectedModels: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedModels: null,
        };
        expect(selectSelectedModels(stateWithNullSelectedModels)).toEqual([]);
    });

    it('selectSelectedModels returns empty array when state.selectedModels is undefined', () => {
        const stateWithUndefinedSelectedModels: DialecticStateValues = {
            ...initialDialecticStateValues,
            selectedModels: undefined,
        };
        expect(selectSelectedModels(stateWithUndefinedSelectedModels)).toEqual([]);
    });

    describe('selectUnifiedProjectProgress', () => {
        const unifiedProgressStage: DialecticStage = mockDialecticStage({
            id: 'stage-abc',
            slug: 'mock-stage-1',
            display_name: 'Mock Stage 1',
            description: 'First mock stage',
            minimum_balance: 0,
        });
        const unifiedProgressSession: DialecticSession = mockSession({
            id: 'session-1',
            project_id: 'proj-1',
            session_description: null,
            status: null,
            associated_chat_id: null,
            current_stage_id: 'stage-abc',
            viewing_stage_id: null,
            dialectic_contributions: [],
            feedback: [],
        });
        const unifiedProgressTemplate: DialecticProcessTemplate = mockDialecticProcessTemplate({
            starting_stage_id: 'stage-abc',
            stages: [unifiedProgressStage],
            transitions: [],
        });
        const unifiedProgressRecipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'mock-stage-1',
            steps: [mockDialecticStageRecipeStep()],
        });
        const unifiedProgressKey = 'session-1:mock-stage-1:1';
        const unifiedProjectWithSession: DialecticProject = {
            ...mockProjectDetail,
            dialectic_sessions: [unifiedProgressSession],
        };
        const unifiedTwoStepRecipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'mock-stage-1',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-1',
                    step_key: 'step_a',
                    step_slug: 'step-a',
                    step_name: 'Step A',
                }),
                mockDialecticStageRecipeStep({
                    id: 'step-2',
                    step_key: 'step_b',
                    step_slug: 'step-b',
                    step_name: 'Step B',
                    execution_order: 2,
                    parallel_group: 2,
                    branch_key: 'b2',
                    outputs_required: [{ document_key: 'doc_b', artifact_class: 'rendered_document', file_type: 'markdown' }],
                }),
            ],
        });
        const unifiedExecStepRecipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'mock-stage-1',
            steps: [
                mockDialecticStageRecipeStep({
                    step_key: 'exec_step',
                    step_slug: 'exec-step',
                    step_name: 'Execute Step',
                }),
            ],
        });
        const unifiedPlanStepRecipe: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: 'mock-stage-1',
            steps: [
                mockDialecticStageRecipeStep({
                    step_key: 'plan_step',
                    step_slug: 'plan-step',
                    step_name: 'Plan Step',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    output_type: 'header_context',
                    granularity_strategy: 'all_to_one',
                    outputs_required: [{ document_key: 'HeaderContext', artifact_class: 'header_context', file_type: 'json' }],
                }),
            ],
        });
        const completedJobWithDocument: JobProgressDto = mockJobProgressDto({
            status: 'completed',
            completedAt: new Date().toISOString(),
        });

        it('does NOT read from state.selectedModels for progress calculation', () => {
            const jobProgressEntry: JobProgressEntry = mockJobProgressEntry();
            const stateWithEmptySelectedModels: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                selectedModels: [],
                recipesByStageSlug: { 'mock-stage-1': unifiedProgressRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { doc_step: 'in_progress' },
                        documents: {},
                        jobProgress: { doc_step: jobProgressEntry },
                        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                        jobs: [],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(stateWithEmptySelectedModels, 'session-1');
            const firstStage = progress.stageDetails[0];
            const docStep = firstStage.stepsDetail[0];
            expect(docStep.stepKey).toBe('doc_step');
            expect(docStep.stepName).toBe('Doc Step');
            expect(docStep.status).toBe('in_progress');
        });

        it('maps raw status paused_user to step status paused_user', () => {
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedProgressRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { doc_step: 'paused_user' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                        jobs: [],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            const docStep = firstStage.stepsDetail[0];
            expect(docStep.status).toBe('paused_user');
        });

        it('rolls up stage to paused_nsf when step has paused_nsf and another has paused_user', () => {
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedTwoStepRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { step_a: 'paused_nsf', step_b: 'paused_user' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 0, totalSteps: 2, failedSteps: 0 },
                        jobs: [],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.stageStatus).toBe('paused_nsf');
        });

        it('rolls up stage to paused_user when all steps are paused_user', () => {
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedProgressRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { doc_step: 'paused_user' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                        jobs: [],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.stageStatus).toBe('paused_user');
        });

        it('preserves paused_nsf step and stage status', () => {
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedProgressRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { doc_step: 'paused_nsf' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                        jobs: [],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            const docStep = firstStage.stepsDetail[0];
            expect(docStep.status).toBe('paused_nsf');
            expect(firstStage.stageStatus).toBe('paused_nsf');
        });

        it('stageStatus is NOT \'completed\' when all steps are done but not all document sets are complete (steps finishing does not prove RENDER produced documents)', () => {
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedProgressRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { doc_step: 'completed' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                        jobs: [completedJobWithDocument],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.stageStatus).not.toBe('completed');
        });

        it('stageStatus is \'completed\' when completedDocumentsForStage === totalDocumentsForStage && totalDocumentsForStage > 0', () => {
            const compositeKey = `doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
            const documentDescriptor: StageRenderedDocumentDescriptor = mockStageRenderedDocumentDescriptor({
                status: 'completed',
            });
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedProgressRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { doc_step: 'completed' },
                        documents: { [compositeKey]: documentDescriptor },
                        jobProgress: {},
                        progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
                        jobs: [completedJobWithDocument],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.stageStatus).toBe('completed');
        });

        it('stageStatus is \'in_progress\' when jobs are running mid-DAG (PLAN, intermediate EXECUTE) even though no rendered documents exist yet — progress comes from step statuses, not documents', () => {
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedExecStepRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { exec_step: 'in_progress' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                        jobs: [],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.stageStatus).toBe('in_progress');
        });

        it('progress statuses (in_progress, failed, paused) derived from step statuses, which reflect ALL jobs including those without document_key', () => {
            const jobWithoutDocumentKey: JobProgressDto = mockJobProgressDto({
                id: 'job-plan-1',
                status: 'processing',
                jobType: 'PLAN',
                stepKey: 'plan_step',
                modelId: null,
                documentKey: null,
                completedAt: null,
                modelName: null,
            });
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedPlanStepRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { plan_step: 'in_progress' },
                        documents: {},
                        jobProgress: {},
                        progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
                        jobs: [jobWithoutDocumentKey],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.stageStatus).toBe('in_progress');
        });

        it('"n/n" reflects completedDocumentsForStage / totalDocumentsForStage — totalDocuments is a fixed count from the recipe\'s expected rendered markdown outputs, completedDocuments is how many document sets are fully rendered across all selected models', () => {
            const jobDocA: JobProgressDto = mockJobProgressDto({
                id: 'job-a',
                status: 'completed',
                stepKey: 'step_a',
                completedAt: new Date().toISOString(),
            });
            const jobDocB: JobProgressDto = mockJobProgressDto({
                id: 'job-b',
                status: 'processing',
                stepKey: 'step_b',
                documentKey: 'doc_b',
                completedAt: null,
            });
            const compositeKeyA = `doc_a${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}model-1`;
            const descriptorA: StageRenderedDocumentDescriptor = mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-a',
                latestRenderedResourceId: 'res-a',
                versionHash: 'hash-a',
                lastRenderedResourceId: 'res-a',
            });
            const state: DialecticStateValues = {
                ...initialDialecticStateValues,
                currentProjectDetail: unifiedProjectWithSession,
                currentProcessTemplate: unifiedProgressTemplate,
                recipesByStageSlug: { 'mock-stage-1': unifiedTwoStepRecipe },
                stageRunProgress: {
                    [unifiedProgressKey]: mockStageRunProgressSnapshot({
                        stepStatuses: { step_a: 'completed', step_b: 'in_progress' },
                        documents: { [compositeKeyA]: descriptorA },
                        jobProgress: {},
                        progress: { completedSteps: 1, totalSteps: 2, failedSteps: 0 },
                        jobs: [jobDocA, jobDocB],
                    }),
                },
            };
            const progress = selectUnifiedProjectProgress(state, 'session-1');
            const firstStage = progress.stageDetails[0];
            expect(firstStage.totalDocuments).toBe(2);
            expect(firstStage.completedDocuments).toBe(1);
        });
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
            const stateWithoutSessions = { ...testState, currentProjectDetail: mockDialecticProject({ ...testState.currentProjectDetail, dialectic_sessions: [] }) };
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
            const expectedContributions: DialecticContribution[] = [
                ...(mockSessions[0].dialectic_contributions ?? []),
                ...(mockSessions[1].dialectic_contributions ?? []),
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

  describe('selectStageProgressSummary', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const thesisMarkdownHeaderRecipe = (
      instanceId: string,
      markdownDocumentKey: string,
    ): DialecticStageRecipe => {
      const headerContextKey = 'HeaderContext';
      return mockDialecticStageRecipe({
        stageSlug: 'thesis',
        instanceId,
        steps: [
          mockDialecticStageRecipeStep({
            id: 'step-1',
            step_key: 'markdown_step',
            step_slug: 'markdown-step',
            step_name: 'Markdown Step',
            branch_key: 'branch-1',
            prompt_template_id: 'prompt-1',
            outputs_required: [
              { document_key: markdownDocumentKey, artifact_class: 'rendered_document', file_type: 'markdown' },
            ],
          }),
          mockDialecticStageRecipeStep({
            id: 'step-2',
            step_key: 'header_step',
            step_slug: 'header-step',
            step_name: 'Header Step',
            execution_order: 2,
            parallel_group: 2,
            branch_key: 'branch-2',
            job_type: 'PLAN',
            prompt_type: 'Planner',
            prompt_template_id: 'prompt-2',
            output_type: 'header_context',
            granularity_strategy: 'all_to_one',
            outputs_required: [
              { document_key: headerContextKey, artifact_class: 'header_context', file_type: 'json' },
            ],
          }),
        ],
      });
    };

    it('reports failure metadata when any document has failed', () => {
      const sessionId = 'session-progress';
      const stageSlug = 'synthesis';
      const iterationNumber = 1;

      const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
        stageSlug,
        instanceId: 'instance-synthesis',
        steps: [
          mockDialecticStageRecipeStep({
            id: 'step-1',
            step_key: 'step_outline',
            step_slug: 'step-outline',
            step_name: 'Outline Step',
            branch_key: 'branch-1',
            prompt_template_id: 'prompt-1',
            outputs_required: [
              { document_key: 'stage-outline', artifact_class: 'rendered_document', file_type: 'markdown' },
              { document_key: 'stage-draft', artifact_class: 'rendered_document', file_type: 'markdown' },
            ],
          }),
        ],
      });

      const progressState: DialecticStateValues = {
        ...initialDialecticStateValues,
        recipesByStageSlug: {
          [stageSlug]: recipe,
        },
        stageRunProgress: {
          [`${sessionId}:${stageSlug}:${iterationNumber}`]: mockStageRunProgressSnapshot({
            stepStatuses: {},
            documents: {
              'stage-outline': mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-complete',
                latestRenderedResourceId: 'res-complete',
                modelId: 'model-a',
                versionHash: 'hash-complete',
                lastRenderedResourceId: 'res-complete',
              }),
              'stage-draft': mockStageRenderedDocumentDescriptor({
                status: 'failed',
                job_id: 'job-failed',
                latestRenderedResourceId: 'res-failed',
                modelId: 'model-a',
                versionHash: 'hash-failed',
                lastRenderedResourceId: 'res-failed',
              }),
            },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
            jobs: [],
          }),
        },
      };

      const summary = selectStageProgressSummary(
        progressState,
        sessionId,
        stageSlug,
        iterationNumber,
      );

      expect(summary.hasFailed).toBe(true);
      expect(summary.failedDocuments).toBe(1);
      expect(summary.failedDocumentKeys).toEqual(['stage-draft']);
    });

    it('excludes non-document artifacts from counts and only counts valid markdown documents', () => {
      const sessionId = 'session-filter-test';
      const stageSlug = 'thesis';
      const iterationNumber = 1;

      const validMarkdownDocumentKey = 'draft_document_markdown';
      const headerContextKey = 'HeaderContext';
      const recipe: DialecticStageRecipe = thesisMarkdownHeaderRecipe('instance-thesis', validMarkdownDocumentKey);

      const progressState: DialecticStateValues = {
        ...initialDialecticStateValues,
        recipesByStageSlug: {
          [stageSlug]: recipe,
        },
        stageRunProgress: {
          [`${sessionId}:${stageSlug}:${iterationNumber}`]: mockStageRunProgressSnapshot({
            stepStatuses: {},
            documents: {
              [validMarkdownDocumentKey]: mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-markdown',
                latestRenderedResourceId: 'res-markdown',
                modelId: 'model-a',
                versionHash: 'hash-markdown',
                lastRenderedResourceId: 'res-markdown',
              }),
              [headerContextKey]: mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-header',
                latestRenderedResourceId: 'res-header',
                modelId: 'model-a',
                versionHash: 'hash-header',
                lastRenderedResourceId: 'res-header',
              }),
            },
            jobProgress: {},
            jobs: [],
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          }),
        },
      };

      const summary = selectStageProgressSummary(
        progressState,
        sessionId,
        stageSlug,
        iterationNumber,
      );

      expect(summary.totalDocuments).toBe(1);
      expect(summary.completedDocuments).toBe(1);
      expect(summary.isComplete).toBe(true);
      expect(summary.totalDocuments).not.toBe(2);
    });

    it('returns isComplete false when only header_context is completed but markdown documents are not', () => {
      const sessionId = 'session-incomplete-test';
      const stageSlug = 'thesis';
      const iterationNumber = 1;

      const validMarkdownDocumentKey = 'draft_document_markdown';
      const headerContextKey = 'HeaderContext';
      const recipe: DialecticStageRecipe = thesisMarkdownHeaderRecipe('instance-thesis-incomplete', validMarkdownDocumentKey);

      const progressState: DialecticStateValues = {
        ...initialDialecticStateValues,
        recipesByStageSlug: {
          [stageSlug]: recipe,
        },
        stageRunProgress: {
          [`${sessionId}:${stageSlug}:${iterationNumber}`]: mockStageRunProgressSnapshot({
            stepStatuses: {},
            documents: {
              [validMarkdownDocumentKey]: mockStageRenderedDocumentDescriptor({
                status: 'generating',
                job_id: 'job-markdown',
                latestRenderedResourceId: 'res-markdown',
                modelId: 'model-a',
                versionHash: 'hash-markdown',
                lastRenderedResourceId: 'res-markdown',
              }),
              [headerContextKey]: mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-header',
                latestRenderedResourceId: 'res-header',
                modelId: 'model-a',
                versionHash: 'hash-header',
                lastRenderedResourceId: 'res-header',
              }),
            },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
            jobs: [],
          }),
        },
      };

      const summary = selectStageProgressSummary(
        progressState,
        sessionId,
        stageSlug,
        iterationNumber,
      );

      expect(summary.totalDocuments).toBe(1);
      expect(summary.completedDocuments).toBe(0);
      expect(summary.isComplete).toBe(false);
    });

    it('returns isComplete true only when all valid markdown documents are completed', () => {
      const sessionId = 'session-complete-test';
      const stageSlug = 'thesis';
      const iterationNumber = 1;

      const validMarkdownDocumentKey1 = 'draft_document_markdown';
      const validMarkdownDocumentKey2 = 'business_case_markdown';
      const headerContextKey = 'HeaderContext';

      const recipe: DialecticStageRecipe = mockDialecticStageRecipe({
        stageSlug,
        instanceId: 'instance-thesis-complete',
        steps: [
          mockDialecticStageRecipeStep({
            id: 'step-1',
            step_key: 'markdown_step_1',
            step_slug: 'markdown-step-1',
            step_name: 'Markdown Step 1',
            branch_key: 'branch-1',
            prompt_template_id: 'prompt-1',
            outputs_required: [
              { document_key: validMarkdownDocumentKey1, artifact_class: 'rendered_document', file_type: 'markdown' },
            ],
          }),
          mockDialecticStageRecipeStep({
            id: 'step-2',
            step_key: 'markdown_step_2',
            step_slug: 'markdown-step-2',
            step_name: 'Markdown Step 2',
            execution_order: 2,
            parallel_group: 2,
            branch_key: 'branch-2',
            prompt_template_id: 'prompt-2',
            outputs_required: [
              { document_key: validMarkdownDocumentKey2, artifact_class: 'rendered_document', file_type: 'markdown' },
            ],
          }),
          mockDialecticStageRecipeStep({
            id: 'step-3',
            step_key: 'header_step',
            step_slug: 'header-step',
            step_name: 'Header Step',
            execution_order: 3,
            parallel_group: 3,
            branch_key: 'branch-3',
            job_type: 'PLAN',
            prompt_type: 'Planner',
            prompt_template_id: 'prompt-3',
            output_type: 'header_context',
            granularity_strategy: 'all_to_one',
            outputs_required: [
              { document_key: headerContextKey, artifact_class: 'header_context', file_type: 'json' },
            ],
          }),
        ],
      });

      const progressState: DialecticStateValues = {
        ...initialDialecticStateValues,
        recipesByStageSlug: {
          [stageSlug]: recipe,
        },
        stageRunProgress: {
          [`${sessionId}:${stageSlug}:${iterationNumber}`]: mockStageRunProgressSnapshot({
            stepStatuses: {},
            documents: {
              [validMarkdownDocumentKey1]: mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-markdown-1',
                latestRenderedResourceId: 'res-markdown-1',
                modelId: 'model-a',
                versionHash: 'hash-markdown-1',
                lastRenderedResourceId: 'res-markdown-1',
              }),
              [validMarkdownDocumentKey2]: mockStageRenderedDocumentDescriptor({
                status: 'completed',
                job_id: 'job-markdown-2',
                latestRenderedResourceId: 'res-markdown-2',
                modelId: 'model-a',
                versionHash: 'hash-markdown-2',
                lastRenderedResourceId: 'res-markdown-2',
              }),
              [headerContextKey]: mockStageRenderedDocumentDescriptor({
                status: 'generating',
                job_id: 'job-header',
                latestRenderedResourceId: 'res-header',
                modelId: 'model-a',
                versionHash: 'hash-header',
                lastRenderedResourceId: 'res-header',
              }),
            },
            jobProgress: {},
            progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
            jobs: [],
          }),
        },
      };

      const summary = selectStageProgressSummary(
        progressState,
        sessionId,
        stageSlug,
        iterationNumber,
      );

      expect(summary.totalDocuments).toBe(2);
      expect(summary.completedDocuments).toBe(2);
      expect(summary.isComplete).toBe(true);
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

    describe('selectSortedStages', () => {
        const stage1: DialecticStage = mockDialecticStage({ id: '1', display_name: 'Thesis', slug: 'thesis', created_at: '', default_system_prompt_id: null, description: null, minimum_balance: 0 });
        const stage2: DialecticStage = mockDialecticStage({ id: '2', display_name: 'Antithesis', slug: 'antithesis', created_at: '', default_system_prompt_id: null, description: null, minimum_balance: 0 });
        const stage3: DialecticStage = mockDialecticStage({ id: '3', display_name: 'Synthesis', slug: 'synthesis', created_at: '', default_system_prompt_id: null, description: null, minimum_balance: 0 });
    
        const transitions: DialecticStageTransition[] = [
          mockDialecticStageTransition({ id: 't1', process_template_id: 'p1', source_stage_id: '1', target_stage_id: '2' }),
          mockDialecticStageTransition({ id: 't2', process_template_id: 'p1', source_stage_id: '2', target_stage_id: '3' }),
        ];
    
        it('should return stages sorted by transitions when template is valid', () => {
          const processTemplate: DialecticProcessTemplate = {
            id: 'p1',
            name: 'Test Process',
            starting_stage_id: '1',
            stages: [stage3, stage1, stage2], // Intentionally out of order
            transitions: transitions,
            created_at: new Date().toISOString(),
            description: null
          };
          const state = { ...initialDialecticStateValues, currentProcessTemplate: processTemplate };
          const sortedStages = selectSortedStages(state);
          expect(sortedStages.map(s => s.id)).toEqual(['1', '2', '3']);
        });
    
        it('should return unsorted stages if starting_stage_id is missing', () => {
          const processTemplate: DialecticProcessTemplate = {
            id: 'p1',
            name: 'Test Process',
            starting_stage_id: null,
            stages: [stage3, stage1, stage2],
            transitions: transitions,
            created_at: new Date().toISOString(),
            description: null
          };
          const state = { ...initialDialecticStateValues, currentProcessTemplate: processTemplate };
          const sortedStages = selectSortedStages(state);
          expect(sortedStages).toEqual(processTemplate.stages);
        });
    
        it('should return unsorted stages if transitions are missing', () => {
          const processTemplate: DialecticProcessTemplate = {
            id: 'p1',
            name: 'Test Process',
            starting_stage_id: '1',
            stages: [stage3, stage1, stage2],
            transitions: [],
            created_at: new Date().toISOString(),
            description: null
          };
          const state = { ...initialDialecticStateValues, currentProcessTemplate: processTemplate };
          const sortedStages = selectSortedStages(state);
          expect(sortedStages).toEqual(processTemplate.stages);
        });
    
        it('should return an empty array if stages are empty', () => {
          const processTemplate: DialecticProcessTemplate = {
            id: 'p1',
            name: 'Test Process',
            starting_stage_id: '1',
            stages: [],
            transitions: transitions,
            created_at: new Date().toISOString(),
            description: null
          };
          const state = { ...initialDialecticStateValues, currentProcessTemplate: processTemplate };
          const sortedStages = selectSortedStages(state);
          expect(sortedStages).toEqual([]);
        });
      });
});

const mockSeedPrompt: AssembledPrompt = mockAssembledPrompt();

describe('selectIsStageReadyForSessionIteration', () => {
    const projectId = 'proj-1';
    const sessionId = 'session-1';
    const stageSlug = 'thesis';
    const iterationNumber = 1;

    const mockSeedPromptResource: DialecticProjectResource = mockDialecticProjectResource({
        id: 'resource-1',
        project_id: projectId,
        storage_path: 'path/to/seed_prompt.md',
        file_name: 'seed_prompt.md',
        resource_description: JSON.stringify({
            type: 'seed_prompt',
            session_id: sessionId,
            stage_slug: stageSlug,
            iteration: iterationNumber,
        }),
    });

    const mockHeaderContextResource: DialecticProjectResource = mockDialecticProjectResource({
        id: 'resource-2',
        project_id: projectId,
        storage_path: 'path/to/header_context.json',
        file_name: 'header_context.json',
        mime_type: 'application/json',
        size_bytes: 250,
        resource_description: JSON.stringify({
            type: 'header_context',
            stage_slug: stageSlug,
            document_key: 'global_header',
            iteration: iterationNumber,
        }),
    });

    const stageReadyProcessTemplate: DialecticProcessTemplate = mockDialecticProcessTemplate({
        name: 'Test Template',
        description: 'A template for testing',
        starting_stage_id: 'stage-thesis',
        stages: [
            mockDialecticStage({
                id: 'stage-thesis',
                slug: 'thesis',
                display_name: 'Thesis',
                description: 'The first stage',
                default_system_prompt_id: null,
                minimum_balance: 0,
            }),
        ],
        transitions: [],
    });

    const projectWithResource: DialecticProject = mockDialecticProject({
        id: projectId,
        project_name: 'Test Project',
        initial_user_prompt: 'Test prompt',
        dialectic_domains: { name: 'Generic' },
        dialectic_sessions: [
            mockSession({
                id: sessionId,
                project_id: projectId,
                iteration_count: iterationNumber,
                session_description: 'Test session',
                selected_models: [],
                current_stage_id: 'stage-thesis',
                viewing_stage_id: null,
            }),
        ],
        resources: [],
        dialectic_process_templates: stageReadyProcessTemplate,
    });

    const requiredSeedPromptRecipe: DialecticStageRecipe = mockDialecticStageRecipe({
        stageSlug,
        instanceId: 'instance-1',
        steps: [
            mockDialecticStageRecipeStep({
                id: 'step-seed',
                step_key: 'seed_step',
                step_slug: 'seed-step',
                step_name: 'Seed Step',
                branch_key: 'branch-seed',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'prompt-1',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                inputs_required: [
                    { type: 'seed_prompt', document_key: 'seed_prompt', required: true, slug: 'seed_prompt' },
                ],
                outputs_required: [
                    { document_key: 'global_header', artifact_class: 'header_context', file_type: 'json' },
                ],
            }),
            mockDialecticStageRecipeStep({
                id: 'step-doc',
                step_key: 'doc_step',
                step_slug: 'doc-step',
                step_name: 'Document Step',
                execution_order: 2,
                parallel_group: 2,
                branch_key: 'branch-doc',
                prompt_template_id: 'prompt-2',
                inputs_required: [
                    { type: 'document', document_key: 'business_case', required: true, slug: 'thesis.business_case' },
                    { type: 'feedback', document_key: 'business_case', required: true, slug: 'thesis.feedback.business_case' },
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
                outputs_required: [],
            }),
        ],
    });

    const businessCaseContribution: DialecticContribution = mockDialecticContribution({
        id: 'contrib-1',
        session_id: sessionId,
        stage: 'thesis',
        iteration_number: iterationNumber,
        model_id: null,
        model_name: null,
        contribution_type: 'business_case',
    });

    const businessCaseFeedback: DialecticFeedback = mockDialecticFeedback({
        id: 'feedback-1',
        session_id: sessionId,
        project_id: projectId,
        stage_slug: 'thesis',
        iteration_number: iterationNumber,
        storage_bucket: 'bucket',
        storage_path: 'path',
        file_name: 'feedback.md',
        size_bytes: 512,
        feedback_type: 'business_case',
    });

    const buildState = (overrides: Partial<DialecticStateValues> = {}): DialecticStateValues => ({
        ...initialDialecticStateValues,
        currentProcessTemplate: stageReadyProcessTemplate,
        recipesByStageSlug: { [stageSlug]: requiredSeedPromptRecipe },
        ...overrides,
    });

    it('should return true when the recipe requires a seed prompt and a valid activeSeedPrompt exists in the state', () => {
        const state = buildState({ 
            currentProjectDetail: projectWithResource,
            activeSeedPrompt: mockSeedPrompt 
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return false if currentProjectDetail is null', () => {
        const state = buildState({
            currentProjectDetail: null,
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false when the recipe requires a seed prompt and activeSeedPrompt is null', () => {
        const state = buildState({
            currentProjectDetail: projectWithResource,
            activeSeedPrompt: null,
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if project.resources is null', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithoutResources: DialecticProject = {
            ...projectWithResource,
            resources: null as any, // Testing null case
        };
        const state = buildState({
            currentProjectDetail: projectWithoutResources,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });
    
    it('should return false if project.resources is empty', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithEmptyResources: DialecticProject = {
            ...projectWithResource,
            resources: [], 
        };
        const state = buildState({
            currentProjectDetail: projectWithEmptyResources,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if resource_description is null', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithNullDescResource: DialecticProject = {
            ...projectWithResource,
            resources: [{
                ...mockHeaderContextResource,
                resource_description: null as any,
            }],
        };
        const state = buildState({
            currentProjectDetail: projectWithNullDescResource,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });
    
    it('should return false if parsed desc.type does not match required type', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithWrongTypeResource: DialecticProject = {
            ...projectWithResource,
            resources: [{
                ...mockHeaderContextResource,
                resource_description: JSON.stringify({ type: 'not_header_context' }),
            }],
        };
        const state = buildState({
            currentProjectDetail: projectWithWrongTypeResource,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if desc.session_id does not match', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithWrongSessionResource: DialecticProject = {
            ...projectWithResource,
            resources: [{
                ...mockHeaderContextResource,
                resource_description: JSON.stringify({ ...JSON.parse(mockHeaderContextResource.resource_description!), session_id: 'wrong-session' }),
            }],
        };
        const state = buildState({
            currentProjectDetail: projectWithWrongSessionResource,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if desc.stage_slug does not match', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithWrongStageResource: DialecticProject = {
            ...projectWithResource,
            resources: [{
                ...mockHeaderContextResource,
                resource_description: JSON.stringify({ ...JSON.parse(mockHeaderContextResource.resource_description!), stage_slug: 'wrong-stage' }),
            }],
        };
        const state = buildState({
            currentProjectDetail: projectWithWrongStageResource,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return false if desc.iteration does not match', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const projectWithWrongIterationResource: DialecticProject = {
            ...projectWithResource,
            resources: [{
                ...mockHeaderContextResource,
                resource_description: JSON.stringify({ ...JSON.parse(mockHeaderContextResource.resource_description!), iteration: iterationNumber + 1 }),
            }],
        };
        const state = buildState({
            currentProjectDetail: projectWithWrongIterationResource,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });
    
    it('should return false if project has no sessions', () => {
        const projectWithNoSessions: DialecticProject = {
            ...projectWithResource,
            dialectic_sessions: [],
        };
        const state = buildState({
            currentProjectDetail: projectWithNoSessions,
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return true when a required header_context is satisfied by a resource', () => {
        const requiredHeaderContextRecipe: DialecticStageRecipe = {
            ...requiredSeedPromptRecipe,
            steps: [{
                ...requiredSeedPromptRecipe.steps[0],
                inputs_required: [
                    { type: 'header_context', document_key: 'global_header', required: true, slug: 'thesis.header.global' },
                ],
            }],
        };
        const otherResource: DialecticProjectResource = {
            ...mockHeaderContextResource,
            id: 'resource-other',
            resource_description: JSON.stringify({ type: 'other_type' }),
        };
        const projectWithMultipleResources: DialecticProject = {
            ...projectWithResource,
            resources: [otherResource, mockHeaderContextResource],
        };
        const state = buildState({
            currentProjectDetail: projectWithMultipleResources,
            recipesByStageSlug: { [stageSlug]: requiredHeaderContextRecipe },
            stageRunProgress: {
                [`${sessionId}:${stageSlug}:${iterationNumber}`]: {
                    stepStatuses: {
                        seed_step: 'completed',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return false when first step pending but required seed_prompt is missing', () => {
        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        const state = buildState({
            currentProjectDetail: projectWithResource,
            activeSeedPrompt: null,
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: {
                        seed_step: 'not_started',
                        doc_step: 'not_started',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });
        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return true when second step pending but first step completed (ignore second step requirements)', () => {
        const sessionWithDocumentOnly: DialecticSession = {
            ...projectWithResource.dialectic_sessions![0],
            dialectic_contributions: [businessCaseContribution],
            feedback: [],
        };

        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        const state = buildState({
            currentProjectDetail: {
                ...projectWithResource,
                dialectic_sessions: [sessionWithDocumentOnly],
            },
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: {
                        seed_step: 'completed',
                        doc_step: 'not_started',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });

        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return false when header context exists but producing step is in_progress', () => {
        const sessionWithDocAndFeedback: DialecticSession = {
            ...(projectWithResource.dialectic_sessions![0]),
            dialectic_contributions: [businessCaseContribution],
            feedback: [businessCaseFeedback],
        };

        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

        const state = buildState({
            activeSeedPrompt: mockSeedPrompt,
            currentProjectDetail: projectWithResource,
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: {
                        seed_step: 'in_progress',
                        doc_step: 'not_started',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });

        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(false);
    });

    it('should return true when first step (order 1) failed and prerequisites are met (allow retry)', () => {
        const sessionWithDocAndFeedback: DialecticSession = {
            ...(projectWithResource.dialectic_sessions![0]),
            dialectic_contributions: [businessCaseContribution],
            feedback: [businessCaseFeedback],
        };

        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

        const state = buildState({
            activeSeedPrompt: mockSeedPrompt,
            currentProjectDetail: {
                ...projectWithResource,
                resources: [mockHeaderContextResource],
                dialectic_sessions: [sessionWithDocAndFeedback],
            },
            recipesByStageSlug: { [stageSlug]: requiredSeedPromptRecipe },
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: {
                        seed_step: 'failed',
                        doc_step: 'not_started',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });

        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return true when first step (order 1) completed but second step (order 2) failed (allow retry, ignore internal requirements)', () => {
        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

        const state = buildState({
            activeSeedPrompt: mockSeedPrompt,
            currentProjectDetail: projectWithResource,
            recipesByStageSlug: { [stageSlug]: requiredSeedPromptRecipe },
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: {
                        seed_step: 'completed',
                        doc_step: 'failed',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });

        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return true when document, feedback, and completed header context are present', () => {
        const sessionSatisfied: DialecticSession = {
            ...(projectWithResource.dialectic_sessions![0]),
            dialectic_contributions: [businessCaseContribution],
            feedback: [businessCaseFeedback],
        };

        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

        const state = buildState({
            activeSeedPrompt: mockSeedPrompt,
            currentProjectDetail: {
                ...projectWithResource,
                resources: [mockHeaderContextResource],
                dialectic_sessions: [sessionSatisfied],
            },
            stageRunProgress: {
                [progressKey]: {
                    stepStatuses: {
                        seed_step: 'completed',
                        doc_step: 'not_started',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });

        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, stageSlug, iterationNumber)).toBe(true);
    });

    it('should return true when required document exists in stageRunProgress.documents for the source stage', () => {
        const sourceStageSlug = 'thesis';
        const targetStageSlug = 'synthesis';
        const sourceProgressKey = `${sessionId}:${sourceStageSlug}:${iterationNumber}`;
        const targetProgressKey = `${sessionId}:${targetStageSlug}:${iterationNumber}`;
        
        const requiredDocument: StageRenderedDocumentDescriptor = mockStageRenderedDocumentDescriptor({
            status: 'completed',
            job_id: 'job-doc-complete',
            latestRenderedResourceId: 'res-doc-complete',
            versionHash: 'hash-doc-complete',
            lastRenderedResourceId: 'res-doc-complete',
            stepKey: 'doc_step',
        });

        const recipeRequiringDocument: DialecticStageRecipe = mockDialecticStageRecipe({
            stageSlug: targetStageSlug,
            instanceId: 'instance-2',
            steps: [
                mockDialecticStageRecipeStep({
                    id: 'step-require-doc',
                    step_key: 'require_doc_step',
                    step_slug: 'require-doc-step',
                    step_name: 'Require Document Step',
                    branch_key: 'branch-require-doc',
                    prompt_template_id: 'prompt-3',
                    inputs_required: [
                        { type: 'document', document_key: 'business_case', required: true, slug: `${sourceStageSlug}.business_case` },
                    ],
                    outputs_required: [],
                }),
            ],
        });

        const targetProcessTemplate: DialecticProcessTemplate = mockDialecticProcessTemplate({
            ...stageReadyProcessTemplate,
            stages: [
                ...(stageReadyProcessTemplate.stages ?? []),
                mockDialecticStage({
                    id: 'stage-synthesis',
                    slug: targetStageSlug,
                    display_name: 'Synthesis',
                    description: 'The synthesis stage',
                    default_system_prompt_id: null,
                    minimum_balance: 0,
                }),
            ],
        });

        const sessionWithoutContribution: DialecticSession = {
            ...(projectWithResource.dialectic_sessions![0]),
            dialectic_contributions: [],
            feedback: [],
        };

        const state = buildState({
            activeSeedPrompt: mockSeedPrompt,
            currentProcessTemplate: targetProcessTemplate,
            currentProjectDetail: {
                ...projectWithResource,
                dialectic_sessions: [sessionWithoutContribution],
            },
            recipesByStageSlug: {
                [sourceStageSlug]: requiredSeedPromptRecipe,
                [targetStageSlug]: recipeRequiringDocument,
            },
            stageRunProgress: {
                [sourceProgressKey]: {
                    stepStatuses: {
                        seed_step: 'completed',
                    },
                    documents: {
                        'business_case': requiredDocument,
                    },
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
                [targetProgressKey]: {
                    stepStatuses: {
                        require_doc_step: 'not_started',
                    },
                    documents: {},
                    jobProgress: {},
                    jobs: [],
                    progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
                },
            },
        });

        expect(selectIsStageReadyForSessionIteration(state, projectId, sessionId, targetStageSlug, iterationNumber)).toBe(true);
    });
}); 

