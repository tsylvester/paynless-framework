import { useAuthStore } from "@paynless/store";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditEmail } from "./EditEmail";
import { toast } from "sonner";
import { ButtonProps, InputProps } from "react-day-picker";
import { User, UserProfile } from "@paynless/types";

// Mock the useAuthStore
vi.mock("@paynless/store", () => ({
	useAuthStore: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock ShadCN Card components
vi.mock("@/components/ui/card", () => ({
	Card: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="shadcn-card" className={className}>
			{children}
		</div>
	),
	CardHeader: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="shadcn-card-header" className={className}>
			{children}
		</div>
	),
	CardTitle: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<h3 data-testid="shadcn-card-title" className={className}>
			{children}
		</h3>
	),
	CardDescription: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<p data-testid="shadcn-card-description" className={className}>
			{children}
		</p>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="shadcn-card-content" className={className}>
			{children}
		</div>
	),
	CardFooter: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div data-testid="shadcn-card-footer" className={className}>
			{children}
		</div>
	),
}));
vi.mock("@/components/ui/input", () => ({
	Input: (props: InputProps) => <input data-testid="shadcn-input" {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
	Button: (props: ButtonProps) => <button data-testid="shadcn-button" {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
	Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label data-testid="shadcn-label" {...props} />,
}));

describe("EditEmail Component", () => {
	const mockUpdateEmail = vi.fn();

	// This mock is for the `profile` part of the store, which EditEmail uses for secondary checks or if user is null.
	// The primary source for email is now the `user` object.
	const mockUserProfile: UserProfile = {
		id: "user123",
		first_name: "Test",
		last_name: "User",
		chat_context: null,
		created_at: "now",
		has_seen_welcome_modal: false,
		is_subscribed_to_newsletter: false,
		last_selected_org_id: null,
		profile_privacy_setting: "private",
		role: "user",
		updated_at: "now",
		signup_ref: null,
		subscribed_at: null,
		synced_to_kit_at: null,
		unsubscribed_at: null,
	};

	// Define a mock user object, which is now the primary source for email
	const mockAuthUserInitial: User = {
		id: "auth-user-123",
		email: "initial@example.com",
	};

	const setupMockStore = (
		user: User | null = mockAuthUserInitial,
		profile: UserProfile = mockUserProfile, // Profile is still there, used for fallback/error display
		isLoading = false,
		error: Error | null = null,
		updateEmailImpl?: () => Promise<boolean>,
	) => {
		vi.mocked(useAuthStore).mockReturnValue({
			user, // Provide the user object
			profile,
			updateEmail: updateEmailImpl || mockUpdateEmail,
			isLoading,
			error,
			clearError: vi.fn(),
		});
	};

	beforeEach(() => {
		vi.clearAllMocks();
		setupMockStore();
	});

	it("should render with initial email in an input field and a disabled Save button", () => {
		setupMockStore(); // Uses mockAuthUserInitial by default
		render(<EditEmail />);
		expect(screen.getByTestId("shadcn-card-title").textContent).toBe("Email");

		const emailInput = screen.getByLabelText<HTMLInputElement>(/email address/i);
		expect(emailInput).toBeDefined();
		expect(emailInput.value).toBe(mockAuthUserInitial.email);

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeDefined();
		expect(saveButton.hasAttribute("disabled")).toBe(true);
	});

	it("should enable Save button when email is changed", () => {
		setupMockStore();
		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		const saveButton = screen.getByRole("button", { name: /save/i });

		fireEvent.change(emailInput, { target: { value: "new@example.com" } });
		expect(saveButton.hasAttribute("disabled")).toBe(false);
	});

	it("should call updateEmail on Save and show success toast", async () => {
		mockUpdateEmail.mockResolvedValue(true);
		setupMockStore();
		render(<EditEmail />);

		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "updated@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockUpdateEmail).toHaveBeenCalledWith("updated@example.com");
			expect(toast.success).toHaveBeenCalledWith(
				"Email update request sent! Check your inbox for verification.",
			);
		});
		// After submission, isSubmitting is false. hasChanged is true (updated@example.com vs initial@example.com).
		// So button should be enabled.
		expect(saveButton.hasAttribute("disabled")).toBe(false);
	});

	it("should display loading state on Save button during save operation", async () => {
		let resolveUpdate: (value: boolean) => void = () => {};
		const updatePromise = new Promise<boolean>((resolve) => {
			resolveUpdate = resolve;
		});
		setupMockStore(
			mockAuthUserInitial,
			mockUserProfile,
			false,
			null,
			() => updatePromise,
		);

		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "saving@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(saveButton);

		// Button text should be Saving... due to isSubmitting being true
		expect(saveButton.textContent).toMatch(/saving.../i);
		expect(saveButton.hasAttribute("disabled")).toBe(true);

		// Simulate the user object in store being updated if verification was instant (not typical for email)
		// For this test, originalEmailFromAuth remains initial@example.com
		const updatedUserAfterSaveAttempt = { ...mockAuthUserInitial }; // email doesn't change yet

		await act(async () => {
			resolveUpdate(true); // Simulate successful request
			await updatePromise;
			// If the store user data itself were to update with the new email *before* verification, setup again.
			// However, for email changes, user.email usually doesn't change until verification.
			// So, we expect the button to be enabled as 'saving@example.com' !== 'initial@example.com'
			setupMockStore(
				updatedUserAfterSaveAttempt,
				mockUserProfile,
				false,
				null,
				() => updatePromise,
			);
		});

		const finalSaveButton = screen.getByRole("button", { name: /save/i });
		expect(finalSaveButton.textContent).toMatch(/save/i);
		// Email in input is 'saving@example.com', originalEmailFromAuth is 'initial@example.com'
		// So hasChanged is true, button should be enabled.
		expect(finalSaveButton.hasAttribute("disabled")).toBe(false);
	});

	it("should show error toast when updateEmail returns false (simulating API error)", async () => {
		mockUpdateEmail.mockResolvedValue(false);
		setupMockStore(
			mockAuthUserInitial,
			mockUserProfile,
			false,
			null,
			mockUpdateEmail,
		);

		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "error@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockUpdateEmail).toHaveBeenCalledWith("error@example.com");
		});

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to update email. An unexpected error occurred.",
			);
		});
		const saveButtonAfterError = screen.getByRole("button", { name: /save/i });
		expect(saveButtonAfterError.hasAttribute("disabled")).toBe(false);
	});

	it("should render form when store has error on load (component does not display store error)", () => {
		const existingError = new Error("Initial store error on email load");
		setupMockStore(mockAuthUserInitial, mockUserProfile, false, existingError);

		render(<EditEmail />);

		expect(screen.getByTestId("shadcn-card-title").textContent).toBe("Email");
		expect(screen.getByLabelText(/email address/i)).toBeDefined();
		expect(screen.queryByTestId("alert-circle-icon")).toBeNull();
	});

	it("should show loading message and no form when user is not loaded", () => {
		setupMockStore(null, mockUserProfile);
		render(<EditEmail />);
		expect(
			screen.getByText(/Loading email settings.../i),
		).toBeDefined();
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
	});

	it("should render form with Save button when store isLoading is true (component uses only isSubmitting for button state)", () => {
		setupMockStore(mockAuthUserInitial, mockUserProfile, true);
		render(<EditEmail />);
		expect(screen.getByTestId("shadcn-card-title").textContent).toBe("Email");
		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeDefined();
		expect(saveButton.textContent).toMatch(/save/i);
		expect(saveButton.hasAttribute("disabled")).toBe(true);
	});
});
