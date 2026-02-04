import { useAuthStore } from "@paynless/store";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import { EditEmail } from "./EditEmail";
import "@testing-library/jest-dom";
import { toast } from "sonner";

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
	Input: (props: any) => <input data-testid="shadcn-input" {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
	Button: (props: any) => <button data-testid="shadcn-button" {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
	Label: (props: any) => <label data-testid="shadcn-label" {...props} />,
}));

vi.mock("lucide-react", () => ({
	AlertCircle: () => <div data-testid="alert-circle-icon" />,
}));

describe("EditEmail Component", () => {
	const mockUpdateEmail = vi.fn();

	// This mock is for the `profile` part of the store, which EditEmail uses for secondary checks or if user is null.
	// The primary source for email is now the `user` object.
	const mockUserProfile = {
		id: "user123",
		first_name: "Test",
		last_name: "User",
		// other profile fields if needed by the component indirectly
	};

	// Define a mock user object, which is now the primary source for email
	const mockAuthUserInitial = {
		id: "auth-user-123",
		email: "initial@example.com",
		// other auth user fields if the component ever needs them
	};

	const setupMockStore = (
		user: any = mockAuthUserInitial, // Add user parameter
		profile: any = mockUserProfile, // Profile is still there, used for fallback/error display
		isLoading = false,
		error: Error | null = null,
		updateEmailImpl?: () => Promise<any>,
	) => {
		(useAuthStore as unknown as vi.Mock).mockReturnValue({
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
		expect(screen.getByTestId("shadcn-card-title")).toHaveTextContent(
			"Edit Email",
		);

		const emailInput = screen.getByLabelText(/email address/i);
		expect(emailInput).toBeInTheDocument();
		expect(emailInput).toHaveValue(mockAuthUserInitial.email);

		const saveButton = screen.getByRole("button", { name: /save changes/i });
		expect(saveButton).toBeInTheDocument();
		expect(saveButton).toBeDisabled();
	});

	it("should enable Save button when email is changed", () => {
		setupMockStore();
		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		const saveButton = screen.getByRole("button", { name: /save changes/i });

		fireEvent.change(emailInput, { target: { value: "new@example.com" } });
		expect(saveButton).toBeEnabled();
	});

	it("should call updateEmail on Save and show success toast", async () => {
		mockUpdateEmail.mockResolvedValue(true);
		setupMockStore();
		render(<EditEmail />);

		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "updated@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save changes/i });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockUpdateEmail).toHaveBeenCalledWith({
				email: "updated@example.com",
			});
			expect(toast.success).toHaveBeenCalledWith(
				"Email update request sent! Check your inbox for verification.",
			);
		});
		// After submission, isSubmitting is false. hasChanged is true (updated@example.com vs initial@example.com).
		// So button should be enabled.
		expect(saveButton).toBeEnabled();
	});

	it("should display loading state on Save button during save operation", async () => {
		let resolveUpdate: (value: any) => void = () => {};
		const updatePromise = new Promise<any>((resolve) => {
			resolveUpdate = resolve;
		});
		setupMockStore(
			mockAuthUserInitial,
			mockUserProfile,
			false,
			() => updatePromise,
		);

		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "saving@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save changes/i });
		expect(saveButton).toBeEnabled();
		fireEvent.click(saveButton);

		// Button text should be Saving... due to isSubmitting being true
		expect(saveButton).toHaveTextContent(/saving.../i);
		expect(saveButton).toBeDisabled();

		const newEmail = "saving@example.com";
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
				() => updatePromise,
			);
		});

		const finalSaveButton = screen.getByRole("button", {
			name: /save changes/i,
		});
		expect(finalSaveButton).toHaveTextContent(/save changes/i);
		// Email in input is 'saving@example.com', originalEmailFromAuth is 'initial@example.com'
		// So hasChanged is true, button should be enabled.
		expect(finalSaveButton).toBeEnabled();
	});

	it("should show error toast and in-card error if updateEmail returns false (simulating API error)", async () => {
		const errorMsg = "Invalid Email Format";
		mockUpdateEmail.mockResolvedValue(false);
		// Provide a user object for the form to render
		setupMockStore(
			mockAuthUserInitial,
			mockUserProfile,
			false,
			new Error(errorMsg),
			mockUpdateEmail,
		);

		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "error@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save changes/i });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockUpdateEmail).toHaveBeenCalledWith({
				email: "error@example.com",
			});
		});

		await waitFor(() => {
			expect(screen.getByTestId("alert-circle-icon")).toBeInTheDocument();
			expect(screen.getByText(errorMsg)).toBeInTheDocument();
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to update email. An unexpected error occurred.",
			);
		});
		const saveButtonAfterError = screen.getByRole("button", {
			name: /save changes/i,
		});
		expect(saveButtonAfterError).toBeEnabled();
	});

	it("should display storeError if present on load, without user interaction", () => {
		const existingError = new Error("Initial store error on email load");
		// Provide user object for the form to render, even with an error
		setupMockStore(mockAuthUserInitial, mockUserProfile, false, existingError);

		render(<EditEmail />);

		expect(screen.getByTestId("alert-circle-icon")).toBeInTheDocument();
		expect(screen.getByText(existingError.message)).toBeInTheDocument();
	});

	it("should show user data not available if user is not loaded", () => {
		setupMockStore(null, mockUserProfile); // Pass null for user
		render(<EditEmail />);
		expect(
			screen.getByText(/User data not available. Cannot edit email./i),
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
	});

	it("should disable save button and show loading text if component is in loading state from store", () => {
		setupMockStore(mockAuthUserInitial, mockUserProfile, true);
		render(<EditEmail />);
		// When storeIsLoading is true, component isLoading is true, button text is Saving...
		const saveButton = screen.getByRole("button", { name: /saving.../i });
		expect(saveButton).toBeInTheDocument();
		expect(saveButton).toBeDisabled();
		expect(saveButton).toHaveTextContent(/saving.../i);
	});
});
