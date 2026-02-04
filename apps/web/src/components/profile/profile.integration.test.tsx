// Import actual store
import { useAuthStore } from "@paynless/store";
// Import types
import type { User, UserProfile } from "@paynless/types";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockSetAuthError, resetAuthStoreMock } from "@/mocks/authStore.mock";
// Import components to test
import { ProfilePage } from "../../pages/Profile";

// Mock Profile Data for tests
const initialProfileData: UserProfile = {
	id: "user-profile-123",
	first_name: "Initial",
	last_name: "Load",
	role: "user",
	created_at: "date",
	updated_at: "date",
	chat_context: {},
	has_seen_welcome_modal: false,
	is_subscribed_to_newsletter: false,
	last_selected_org_id: null,
	profile_privacy_setting: "private",
};
const initialUserData: User = {
	id: "user-profile-123",
	email: "profile@example.com",
	created_at: "date",
};

const renderProfilePageWithToaster = () => {
	return render(
		<>
			<ProfilePage />
			<Toaster />
		</>,
	);
};

describe("Profile Integration Tests", () => {
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
				session: {
					access_token: "valid-token",
					refresh_token: "ref",
					expires_in: 3600,
					token_type: "bearer",
					expiresAt: new Date(Date.now() + 3600 * 1000).getTime(),
				},
				profile: initialProfileData,
				isLoading: false,
			});
		});
	});

	afterEach(() => {
		resetAuthStoreMock();
	});

	// --- Profile Tests ---
	it("should load existing profile data into the editor form", async () => {
		renderProfilePageWithToaster();

		// Verify the values are present in the form fields
		// Use findBy to wait for async rendering if ProfilePage fetches
		expect(await screen.findByLabelText(/first name/i)).toHaveValue(
			initialProfileData.first_name,
		);
		expect(await screen.findByLabelText(/last name/i)).toHaveValue(
			initialProfileData.last_name,
		);
		expect(await screen.findByLabelText(/email address/i)).toHaveValue(
			initialUserData.email,
		);
	});

	it("should successfully update profile via API and show success message", async () => {
		const updatedFirstName = "UpdatedFirstName";
		const updatedLastName = "UpdatedLastName";

		// Override PUT handler (Corrected path)
		// mockSetAuthProfile({ ...initialProfileData, first_name: updatedFirstName, last_name: updatedLastName });

		renderProfilePageWithToaster();

		// Wait for initial load and find the card
		const editNameCard: HTMLElement | null = (
			await screen.findByText("Edit Name")
		).closest('div[data-slot="card"]');
		expect(editNameCard).toBeInTheDocument();

		// Change values within the card
		if (editNameCard) {
			const firstNameInput = within(editNameCard).getByLabelText(/first name/i);
			const lastNameInput = within(editNameCard).getByLabelText(/last name/i);
			fireEvent.change(firstNameInput, { target: { value: updatedFirstName } });
			fireEvent.change(lastNameInput, { target: { value: updatedLastName } });
		}

		// Submit the form within the card
		await act(async () => {
			if (editNameCard) {
				const saveButton = within(editNameCard).getByRole("button", {
					name: /save/i,
				});
				fireEvent.click(saveButton);
			}
		});

		// Check for success message/feedback
		await waitFor(() => {
			expect(
				screen.getByText(/Name updated successfully!/i),
			).toBeInTheDocument();
		});

		// Verify store state was updated
		await waitFor(() => {
			const state = useAuthStore.getState();
			expect(state.profile?.first_name).toBe(updatedFirstName);
			expect(state.profile?.last_name).toBe(updatedLastName);
		});
	});

	it("should display error message on profile update failure (e.g., 400)", async () => {
		// Mock failed PUT response (Corrected path)
		mockSetAuthError(new Error("Update validation failed"));

		renderProfilePageWithToaster();

		const editNameCard: HTMLElement | null = (
			await screen.findByText("Edit Name")
		).closest('div[data-slot="card"]');
		expect(editNameCard).toBeInTheDocument();

		await act(async () => {
			if (editNameCard) {
				const firstNameInput =
					within(editNameCard).getByLabelText(/first name/i);
				fireEvent.change(firstNameInput, { target: { value: "TryingToSave" } });

				const saveButton = within(editNameCard).getByRole("button", {
					name: /save/i,
				});
				fireEvent.click(saveButton);
			}
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
	it.todo("should show loading indicator during profile update");
});
