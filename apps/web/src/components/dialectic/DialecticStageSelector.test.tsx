import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialecticStageSelector } from './DialecticStageSelector';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  DialecticStateValues,
  DialecticProject, 
  DialecticProcessTemplate, 
  DialecticStage, 
  DialecticStageTransition,
  DialecticDomain
} from '@paynless/types';
import { setDialecticState, resetDialecticStoreMock, getDialecticStoreState } from '@/mocks/dialecticStore.mock';

// Polyfill for PointerEvents
if (typeof window !== 'undefined') {
    class MockPointerEvent extends Event {
        button: number;
        ctrlKey: boolean;
        pointerType: string;
        pointerId: number; 

        constructor(type: string, props: PointerEventInit) {
            super(type, props);
            this.button = props.button || 0;
            this.ctrlKey = props.ctrlKey || false;
            this.pointerType = props.pointerType || 'mouse';
            this.pointerId = props.pointerId || 0;
        }
    }
    // @ts-expect-error window.PointerEvent is read-only
    window.PointerEvent = MockPointerEvent;
}

// Mock the store to use the centralized mock implementation
vi.mock('@paynless/store', () => import('@/mocks/dialecticStore.mock'));

// #region Mock Data
const mockThesisStage: DialecticStage = { id: 's1', slug: 'thesis', display_name: 'Thesis Stage', created_at: new Date().toISOString(), default_system_prompt_id: 'sp1', description: 'd', expected_output_artifacts: null, input_artifact_rules: null };
const mockAntithesisStage: DialecticStage = { ...mockThesisStage, id: 's2', slug: 'antithesis', display_name: 'Antithesis Stage' };
const mockSynthesisStage: DialecticStage = { ...mockThesisStage, id: 's3', slug: 'synthesis', display_name: 'Synthesis Stage' };

const mockTransitions: DialecticStageTransition[] = [
  { id: 't1', process_template_id: 'pt1', source_stage_id: 's1', target_stage_id: 's2', created_at: new Date().toISOString(), condition_description: null },
  { id: 't2', process_template_id: 'pt1', source_stage_id: 's2', target_stage_id: 's3', created_at: new Date().toISOString(), condition_description: null },
];

const mockStages: DialecticStage[] = [mockThesisStage, mockAntithesisStage, mockSynthesisStage];

const mockProcessTemplate: DialecticProcessTemplate = {
  id: 'pt1',
  domain_id: 'd1',
  starting_stage_id: 's1',
  name: 'Test Template',
  description: 'A test process template',
  created_at: new Date().toISOString(),
  stages: mockStages,
  transitions: mockTransitions,
};

const mockProject: DialecticProject = {
  id: 'p1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  process_template_id: 'pt1',
  user_id: 'u1',
  dialectic_sessions: [],
  initial_user_prompt: 'Test prompt',
  project_name: 'Test Project',
  selected_domain_id: 'd1',
  domain_name: 'Test Domain',
  selected_domain_overlay_id: null,
  repo_url: null,
  status: 'active',
};

const mockDomain: DialecticDomain = {
  id: 'd1',
  name: 'Test Domain',
  description: 'A test domain',
  parent_domain_id: null,
};
// #endregion

const setupStore = (initialState: Partial<DialecticStateValues> = {}) => {
  // Establish a baseline state for the tests, merging any overrides
  setDialecticState({
    currentProjectDetail: mockProject,
    currentProcessTemplate: mockProcessTemplate,
    activeContextStageSlug: mockSynthesisStage,
    isLoadingProcessTemplate: false,
    selectedDomain: mockDomain,
    ...initialState,
  });

  return { state: getDialecticStoreState() };
};

describe('DialecticStageSelector', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    // Reset the mock store's state before each test to ensure isolation
    resetDialecticStoreMock();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('renders the current stage name in the trigger', async () => {
    setupStore();
    render(<DialecticStageSelector />);
    const trigger = screen.getByRole('combobox');
    await waitFor(() => {
        expect(trigger).toHaveTextContent('Synthesis Stage');
    });
  });

  it('fetches the process template if not available', () => {
    const { state } = setupStore({ currentProcessTemplate: null, isLoadingProcessTemplate: false });
    render(<DialecticStageSelector />);
    expect(state.fetchProcessTemplate).toHaveBeenCalledWith('pt1');
  });

  it('renders a skeleton while loading the template', () => {
    setupStore({ isLoadingProcessTemplate: true, currentProcessTemplate: null });
    render(<DialecticStageSelector />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('displays the current stage and its predecessors in the dropdown', async () => {
    setupStore({ activeContextStageSlug: mockSynthesisStage });
    render(<DialecticStageSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    
    await screen.findByText('Thesis Stage');
    expect(screen.getByText('Antithesis Stage')).toBeInTheDocument();
    expect(screen.getAllByText('Synthesis Stage').length).toBeGreaterThan(0);

    const items = screen.getAllByRole('option');
    expect(items).toHaveLength(3);
  });

  it('calls setActiveDialecticContext when a previous stage is selected', async () => {
    const { state } = setupStore();
    render(<DialecticStageSelector />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    
    const thesisOption = await screen.findByText('Thesis Stage');
    await user.click(thesisOption);
    
    expect(state.setActiveDialecticContext).toHaveBeenCalledWith({ stageSlug: mockThesisStage, projectId: null, sessionId: null });
  });

  it('is disabled when the disabled prop is true', () => {
    setupStore(); // still need to setup the store state
    render(<DialecticStageSelector disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('is disabled if there is only one available stage (the current one)', () => {
    setupStore({ activeContextStageSlug: mockThesisStage });
    render(<DialecticStageSelector />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
}); 