import { useAuthStore } from "@paynless/store";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditName } from "./EditName";
import { toast } from "sonner";
import { ButtonProps, InputProps } from "react-day-picker";
import { UserProfile } from "@paynless/types";

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

vi.mock("lucide-react", () => ({
	AlertCircle: () => <div data-testid="alert-circle-icon" />,
	Loader2: (props: { className?: string }) => (
		<span data-testid="loader2-icon" {...props} />
	),
}));

describe("EditName Component", () => {
	const mockUpdateProfile = vi.fn();
	const mockProfileInitial: UserProfile = {
		id: "user123",
		first_name: "InitialFirst",
		last_name: "InitialLast",
		created_at: "2023-01-01T00:00:00Z",
		updated_at: "2023-01-01T00:00:00Z",
		role: "user",
		profile_privacy_setting: "private",
		chat_context: null,
		last_selected_org_id: null,
		is_subscribed_to_newsletter: false,
		has_seen_welcome_modal: false,
		signup_ref: null,
		subscribed_at: null,
		synced_to_kit_at: null,
		unsubscribed_at: null,
	};

	const setupMockStore = (
		profile: UserProfile | null = mockProfileInitial,
		isLoading = false,
		error: Error | null = null,
		updateProfileImpl?: () => Promise<UserProfile>,
	) => {
		vi.mocked(useAuthStore).mockReturnValue({
			profile,
			updateProfile: updateProfileImpl || mockUpdateProfile,
			isLoading,
			error,
			clearError: vi.fn(),
		});
	};

	beforeEach(() => {
		vi.clearAllMocks();
		setupMockStore();
	});

	it("should render with initial first and last names in input fields and a disabled Save button", () => {
		render(<EditName />);

		expect(screen.getByTestId("shadcn-card-title").textContent).toBe("Name");

		const firstNameInput = screen.getByLabelText<HTMLInputElement>(/first name/i);
		expect(firstNameInput).toBeDefined();
		expect(firstNameInput.value).toBe("InitialFirst");

		const lastNameInput = screen.getByLabelText<HTMLInputElement>(/last name/i);
		expect(lastNameInput).toBeDefined();
		expect(lastNameInput.value).toBe("InitialLast");

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeDefined();
		expect(saveButton.hasAttribute("disabled")).toBe(true);
	});

	it("should enable Save button when first name is changed", () => {
		render(<EditName />);
		const firstNameInput = screen.getByLabelText(/first name/i);
		const saveButton = screen.getByRole("button", { name: /save/i });

		fireEvent.change(firstNameInput, { target: { value: "NewFirst" } });
		expect(saveButton.hasAttribute("disabled")).toBe(false);
	});

	it("should enable Save button when last name is changed", () => {
		render(<EditName />);
		const lastNameInput = screen.getByLabelText(/last name/i);
		const saveButton = screen.getByRole("button", { name: /save/i });

		fireEvent.change(lastNameInput, { target: { value: "NewLast" } });
		expect(saveButton.hasAttribute("disabled")).toBe(false);
	});

	it("should call updateProfile with first and last names on Save and show success toast", async () => {
		const updatedProfileData = {
			...mockProfileInitial,
			first_name: "UpdatedFirst",
			last_name: "UpdatedLast",
		};
		mockUpdateProfile.mockResolvedValue(updatedProfileData);
		render(<EditName />);

		const firstNameInput = screen.getByLabelText(/first name/i);
		fireEvent.change(firstNameInput, { target: { value: "UpdatedFirst" } });
		const lastNameInput = screen.getByLabelText(/last name/i);
		fireEvent.change(lastNameInput, { target: { value: "UpdatedLast" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockUpdateProfile).toHaveBeenCalledWith({
				first_name: "UpdatedFirst",
				last_name: "UpdatedLast",
			});
			expect(toast.success).toHaveBeenCalledWith("Name updated successfully!");
		});
		expect(saveButton.hasAttribute("disabled")).toBe(false);
	});

	it("should display loading state on Save button during save operation", async () => {
		let resolveUpdate: (value: UserProfile) => void = () => {};
		const updatePromise = new Promise<UserProfile>((resolve) => {
			resolveUpdate = resolve;
		});

		// Initial store setup before any interaction
		setupMockStore(mockProfileInitial, false, null, () => updatePromise);

		render(<EditName />);
		const firstNameInput = screen.getByLabelText(/first name/i);
		fireEvent.change(firstNameInput, { target: { value: "SavingFirst" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(saveButton);

		expect(saveButton.textContent).toMatch(/saving.../i);
		expect(saveButton.hasAttribute("disabled")).toBe(true);

		// Simulate the successful resolution of the update
		const updatedProfileAfterSave = {
			...mockProfileInitial,
			first_name: "SavingFirst",
		};

		await act(async () => {
			resolveUpdate(updatedProfileAfterSave); // Resolve the promise
			await updatePromise; // Ensure promise is processed
			// Simulate store updating with the new profile data after successful save
			setupMockStore(updatedProfileAfterSave, false, null, () => updatePromise);
		});

		// Re-render or ensure component picks up new store state for hasChanged calculation
		// For this test, re-querying the button is fine as its text will change back to Save.
		// The key is that the profile used by hasChanged should reflect updatedProfileAfterSave.

		const finalSaveButton = screen.getByRole("button", { name: /save/i });
		expect(finalSaveButton.textContent).toMatch(/save/i);
		// Now that the profile in the store mock reflects the change,
		// and firstName input is 'SavingFirst',
		// hasChanged should be false, thus button is disabled.
		expect(finalSaveButton.hasAttribute("disabled")).toBe(true);
	});

	it("should show error toast when updateProfile returns null (simulating API error)", async () => {
		mockUpdateProfile.mockResolvedValue(null);
		setupMockStore(mockProfileInitial, false, null, mockUpdateProfile);

		render(<EditName />);

		const firstNameInput = screen.getByLabelText(/first name/i);
		fireEvent.change(firstNameInput, { target: { value: "ErrorFirst" } });

		const saveButton = screen.getByRole("button", { name: /save/i });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockUpdateProfile).toHaveBeenCalledWith({
				first_name: "ErrorFirst",
				last_name: "InitialLast",
			});
		});

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to update name. An unexpected error occurred.",
			);
		});

		const saveButtonAfterError = screen.getByRole("button", { name: /save/i });
		expect(saveButtonAfterError.hasAttribute("disabled")).toBe(false);
	});

	it("should render form when store has error on load (component does not display store error)", () => {
		const existingError = new Error("Initial store error on load");
		setupMockStore(mockProfileInitial, false, existingError);

		render(<EditName />);

		expect(screen.getByTestId("shadcn-card-title").textContent).toBe("Name");
		expect(screen.getByLabelText(/first name/i)).toBeDefined();
		expect(screen.queryByTestId("alert-circle-icon")).toBeNull();
	});

	it("should show loading message and no form when profile is not loaded", () => {
		setupMockStore(null);
		render(<EditName />);
		expect(
			screen.getByText(/Loading profile data.../i),
		).toBeDefined();
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
	});

	it("should render form with Save button when store isLoading is true (component uses only isSubmitting for button state)", () => {
		setupMockStore(mockProfileInitial, true);
		render(<EditName />);
		expect(screen.getByTestId("shadcn-card-title").textContent).toBe("Name");
		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeDefined();
		expect(saveButton.textContent).toMatch(/save/i);
		expect(saveButton.hasAttribute("disabled")).toBe(true);
	});
});
