import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Initialize API Client FIRST
import { initializeApiClient } from '@paynless/api-client';
initializeApiClient({
  baseUrl: 'http://test.host/functions/v1',
  supabaseAnonKey: 'test-anon-key'
});

// Other imports
import { AppContent } from '../App'; // Assuming ProfilePage is rendered within AppContent routes
import { useAuthStore } from '@paynless/store';
import { UserProfile, UserRole } from '@paynless/types';

// --- Mock Data ---
const mockUser = { id: 'user-123', email: 'profile@example.com', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };
const mockSession = { access_token: 'profile-token', refresh_token: 'profile-refresh', expiresAt: Date.now() + 3600 * 1000 };
const initialMockProfile: UserProfile = { id: 'user-123', first_name: 'Initial', last_name: 'User', role: 'user' as UserRole, created_at: 'now', updated_at: 'now' };
const updatedMockProfile: UserProfile = { ...initialMockProfile, first_name: 'Updated' };

// --- MSW Handlers ---
const handlers = [
  // Mock GET /me (used by authStore initialization/refresh perhaps, and maybe ProfilePage?)
  http.get('http://test.host/functions/v1/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (authHeader === `Bearer ${mockSession.access_token}`) {
      console.log('[MSW /me Handler] GET request intercepted (Token OK)');
      return HttpResponse.json({ user: mockUser, profile: initialMockProfile });
    }
    console.log('[MSW /me Handler] GET request intercepted (Token INVALID)');
    return new HttpResponse('Unauthorized', { status: 401 });
  }),

  // Mock PUT /profile (used by ProfilePage save)
  http.put('http://test.host/functions/v1/profile', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${mockSession.access_token}`) {
      console.log('[MSW /profile Handler] PUT request intercepted (Token INVALID)');
      return new HttpResponse('Unauthorized', { status: 401 });
    }

    const requestBody = await request.json() as Partial<UserProfile>;
    console.log('[MSW /profile Handler] PUT request intercepted (Token OK)', requestBody);

    // Simulate success or validation error based on input
    if (requestBody.first_name === 'Updated') {
        // Return the updated profile on success
        return HttpResponse.json(updatedMockProfile);
    } else if (requestBody.first_name === 'ErrorTrigger') {
         // Simulate a server error
        return HttpResponse.json({ message: 'Server validation failed' }, { status: 500 });
    }
    // Default success case for other updates
    return HttpResponse.json({ ...initialMockProfile, ...requestBody });
  }),
];

const server = setupServer(...handlers);

// --- Test Setup ---
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProviders = (ui: React.ReactElement, { route = '/' } = {}) => {
  window.history.pushState({}, 'Test page', route);

  // Pre-populate auth store for protected routes/components
  useAuthStore.setState({
      user: mockUser,
      session: mockSession,
      profile: initialMockProfile, // Start with initial profile
      isLoading: false,
      error: null,
  });

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <>
              <Toaster /> {/* Add Toaster for displaying success/error messages */}
              {children}
            </>
          </MemoryRouter>
      </QueryClientProvider>
    ),
  });
};

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  // Reset auth store to initial state IF needed, but maybe better to set it fresh in renderWithProviders
  // useAuthStore.setState(useAuthStore.getInitialState(), true);
  queryClient.clear();
});
afterAll(() => server.close());


// --- Test Suite ---
describe('Profile Management Integration Tests (MSW)', () => {

  it('should load and display initial profile data', async () => {
    renderWithProviders(<AppContent />, { route: '/profile' });

    // Verify the profile page heading is visible
    expect(await screen.findByRole('heading', { name: /profile settings/i })).toBeInTheDocument();

    // Verify initial data is displayed in form fields (assuming input labels or ids)
    // Use findBy* to wait for async loading triggered by the page/auth store init
    expect(await screen.findByLabelText(/first name/i)).toHaveValue(initialMockProfile.first_name);
    expect(screen.getByLabelText(/last name/i)).toHaveValue(initialMockProfile.last_name);
    expect(screen.getByLabelText(/email/i)).toHaveValue(mockUser.email); // Email likely comes from user object

    // Check if email is disabled (common practice)
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
  });

  it('should update profile successfully and show success toast', async () => {
     renderWithProviders(<AppContent />, { route: '/profile' });

     // Wait for initial load
     const firstNameInput = await screen.findByLabelText(/first name/i);
     expect(firstNameInput).toHaveValue(initialMockProfile.first_name);

     // Change first name
     fireEvent.change(firstNameInput, { target: { value: 'Updated' } });
     expect(firstNameInput).toHaveValue('Updated'); // Verify input change

     // Submit the form
     fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

     // Wait for success toast (adjust text based on actual implementation)
     expect(await screen.findByText(/profile updated successfully/i)).toBeInTheDocument();

     // Verify form field still shows the updated value
     expect(screen.getByLabelText(/first name/i)).toHaveValue(updatedMockProfile.first_name);

     // Verify authStore state was updated
     await waitFor(() => {
        expect(useAuthStore.getState().profile?.first_name).toBe(updatedMockProfile.first_name);
     });
  });

   it('should display error toast if profile update fails', async () => {
     renderWithProviders(<AppContent />, { route: '/profile' });

     // Wait for initial load
     const firstNameInput = await screen.findByLabelText(/first name/i);
     expect(firstNameInput).toHaveValue(initialMockProfile.first_name);

     // Change first name to trigger server error in mock handler
     fireEvent.change(firstNameInput, { target: { value: 'ErrorTrigger' } });

     // Submit the form
     fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

     // Wait for error toast (adjust text based on actual implementation)
     expect(await screen.findByText(/server validation failed/i)).toBeInTheDocument(); // Match error from mock

     // Verify form field retains the value that caused the error
     expect(screen.getByLabelText(/first name/i)).toHaveValue('ErrorTrigger');

     // Verify authStore state was NOT updated
     expect(useAuthStore.getState().profile?.first_name).toBe(initialMockProfile.first_name);
  });

}); 