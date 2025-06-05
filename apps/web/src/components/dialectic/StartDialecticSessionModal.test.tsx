import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import type { DialecticStore, DialecticProject, DialecticSession, StartSessionPayload, ApiError, AIModelCatalogEntry } from '@paynless/store';
import { StartDialecticSessionModal } from './StartDialecticSessionModal';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockSetStartNewSessionModalOpen = vi.fn();
const mockStartDialecticSession = vi.fn();
const mockFetchAIModelCatalog = vi.fn();

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useDialecticStore: vi.fn(),
    // Mock selectors used by StartDialecticSessionModal
    selectCurrentProjectId: vi.fn(state => state.currentProjectDetail?.id),
    selectIsStartNewSessionModalOpen: vi.fn(state => state.isStartNewSessionModalOpen),
    // Mock selectors for the form version (even if simplified now, good for future)
    selectModelCatalog: vi.fn(state => state.modelCatalog),
    selectIsLoadingModelCatalog: vi.fn(state => state.isLoadingModelCatalog),
    selectModelCatalogError: vi.fn(state => state.modelCatalogError),
    selectIsStartingSession: vi.fn(state => state.isStartingSession),
    selectStartSessionError: vi.fn(state => state.startSessionError),
  };
});

const createMockStoreState = (overrides: Partial<DialecticStore> = {}): DialecticStore => {
  const baseState: DialecticStore = {
    ...initialDialecticStateValues,
    currentProjectDetail: null, // Contains ID for projectId
    isStartNewSessionModalOpen: false, // Controls modal visibility
    setStartNewSessionModalOpen: mockSetStartNewSessionModalOpen,
    startDialecticSession: mockStartDialecticSession, // For session creation
    // For model catalog (relevant for form version)
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    fetchAIModelCatalog: mockFetchAIModelCatalog,
    isStartingSession: false,
    startSessionError: null,
    // ... other store parts, keep minimal
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    fetchDialecticProjects: vi.fn(),
    availableDomainTags: { data: [] },
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    isLoadingProjectDetail: false,
    projectDetailError: null,
    fetchDialecticProjectDetails: vi.fn(),
    isCreatingProject: false,
    createProjectError: null,
    createDialecticProject: vi.fn(),
    contributionContentCache: {},
    fetchContributionContent: vi.fn(),
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
    updateDialecticProjectInitialPrompt: vi.fn(),
    uploadProjectResourceFile: vi.fn(),
    isUpdatingProjectPrompt: false,
    isUploadingProjectResource: false,
    uploadProjectResourceError: null,
    allSystemPrompts: null,
    isCloningProject: false,
    cloneProjectError: null,
    isExportingProject: false,
    exportProjectError: null,
    exportDialecticProject: vi.fn(),
    cloneDialecticProject: vi.fn(),
    deleteDialecticProject: vi.fn(),
    selectedStageAssociation: null,
    availableDomainOverlays: null,
    isLoadingDomainOverlays: false,
    domainOverlaysError: null,
    selectedDomainOverlayId: null,
    setSelectedStageAssociation: vi.fn(),
    fetchAvailableDomainOverlays: vi.fn(),
    setSelectedDomainOverlayId: vi.fn(),
    _resetForTesting: vi.fn(),
    ...overrides,
  };
  return baseState;
};

const mockOnSessionStarted = vi.fn();

describe('StartDialecticSessionModal', () => {
  const testProjectId = 'modal-proj-789';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default store state for most tests
    const defaultMockStore = createMockStoreState({
      currentProjectDetail: { id: testProjectId } as DialecticProject, // Provides projectId
      isStartNewSessionModalOpen: false, // Modal closed by default
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(defaultMockStore));
  });

  it('does not render when isStartNewSessionModalOpen is false', () => {
    render(<StartDialecticSessionModal onSessionStarted={mockOnSessionStarted} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders when isStartNewSessionModalOpen is true and displays project ID', () => {
    const openState = createMockStoreState({
      currentProjectDetail: { id: testProjectId } as DialecticProject,
      isStartNewSessionModalOpen: true,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(openState));
    render(<StartDialecticSessionModal onSessionStarted={mockOnSessionStarted} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(`project: ${testProjectId}` , { exact: false })).toBeInTheDocument();
  });

  it('shows loading for project ID if currentProjectDetail is null when modal is open', () => {
    const openLoadingState = createMockStoreState({
      currentProjectDetail: null, // No project ID available
      isStartNewSessionModalOpen: true,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(openLoadingState));
    render(<StartDialecticSessionModal onSessionStarted={mockOnSessionStarted} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Loading project.../i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Session/i })).toBeDisabled();
  });

  it('calls setStartNewSessionModalOpen(false) when Cancel button is clicked', () => {
    const openState = createMockStoreState({ isStartNewSessionModalOpen: true });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(openState));
    render(<StartDialecticSessionModal onSessionStarted={mockOnSessionStarted} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockSetStartNewSessionModalOpen).toHaveBeenCalledWith(false);
  });

  // Test for DialogClose (X button) is implicitly covered by onOpenChange of the Dialog,
  // which our component wires to setStartNewSessionModalOpen.
  // To test this directly, one might need to simulate the Dialog's internal close trigger.

  it('calls onSessionStarted, toasts, and closes modal on successful (simplified) session start', async () => {
    mockStartDialecticSession.mockResolvedValue({ data: { id: 'new-session-id' } as DialecticSession, error: null });
    const openState = createMockStoreState({
      currentProjectDetail: { id: testProjectId } as DialecticProject,
      isStartNewSessionModalOpen: true,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(openState));

    render(<StartDialecticSessionModal onSessionStarted={mockOnSessionStarted} />);
    const startButton = screen.getByRole('button', { name: /Start Session/i });
    expect(startButton).not.toBeDisabled();
    
    fireEvent.click(startButton);
    
    // In the current simplified version, it doesn't call startDialecticSession action directly.
    // It directly calls onSessionStarted and closes.
    // If the actual startDialecticSession call were to be added back to the simplified button:
    // await waitFor(() => expect(mockStartDialecticSession).toHaveBeenCalled());

    expect(toast.info).toHaveBeenCalledWith('Session start process initiated (placeholder).');
    expect(mockOnSessionStarted).toHaveBeenCalledWith('new-simulated-session-id');
    expect(mockSetStartNewSessionModalOpen).toHaveBeenCalledWith(false);
  });

  it('disables Start Session button if projectId is not available', () => {
    const openState = createMockStoreState({
      currentProjectDetail: null, // No project ID
      isStartNewSessionModalOpen: true,
    });
    vi.mocked(useDialecticStore).mockImplementation((selector) => selector(openState));
    render(<StartDialecticSessionModal onSessionStarted={mockOnSessionStarted} />);
    expect(screen.getByRole('button', { name: /Start Session/i })).toBeDisabled();
  });

  // Add tests for the form submission (description, model selection) if that functionality is restored.
  // For example:
  // it('fetches AI model catalog when modal opens if not already loaded', () => { ... });
  // it('validates form fields and shows errors', async () => { ... });
  // it('calls startDialecticSession action with correct payload on form submit', async () => { ... });

}); 