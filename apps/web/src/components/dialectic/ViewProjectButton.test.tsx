import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ApiError } from '@paynless/types';

// Import utilities from the actual mock file
import { 
  initializeMockDialecticState, 
  setDialecticStateValues,
  getDialecticStoreState
} from '@/mocks/dialecticStore.mock';

import { ViewProjectButton } from './ViewProjectButton';

// Mock the actual store path to use exports from our mock file
vi.mock('@paynless/store', async () => {
  const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  return mockStoreExports;
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ViewProjectButton', () => {
  let mockFetchDialecticProjectDetailsThunk: Mock<[], Promise<void>>;
  let mockNavigateHook: Mock<[], typeof mockNavigate>;
  const mockNavigate = vi.fn();
  const projectId = 'test-project-123';
  const projectName = 'Test Project Name';

  beforeEach(() => {
    // Initialize the mock store (resets state and function mocks)
    initializeMockDialecticState(); 

    // Get a reference to the mock function from the initialized store
    // All actions in the mock store are already vi.fn()
    mockFetchDialecticProjectDetailsThunk = getDialecticStoreState().fetchDialecticProjectDetails as Mock<[], Promise<void>>;
    
    // Default successful resolution for the thunk
    mockFetchDialecticProjectDetailsThunk.mockResolvedValue(undefined);

    // Setup other mocks
    mockNavigateHook = useNavigate as Mock<[], typeof mockNavigate>;
    mockNavigateHook.mockReturnValue(mockNavigate);
    
    // Clear toast mocks for each test
    (toast.success as Mock).mockClear();
    (toast.error as Mock).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks(); // Clears navigate, toast, and the action spy itself
  });

  it('renders a button with the project name', () => {
    render(
      <MemoryRouter>
        <ViewProjectButton projectId={projectId} projectName={projectName} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: new RegExp(projectName, 'i') })).toBeInTheDocument();
  });

  it('calls fetchDialecticProjectDetails with projectId on click', async () => {
    render(
      <MemoryRouter>
        <ViewProjectButton projectId={projectId} projectName={projectName} />
      </MemoryRouter>
    );
    const button = screen.getByRole('button');
    
    await act(async () => {
      fireEvent.click(button);
    });
    
    await waitFor(() => {
        expect(mockFetchDialecticProjectDetailsThunk).toHaveBeenCalledTimes(1);
    });
    expect(mockFetchDialecticProjectDetailsThunk).toHaveBeenCalledWith(projectId);
  });

  it('navigates to the correct project URL after fetch succeeds and no store error', async () => {
    render(
      <MemoryRouter>
        <ViewProjectButton projectId={projectId} projectName={projectName} />
      </MemoryRouter>
    );
    const button = screen.getByRole('button');
    
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      // Ensure the thunk was called, which is a prerequisite for navigation
      expect(mockFetchDialecticProjectDetailsThunk).toHaveBeenCalledWith(projectId);
      // Since projectDetailError is null by default from initializeMockDialecticState,
      // and our thunk mock resolves successfully, navigation should occur.
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${projectId}`);
  });

  it('does not navigate and calls toast.error if store has an error post-fetch', async () => {
    const testError: ApiError = { message: 'Fetch failed badly', code: 'API_ERROR' };
    
    mockFetchDialecticProjectDetailsThunk.mockImplementation(async () => {
      setDialecticStateValues({ projectDetailError: testError });
      // No explicit return needed as it's mocked to return Promise<void>
    });

    render(
      <MemoryRouter>
        <ViewProjectButton projectId={projectId} projectName={projectName} />
      </MemoryRouter>
    );
    const button = screen.getByRole('button');
    
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(mockFetchDialecticProjectDetailsThunk).toHaveBeenCalledWith(projectId);
      // Verify that the error set by the thunk (via setDialecticStateValues) is indeed in the store
      expect(getDialecticStoreState().projectDetailError).toEqual(testError);
      expect(toast.error).toHaveBeenCalledWith(`Failed to load project: ${testError.message}`);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
}); 