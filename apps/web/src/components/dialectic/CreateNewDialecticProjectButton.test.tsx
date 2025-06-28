import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { CreateNewDialecticProjectButton } from './CreateNewDialecticProjectButton';

// Mock react-router-dom specifically for useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate, // Provide the mockNavigate function here
  };
});

describe('CreateNewDialecticProjectButton', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
  });

  it('should render the button with default text', () => {
    render(
      <MemoryRouter>
        <CreateNewDialecticProjectButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Create New Project/i })).toBeInTheDocument();
  });

  it('should render the button with custom children text', () => {
    const buttonText = 'Start a New Dialectic';
    render(
      <MemoryRouter>
        <CreateNewDialecticProjectButton>{buttonText}</CreateNewDialecticProjectButton>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: buttonText })).toBeInTheDocument();
  });

  it('should call navigate with /dialectic/new when clicked', () => {
    render(
      <MemoryRouter>
        <CreateNewDialecticProjectButton />
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /Create New Project/i });
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/dialectic/new');
  });

  it('should pass through other Button props', () => {
    render(
      <MemoryRouter>
        <CreateNewDialecticProjectButton variant="outline" size="sm" className="custom-class" />
      </MemoryRouter>
    );
    const button = screen.getByRole('button', { name: /Create New Project/i });
    expect(button).toHaveClass('custom-class');
    // Note: Asserting 'variant' and 'size' directly as classes can be brittle if UI component internals change.
    // It's often better to trust the underlying Button component handles these props if it's tested elsewhere.
    // However, checking for a distinguishing class applied by those props can be a pragmatic approach.
    // For Shadcn UI, specific classes are usually associated with variants and sizes.
    // For example, a variant="outline" might apply a class like 'bg-transparent' or 'border-input'.
    // This part of the test might need adjustment based on the actual classes applied by your Button component.
  });
}); 