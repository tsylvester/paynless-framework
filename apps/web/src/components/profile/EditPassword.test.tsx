import { useAuthStore } from "@paynless/store";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditPassword } from "./EditPassword";
import { toast } from "sonner";

vi.mock("@paynless/store", () => ({
	useAuthStore: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

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
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input data-testid="shadcn-input" {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
	Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button data-testid="shadcn-button" {...props} />,
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

describe("EditPassword Component", () => {
	const mockUpdatePassword = vi.fn();

	const setupMockStore = (updatePasswordImpl?: () => Promise<boolean>) => {
		vi.mocked(useAuthStore).mockReturnValue({
			updatePassword: updatePasswordImpl ?? mockUpdatePassword,
		});
	};

	beforeEach(() => {
		vi.clearAllMocks();
		setupMockStore();
	});

	it("should render with empty password inputs and a disabled Update Password button", () => {
		render(<EditPassword />);

		expect(screen.getByTestId("shadcn-card-title").textContent).toBe(
			"Password",
		);

		const newPasswordInput = screen.getByLabelText<HTMLInputElement>(/new password/i);
		expect(newPasswordInput).toBeDefined();
		expect(newPasswordInput.value).toBe("");

		const confirmPasswordInput =
			screen.getByLabelText<HTMLInputElement>(/confirm password/i);
		expect(confirmPasswordInput).toBeDefined();
		expect(confirmPasswordInput.value).toBe("");

		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});
		expect(submitButton).toBeDefined();
		expect(submitButton.hasAttribute("disabled")).toBe(true);
	});

	it("should enable Update Password button when new password has input", () => {
		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText(/new password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, { target: { value: "SomePass1" } });
		expect(submitButton.hasAttribute("disabled")).toBe(false);
	});

	it("should enable Update Password button when confirm password has input", () => {
		render(<EditPassword />);
		const confirmPasswordInput =
			screen.getByLabelText(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(confirmPasswordInput, {
			target: { value: "SomePass1" },
		});
		expect(submitButton.hasAttribute("disabled")).toBe(false);
	});

	it("should show length validation error and not call updatePassword when password is shorter than 8 characters", async () => {
		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, { target: { value: "short" } });
		fireEvent.change(confirmPasswordInput, { target: { value: "short" } });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdatePassword).not.toHaveBeenCalled();
			expect(
				screen.getByText(/password must be at least 8 characters\./i),
			).toBeDefined();
		});
		expect(screen.getByTestId("alert-circle-icon")).toBeDefined();
	});

	it("should show mismatch validation error and not call updatePassword when passwords do not match", async () => {
		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.change(confirmPasswordInput, {
			target: { value: "OtherPass1" },
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdatePassword).not.toHaveBeenCalled();
			expect(
				screen.getByText(/passwords do not match\./i),
			).toBeDefined();
		});
	});

	it("should call updatePassword on submit and show success toast and clear inputs when update succeeds", async () => {
		mockUpdatePassword.mockResolvedValue(true);
		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText<HTMLInputElement>(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText<HTMLInputElement>(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.change(confirmPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdatePassword).toHaveBeenCalledTimes(1);
			expect(mockUpdatePassword).toHaveBeenCalledWith("ValidPass1");
			expect(toast.success).toHaveBeenCalledWith(
				"Password updated successfully!",
			);
		});
		expect(newPasswordInput.value).toBe("");
		expect(confirmPasswordInput.value).toBe("");
	});

	it("should show error toast and leave inputs unchanged when updatePassword returns false", async () => {
		mockUpdatePassword.mockResolvedValue(false);
		setupMockStore(mockUpdatePassword);
		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText<HTMLInputElement>(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText<HTMLInputElement>(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.change(confirmPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to update password. Please try again.",
			);
		});
		expect(newPasswordInput.value).toBe("ValidPass1");
		expect(confirmPasswordInput.value).toBe("ValidPass1");
	});

	it("should display Updating... and loader and disable button and inputs during submit", async () => {
		let resolveUpdate: (value: boolean) => void = () => {};
		const updatePromise = new Promise<boolean>((resolve) => {
			resolveUpdate = resolve;
		});
		setupMockStore(() => updatePromise);

		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.change(confirmPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.click(submitButton);

		expect(submitButton.textContent).toMatch(/updating.../i);
		expect(screen.getByTestId("loader2-icon")).toBeDefined();
		expect(submitButton.hasAttribute("disabled")).toBe(true);
		expect(newPasswordInput.hasAttribute("disabled")).toBe(true);
		expect(confirmPasswordInput.hasAttribute("disabled")).toBe(true);

		await act(async () => {
			resolveUpdate(true);
			await updatePromise;
		});

		const finalSubmitButton = screen.getByRole("button", {
			name: /update password/i,
		});
		expect(finalSubmitButton.textContent).toMatch(/update password/i);
	});

	it("should clear validation error when user types in new password after error", async () => {
		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, { target: { value: "short" } });
		fireEvent.change(confirmPasswordInput, { target: { value: "short" } });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(
				screen.getByText(/password must be at least 8 characters\./i),
			).toBeDefined();
		});

		fireEvent.change(newPasswordInput, { target: { value: "longer" } });

		await waitFor(() => {
			expect(
				screen.queryByText(/password must be at least 8 characters\./i),
			).toBeNull();
		});
	});

	it("should not call updatePassword twice when submit is clicked twice while submitting", async () => {
		let resolveUpdate: (value: boolean) => void = () => {};
		const updatePromise = new Promise<boolean>((resolve) => {
			resolveUpdate = resolve;
		});
		const updateImpl = vi.fn().mockReturnValue(updatePromise);
		setupMockStore(updateImpl);

		render(<EditPassword />);
		const newPasswordInput = screen.getByLabelText(/new password/i);
		const confirmPasswordInput =
			screen.getByLabelText(/confirm password/i);
		const submitButton = screen.getByRole("button", {
			name: /update password/i,
		});

		fireEvent.change(newPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.change(confirmPasswordInput, {
			target: { value: "ValidPass1" },
		});
		fireEvent.click(submitButton);
		fireEvent.click(submitButton);

		await act(async () => {
			resolveUpdate(true);
			await updatePromise;
		});

		await waitFor(() => {
			expect(updateImpl).toHaveBeenCalledTimes(1);
		});
	});
});
