import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Mock, vi } from 'vitest';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDialecticStore } from '@paynless/store';
import { ViewSessionButton } from './ViewSessionButton';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useNavigate: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));
vi.mock('@paynless/store', () => ({
  useDialecticStore: vi.fn(),
}));
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockNavigate = useNavigate as Mock;
const mockUseDialecticStore = useDialecticStore;

describe('ViewSessionButton', () => {
  let navigateMock: Mock;
  let mockActivateProjectAndSessionContextForDeepLink: Mock;
  let mockGetState: Mock;

  const mockProjectId = 'test-project-id';
  const mockSessionId = 'test-session-id';

  beforeEach(() => {
    navigateMock = vi.fn();
    mockNavigate.mockReturnValue(navigateMock);

    mockActivateProjectAndSessionContextForDeepLink = vi.fn().mockResolvedValue(undefined);
    
    mockGetState = vi.fn().mockReturnValue({
      projectDetailError: null,
      activeSessionDetailError: null,
    });

    mockUseDialecticStore.mockImplementation((selector) => {
      const stateMock = {
        activateProjectAndSessionContextForDeepLink: mockActivateProjectAndSessionContextForDeepLink,
        projectDetailError: mockGetState().projectDetailError,
        activeSessionDetailError: mockGetState().activeSessionDetailError,
      };

      if (selector) {
        return selector(stateMock);
      }
      return stateMock;
    });
    useDialecticStore.getState = mockGetState;

    vi.clearAllMocks();
  });

  it('renders with children or default text', () => {
    render(
      <ViewSessionButton projectId={mockProjectId} sessionId={mockSessionId}>
        View Session
      </ViewSessionButton>
    );
    expect(screen.getByRole('button', { name: /View Session/i })).toBeInTheDocument();
  });

  it('calls activateProjectAndSessionContextForDeepLink and navigates on success', async () => {
    render(
      <ViewSessionButton projectId={mockProjectId} sessionId={mockSessionId} />
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(
        mockProjectId,
        mockSessionId
      );
    });
    
    mockGetState.mockReturnValue({
        projectDetailError: null,
        activeSessionDetailError: null,
    });

    await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith(`/dialectic/${mockProjectId}/session/${mockSessionId}`);
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows toast error and does not navigate if activateProjectAndSessionContextForDeepLink sets projectDetailError', async () => {
    render(
      <ViewSessionButton projectId={mockProjectId} sessionId={mockSessionId} />
    );
    
    mockActivateProjectAndSessionContextForDeepLink.mockImplementation(async () => {
        mockGetState.mockReturnValue({
            projectDetailError: { message: 'Project fetch failed', code: 'API_ERROR' },
            activeSessionDetailError: null,
        });
        return Promise.resolve(); 
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(
        mockProjectId,
        mockSessionId
      );
    });
    
    await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load project or session context: Project fetch failed');
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows toast error and does not navigate if activateProjectAndSessionContextForDeepLink sets activeSessionDetailError', async () => {
    render(
      <ViewSessionButton projectId={mockProjectId} sessionId={mockSessionId} />
    );

    mockActivateProjectAndSessionContextForDeepLink.mockImplementation(async () => {
        mockGetState.mockReturnValue({
            projectDetailError: null,
            activeSessionDetailError: { message: 'Session fetch failed', code: 'API_ERROR' },
        });
        return Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(mockActivateProjectAndSessionContextForDeepLink).toHaveBeenCalledWith(
        mockProjectId,
        mockSessionId
      );
    });

    await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load project or session context: Session fetch failed');
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
  
  it('shows toast error and does not proceed if projectId is missing', async () => {
    render(<ViewSessionButton projectId="" sessionId={mockSessionId} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Project ID or Session ID is missing.');
    });
    expect(mockActivateProjectAndSessionContextForDeepLink).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows toast error and does not proceed if sessionId is missing', async () => {
    render(<ViewSessionButton projectId={mockProjectId} sessionId="" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Project ID or Session ID is missing.');
    });
    expect(mockActivateProjectAndSessionContextForDeepLink).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
  
  it('handles unexpected errors during click handling if thunk rejects', async () => {
    mockActivateProjectAndSessionContextForDeepLink.mockRejectedValueOnce(new Error('Unexpected thunk error'));
    render(
      <ViewSessionButton projectId={mockProjectId} sessionId={mockSessionId} />
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred while trying to view the session.');
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
}); 