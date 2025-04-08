import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ProfilePage } from './Profile';
import { useAuthStore } from '@paynless/store';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../../../../packages/api-client/src/setupTests'; // Adjust path
import { http, HttpResponse } from 'msw';
import type { UserProfile, UserProfileUpdate, ProfileResponse } from '@paynless/types';

// --- Mocks --- 
vi.mock('../components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div> }));

// Don't need to mock ProfileEditor here, we want to test the interaction

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return { ...actual }; // Use real store
});

vi.mock('@paynless/utils', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: MemoryRouter });
};

const API_BASE_URL = 'http://localhost/api'; // Adjust as needed

// Mock Profile Data for initial load
const initialProfile: UserProfile = {
  id: 'user-profile-123',
  first_name: 'Initial',
  last_name: 'Load',
  role: 'user', created_at: 'date', updatedAt: 'date'
};
const initialUser = { id: 'user-profile-123', email: 'profile@example.com', created_at: 'date' };

// --- Test Suite --- 
describe('ProfilePage MSW Integration', () => {

  afterEach(() => { server.resetHandlers(); vi.clearAllMocks(); });
  beforeEach(() => {
    // Mock initial successful profile load for most tests
    server.use(
      http.get(`${API_BASE_URL}/profile`, () => {
         // Mock response for initial load via authStore.initialize or direct fetch
         const mockResponse: ProfileResponse = {
            user: initialUser,
            profile: initialProfile,
         };
         return HttpResponse.json(mockResponse, { status: 200 });
      })
    );
    // Set initial store state simulating user is logged in but profile might not be loaded yet
    // The component will then fetch the profile using the MSW handler above
     vi.mocked(useAuthStore).setState({ 
        user: initialUser, 
        session: { access_token: 'valid-token' }, 
        profile: null, // Start with null profile
        isLoading: false, 
        error: null 
     });
     // Mock updateProfile separately for save tests
  });

  it('should load profile data and display it in the editor', async () => {
    // Store initially has no profile, ProfilePage might trigger a fetch or rely on init
    // For this test, assume ProfilePage uses updateProfile which fetches if profile is null,
    // OR relies on an initial load mechanism that uses the GET /profile handler.
    
    // We need to ensure the profile fetch happens. Let's mock the store's updateProfile
    // to simulate the fetch on load behavior if necessary, or assume init does it.
    const mockUpdate = vi.fn().mockResolvedValue(true); // Mock store action if needed
    vi.mocked(useAuthStore).setState({ 
        user: initialUser, 
        session: { access_token: 'valid-token' }, 
        profile: null, 
        isLoading: false, 
        error: null, 
        updateProfile: mockUpdate // Pass mock action
    });

    renderWithProviders(<ProfilePage />);
    
    // Wait for the profile data from MSW to be loaded and rendered in the form
    // Check for the initial values in the input fields
    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue(initialProfile.first_name);
      expect(screen.getByLabelText(/last name/i)).toHaveValue(initialProfile.last_name);
    });
  });

  it('should save profile successfully via API and show success message', async () => {
    const updatedProfile: UserProfile = { ...initialProfile, first_name: 'Updated' };
    // Mock successful PUT response
    server.use(
      http.put(`${API_BASE_URL}/profile`, async () => {
        return HttpResponse.json(updatedProfile, { status: 200 });
      })
    );
    // Ensure profile is loaded initially
    vi.mocked(useAuthStore).setState({ user: initialUser, session: { access_token: 'valid-token' }, profile: initialProfile, isLoading: false, error: null, updateProfile: useAuthStore.getState().updateProfile });

    renderWithProviders(<ProfilePage />);
    
    // Wait for initial load
    await waitFor(() => { expect(screen.getByLabelText(/first name/i)).toHaveValue(initialProfile.first_name); });

    // Change value and save
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Updated' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    // Check for success message
    await waitFor(() => {
      expect(screen.getByText(/Profile updated successfully!/i)).toBeInTheDocument();
    });
     // Check if store state was updated (optional, relies on real store update)
     expect(useAuthStore.getState().profile?.first_name).toBe('Updated');
  });

  it('should display error message on API save failure (e.g., 400)', async () => {
     // Mock failed PUT response
    server.use(
      http.put(`${API_BASE_URL}/profile`, async () => {
        return HttpResponse.json({ message: 'Validation failed' }, { status: 400 });
      })
    );
    vi.mocked(useAuthStore).setState({ user: initialUser, session: { access_token: 'valid-token' }, profile: initialProfile, isLoading: false, error: null, updateProfile: useAuthStore.getState().updateProfile });

    renderWithProviders(<ProfilePage />);
    await waitFor(() => { expect(screen.getByLabelText(/first name/i)).toHaveValue(initialProfile.first_name); });

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Invalid' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    // Check for error message (using the API response message)
    await waitFor(() => {
      expect(screen.getByText(/Error: Validation failed/i)).toBeInTheDocument();
    });
  });

}); 