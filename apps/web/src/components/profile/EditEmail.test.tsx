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
		expect(screen.getByTestId("shadcn-card-title")).toHaveTextContent("Email");

		const emailInput = screen.getByLabelText(/email address/i);
		expect(emailInput).toBeInTheDocument();
		expect(emailInput).toHaveValue(mockAuthUserInitial.email);

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeInTheDocument();
		expect(saveButton).toBeDisabled();
	});

	it("should enable Save button when email is changed", () => {
		setupMockStore();
		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		const saveButton = screen.getByRole("button", { name: /save/i });

		fireEvent.change(emailInput, { target: { value: "new@example.com" } });
		expect(saveButton).toBeEnabled();
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
			null,
			() => updatePromise,
		);

		render(<EditEmail />);
		const emailInput = screen.getByLabelText(/email address/i);
		fireEvent.change(emailInput, { target: { value: "saving@example.com" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
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
				null,
				() => updatePromise,
			);
		});

		const finalSaveButton = screen.getByRole("button", { name: /save/i });
		expect(finalSaveButton).toHaveTextContent(/save/i);
		// Email in input is 'saving@example.com', originalEmailFromAuth is 'initial@example.com'
		// So hasChanged is true, button should be enabled.
		expect(finalSaveButton).toBeEnabled();
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
		expect(saveButtonAfterError).toBeEnabled();
	});

	it("should render form when store has error on load (component does not display store error)", () => {
		const existingError = new Error("Initial store error on email load");
		setupMockStore(mockAuthUserInitial, mockUserProfile, false, existingError);

		render(<EditEmail />);

		expect(screen.getByTestId("shadcn-card-title")).toHaveTextContent("Email");
		expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
		expect(screen.queryByTestId("alert-circle-icon")).not.toBeInTheDocument();
	});

	it("should show loading message and no form when user is not loaded", () => {
		setupMockStore(null, mockUserProfile);
		render(<EditEmail />);
		expect(
			screen.getByText(/Loading email settings.../i),
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
	});

	it("should render form with Save button when store isLoading is true (component uses only isSubmitting for button state)", () => {
		setupMockStore(mockAuthUserInitial, mockUserProfile, true);
		render(<EditEmail />);
		expect(screen.getByTestId("shadcn-card-title")).toHaveTextContent("Email");
		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeInTheDocument();
		expect(saveButton).toHaveTextContent(/save/i);
		expect(saveButton).toBeDisabled();
	});
});
