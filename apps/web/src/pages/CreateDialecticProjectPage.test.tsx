import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { CreateDialecticProjectPage } from './CreateDialecticProjectPage';
// Import the component that is mocked. Due to vi.mock, this will be the mocked version.
import { CreateDialecticProjectForm } from '@/components/dialectic/CreateDialecticProjectForm';

// Mock the actual form component to isolate page logic tests
const mockOnProjectCreatedInternal = vi.fn();
vi.mock('@/components/dialectic/CreateDialecticProjectForm', () => ({
  // Capture the onProjectCreated prop to simulate its invocation
  CreateDialecticProjectForm: vi.fn((props) => {
    // Store the passed callback so we can call it in tests
    mockOnProjectCreatedInternal.mockImplementation(props.onProjectCreated);
    return <div data-testid="mock-create-dialectic-form">Mock Form</div>;
  }),
}));

// Mock react-router-dom for navigation
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

const mockNavigate = vi.fn();

describe('CreateDialecticProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    // Reset the mock implementation for onProjectCreated for each test
    mockOnProjectCreatedInternal.mockImplementation(() => {}); 
  });

  it('renders the CreateDialecticProjectForm component', () => {
    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('mock-create-dialectic-form')).toBeInTheDocument();
  });

  it('calls navigate when onProjectCreated callback is invoked from the form', () => {
    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );

    const testProjectId = 'newly-created-project-123';
    const testProjectName = 'Test Project Alpha';

    // Simulate the CreateDialecticProjectForm calling its onProjectCreated prop
    act(() => {
      // The mockOnProjectCreatedInternal function now holds the onProjectCreated
      // callback passed from CreateDialecticProjectPage to CreateDialecticProjectForm.
      // We call it here as if the form itself had called it upon successful creation.
      mockOnProjectCreatedInternal(testProjectId, testProjectName);
    });
    
    expect(mockNavigate).toHaveBeenCalledWith(`/dialectic/${testProjectId}`);
  });

  it('passes the onProjectCreated callback to CreateDialecticProjectForm', () => {
    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );
    // Check if the mock form component was called with a prop named onProjectCreated
    // and that prop is a function.
    expect(vi.mocked(CreateDialecticProjectForm)).toHaveBeenCalledWith(
      expect.objectContaining({
        onProjectCreated: expect.any(Function),
      }),
      expect.anything() // Second argument for React component context, if any
    );
  });
}); 