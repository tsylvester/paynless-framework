import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ProfilePage } from './Profile';
import { useAuthStore } from '@paynless/store';
import React from 'react';
import type { UserProfile, UserProfileUpdate } from '@paynless/types';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Mock ProfileEditor and capture its props
let mockProfileEditorProps: any = {};
vi.mock('../components/profile/ProfileEditor', () => ({ 
  ProfileEditor: (props: any) => {
    mockProfileEditorProps = props; // Capture props for interaction testing
    return (
      <div data-testid="profile-editor">
        Mock Profile Editor
        {/* Add a button to simulate save for testing */}
        <button onClick={() => props.onSave({ first_name: 'Test', last_name: 'User' })}>
          Simulate Save
        </button>
      </div>
    );
  }
}));

// Mock Zustand store
const mockUpdateProfile = vi.fn();
vi.mock('@paynless/store', () => ({
  useAuthStore: vi.fn(),
}));

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock profile data
const mockUserProfile: UserProfile = {
  id: 'user-123',
  first_name: 'Initial',
  last_name: 'User',
  role: 'user',
  created_at: 'somedate',
  updated_at: 'somedate',
};

// --- Test Suite --- 
describe('ProfilePage Component', () => {

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mockProfileEditorProps = {}; // Reset captured props
    // Default: Successful load
    vi.mocked(useAuthStore).mockReturnValue({
      profile: mockUserProfile,
      isLoading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should render loading state initially', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      profile: null,
      isLoading: true,
      error: null,
      updateProfile: mockUpdateProfile,
    });
    render(<ProfilePage />);
    expect(screen.getByText(/Loading profile.../i)).toBeInTheDocument();
    expect(screen.queryByTestId('profile-editor')).not.toBeInTheDocument();
  });

  it('should render error state if profile loading fails', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      profile: null,
      isLoading: false,
      error: new Error('Failed to fetch'),
      updateProfile: mockUpdateProfile,
    });
    render(<ProfilePage />);
    expect(screen.getByText(/Could not load profile data/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch/i)).toBeInTheDocument(); // Shows store error
    expect(screen.queryByTestId('profile-editor')).not.toBeInTheDocument();
  });

  it('should render error state if profile is null even without store error', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      profile: null,
      isLoading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    });
    render(<ProfilePage />);
    expect(screen.getByText(/Could not load profile data/i)).toBeInTheDocument();
    expect(screen.queryByTestId('profile-editor')).not.toBeInTheDocument();
  });

  it('should render ProfileEditor when profile is loaded', () => {
    render(<ProfilePage />);
    expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
    // Check if profile data is passed correctly
    expect(mockProfileEditorProps.profile).toEqual(mockUserProfile);
  });

  it('should call updateProfile and show success message on successful save', async () => {
    mockUpdateProfile.mockResolvedValue(true); // Simulate successful update
    render(<ProfilePage />);
    
    // Simulate save action from ProfileEditor
    await act(async () => {
      mockProfileEditorProps.onSave({ first_name: 'Updated', last_name: 'Name' });
    });

    // Check store action call
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ first_name: 'Updated', last_name: 'Name' });

    // Check success message
    expect(screen.getByText(/Profile updated successfully!/i)).toBeInTheDocument();

    // Check message disappears after timeout
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText(/Profile updated successfully!/i)).not.toBeInTheDocument();
  });

  it('should show error message if updateProfile returns false', async () => {
    mockUpdateProfile.mockResolvedValue(false); // Simulate failed update from store
    // Optionally set a store error message
    vi.mocked(useAuthStore).mockReturnValueOnce({
      ...vi.mocked(useAuthStore)(),
      error: new Error('Store update failed')
    }); 
    
    render(<ProfilePage />);
    
    await act(async () => {
      mockProfileEditorProps.onSave({ first_name: 'Fail' });
    });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Error: Store update failed/i)).toBeInTheDocument(); // Shows error from store
    expect(screen.queryByText(/Profile updated successfully!/i)).not.toBeInTheDocument();
  });

  it('should show generic error message if updateProfile throws unexpected error', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Network issue')); // Simulate unexpected error
    render(<ProfilePage />);
    
    await act(async () => {
      mockProfileEditorProps.onSave({ first_name: 'Crash' });
    });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Error: An unexpected error occurred./i)).toBeInTheDocument();
    expect(screen.queryByText(/Profile updated successfully!/i)).not.toBeInTheDocument();
  });

  it('should pass isSaving=true to ProfileEditor during save operation', async () => {
    let resolveUpdate: (value: boolean) => void;
    const updatePromise = new Promise<boolean>(resolve => { resolveUpdate = resolve; });
    mockUpdateProfile.mockImplementation(() => updatePromise);
    
    render(<ProfilePage />);
    expect(mockProfileEditorProps.isSaving).toBe(false);

    let savePromise: Promise<void> | undefined;
    act(() => {
      savePromise = mockProfileEditorProps.onSave({ first_name: 'Saving' });
    });

    expect(mockProfileEditorProps.isSaving).toBe(true);

    // Resolve and wait only for the savePromise
    await act(async () => {
      resolveUpdate(true); 
      await savePromise; 
    });

    expect(mockProfileEditorProps.isSaving).toBe(false);
  });
}); 