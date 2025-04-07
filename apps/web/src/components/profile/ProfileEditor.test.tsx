import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileEditor } from './ProfileEditor';
import type { UserProfile } from '@paynless/types';

// Mock data
const mockProfile: UserProfile = {
  id: 'user-123',
  email: 'test@example.com', // Assuming email might be part of UserProfile
  first_name: 'InitialFirst',
  last_name: 'InitialLast',
  role: 'user',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockOnSave = vi.fn();

describe('ProfileEditor Component', () => {
  const user = userEvent.setup();

  const renderEditor = (isSaving = false, profile = mockProfile) => {
    mockOnSave.mockClear(); // Clear mock before each render call within tests
    return render(
      <ProfileEditor 
        profile={profile} 
        onSave={mockOnSave} 
        isSaving={isSaving} 
      />
    );
  };

  beforeEach(() => {
    // Reset mocks if needed (mockOnSave cleared in helper)
  });

  it('should render initial profile data and form elements', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: /basic info/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First Name')).toHaveValue('InitialFirst');
    expect(screen.getByPlaceholderText('Last Name')).toHaveValue('InitialLast');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('should handle empty initial profile data', () => {
    const emptyProfile = { ...mockProfile, first_name: null, last_name: null };
    renderEditor(false, emptyProfile);
    expect(screen.getByPlaceholderText('First Name')).toHaveValue('');
    expect(screen.getByPlaceholderText('Last Name')).toHaveValue('');
  });

  it('should update input fields on user typing', async () => {
    renderEditor();
    const firstNameInput = screen.getByPlaceholderText('First Name');
    const lastNameInput = screen.getByPlaceholderText('Last Name');

    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'UpdatedFirst');
    await user.clear(lastNameInput);
    await user.type(lastNameInput, 'UpdatedLast');

    expect(firstNameInput).toHaveValue('UpdatedFirst');
    expect(lastNameInput).toHaveValue('UpdatedLast');
  });

  it('should call onSave with updated values on submit', async () => {
    renderEditor();
    const firstNameInput = screen.getByPlaceholderText('First Name');
    const lastNameInput = screen.getByPlaceholderText('Last Name');
    const saveButton = screen.getByRole('button', { name: /save changes/i });

    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'NewFirst');
    await user.clear(lastNameInput);
    await user.type(lastNameInput, 'NewLast');
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith({ 
      first_name: 'NewFirst', 
      last_name: 'NewLast' 
    });
  });

  it('should disable inputs and change button text when isSaving is true', () => {
    renderEditor(true); // isSaving = true

    expect(screen.getByPlaceholderText('First Name')).toBeDisabled();
    expect(screen.getByPlaceholderText('Last Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving.../i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving.../i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /basic info/i })).toBeDisabled();
  });

  it('should not call onSave if submit is attempted while isSaving is true', async () => {
    renderEditor(true); // isSaving = true
    const saveButton = screen.getByRole('button', { name: /saving.../i });

    // Attempt click (though button is disabled, good to verify handler check)
    await user.click(saveButton);
    
    // Also try submitting the form directly
    const form = saveButton.closest('form'); // Find the form
    if (form) {
        fireEvent.submit(form);
    }

    expect(mockOnSave).not.toHaveBeenCalled();
  });
  
  it('should keep Basic Info tab selected when clicked (only one tab)', async () => {
     renderEditor();
     const basicInfoTab = screen.getByRole('button', { name: /basic info/i });
     // Check initial state (optional, assumes it defaults correctly)
     expect(basicInfoTab).toHaveClass('border-primary text-primary');
     
     // Click it again
     await user.click(basicInfoTab);
     
     // Verify it's still selected
     expect(basicInfoTab).toHaveClass('border-primary text-primary');
  });

}); 