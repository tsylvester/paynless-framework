import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';

// Use shared render function
import { render as customRender } from '../../tests/utils/render';
// Use shared MSW server instance
import { server } from '../mocks/server'; // Corrected Path
// Import components to test
import { ProfilePage } from '../../pages/Profile';
// Import actual store
import { useAuthStore } from '@paynless/store';
// Import types
import type { UserProfile, UserProfileUpdate, ProfileResponse, User } from '@paynless/types';

// API URL (Corrected Base URL)
const API_BASE_URL = 'http://test.host/functions/v1';

// Mock Profile Data for tests
const initialProfileData: UserProfile = {
  id: 'user-profile-123',
  first_name: 'Initial',
  last_name: 'Load',
  role: 'user', created_at: 'date', updatedAt: 'date'
};
const initialUserData: User = { id: 'user-profile-123', email: 'profile@example.com', created_at: 'date' };

describe('Profile Integration Tests', () => {
  // --- Test Suite Completeness Tracking ---
  // [✅] Profile Page: Load existing data (first name, last name) into ProfileEditor
  // [✅] Profile Page: Successfully update first name/last name
  // [✅] Profile Page: Display error message on update failure
  // [ ] Profile Page: Handle loading state during fetch/update

  // --- Test Setup ---
  beforeEach(() => {
    vi.clearAllMocks();
    // Set initial store state simulating user is logged in WITH profile data
    act(() => {
      useAuthStore.setState({
        ...useAuthStore.getInitialState(),
        user: initialUserData,
        session: { access_token: 'valid-token', refresh_token: 'ref', expires_in: 3600, token_type: 'bearer', user: initialUserData },
        profile: initialProfileData,
        isLoading: false,
      });
    });
    // Default GET handler for profile (Corrected path)
    server.use(
        http.get(`${API_BASE_URL}/me`, () => {
           const state = useAuthStore.getState();
           // Assuming /me returns UserProfile directly based on handler change
           return HttpResponse.json(state.profile ?? initialProfileData, { status: 200 });
        })
      );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  // --- Profile Tests ---
  it('should load existing profile data into the editor form', async () => {
      customRender(<ProfilePage />);

      // Verify the values are present in the form fields
      // Use findBy to wait for async rendering if ProfilePage fetches
      expect(await screen.findByLabelText(/first name/i)).toHaveValue(initialProfileData.first_name);
      expect(await screen.findByLabelText(/last name/i)).toHaveValue(initialProfileData.last_name);
      expect(await screen.findByLabelText(/email/i)).toHaveValue(initialUserData.email);
      expect(await screen.findByLabelText(/email/i)).toBeDisabled();
  });

  it('should successfully update profile via API and show success message', async () => {
    const updatedFirstName = 'UpdatedFirstName';
    const updatedLastName = 'UpdatedLastName';

    // Override PUT handler (Corrected path)
    server.use(
      http.put(`${API_BASE_URL}/me`, async ({ request }) => {
          const updatedData = await request.json() as UserProfileUpdate;
          const updatedProfileResponse: UserProfile = { ...initialProfileData, ...updatedData };
          // Return updated profile directly (matching handler)
          return HttpResponse.json(updatedProfileResponse, { status: 200 });
      })
    );

    customRender(<ProfilePage />);

    // Wait for initial load
    await screen.findByLabelText(/first name/i);

    // Change values
    await act(async () => {
        fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: updatedFirstName } });
        fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: updatedLastName } });
    });

    // Submit the form
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    // Check for success message/feedback
    await waitFor(() => {
      expect(screen.getByText(/Profile updated successfully!/i)).toBeInTheDocument();
    });

    // Verify store state was updated
    await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.profile?.first_name).toBe(updatedFirstName);
        expect(state.profile?.last_name).toBe(updatedLastName);
    });
  });

  it('should display error message on profile update failure (e.g., 400)', async () => {
     // Mock failed PUT response (Corrected path)
    server.use(
      http.put(`${API_BASE_URL}/me`, async () => {
        return HttpResponse.json({ error: { message: 'Update validation failed' } }, { status: 400 });
      })
    );

    customRender(<ProfilePage />);
    await screen.findByLabelText(/first name/i);

    await act(async () => {
        fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'TryingToSave' } });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    // Check for error message displayed by ProfileEditor/ProfilePage
    await waitFor(() => {
        // Error might be prefixed, adjust based on actual implementation
        expect(screen.getByText(/Update validation failed/i)).toBeInTheDocument();
    });

     // Verify store state was NOT updated
     const state = useAuthStore.getState();
     expect(state.profile?.first_name).toBe(initialProfileData.first_name);
  });

  // Add test for loading state if implemented
  it.todo('should show loading indicator during profile update');

}); 