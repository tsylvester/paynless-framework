import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateDialecticProjectPage } from './CreateDialecticProjectPage';
import { CreateDialecticProjectForm } from '@/components/dialectic/CreateDialecticProjectForm';

// Mock the form component to ensure the page renders it.
vi.mock('@/components/dialectic/CreateDialecticProjectForm', () => ({
  CreateDialecticProjectForm: vi.fn(() => <div data-testid="mock-create-dialectic-form">Mock Form</div>),
}));

describe('CreateDialecticProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the CreateDialecticProjectForm component', () => {
    render(
      <MemoryRouter>
        <CreateDialecticProjectPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('mock-create-dialectic-form')).toBeInTheDocument();
    
    // Verify that the form is rendered with the correct container class for the page context.
    expect(vi.mocked(CreateDialecticProjectForm)).toHaveBeenCalledWith(
      expect.objectContaining({
        containerClassName: 'w-full max-w-3xl',
      }),
      expect.anything()
    );
  });
}); 