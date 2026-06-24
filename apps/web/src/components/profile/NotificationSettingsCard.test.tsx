import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import {
	mockSetAuthError,
	mockSetAuthIsLoading,
	mockSetAuthProfile,
	resetAuthStoreMock,
	useAuthStore,
} from "../../mocks/authStore.mock";
import { mockUserProfile } from "../../mocks/profile.mock";
import { NotificationSettingsCard } from "./NotificationSettingsCard";

vi.mock("@paynless/store", () => ({
	useAuthStore: useAuthStore,
}));

vi.mock("@/components/ui/switch", () => ({
	Switch: ({
		checked,
		onCheckedChange,
		disabled,
		...props
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		disabled: boolean;
	}) => (
		<input
			type="checkbox"
			checked={checked}
			onChange={(e) => onCheckedChange(e.target.checked)}
			disabled={disabled}
			{...props}
		/>
	),
}));

describe("NotificationSettingsCard", () => {
	beforeEach(() => {
		resetAuthStoreMock();
		vi.clearAllMocks();
	});

	it("should render the card and switch correctly", () => {
		mockSetAuthProfile({
			...mockUserProfile,
			is_subscribed_to_newsletter: false,
		});
		render(<NotificationSettingsCard />);
		expect(screen.getByText(/Email Notifications/i)).toBeDefined();
		const switchControl = screen.getByRole("checkbox", {
			name: /Subscribe to system notices and updates/i,
		});
		expect(switchControl.hasAttribute("checked")).toBe(false);
	});

	it("should call toggleNewsletterSubscription with true when switch is clicked", () => {
		mockSetAuthProfile({
			...mockUserProfile,
			is_subscribed_to_newsletter: false,
		});

		render(<NotificationSettingsCard />);

		const switchControl = screen.getByRole("checkbox", {
			name: /Subscribe to system notices and updates/i,
		});
		fireEvent.click(switchControl);

		expect(
			useAuthStore.getState().toggleNewsletterSubscription,
		).toHaveBeenCalledWith(true);
	});

	it("should call toggleNewsletterSubscription with false when switch is already on and is clicked", () => {
		mockSetAuthProfile({
			...mockUserProfile,
			is_subscribed_to_newsletter: true,
		});

		render(<NotificationSettingsCard />);

		const switchControl = screen.getByRole("checkbox", {
			name: /Subscribe to system notices and updates/i,
		});
		expect(switchControl.hasAttribute("checked")).toBe(true);
		fireEvent.click(switchControl);

		expect(
			useAuthStore.getState().toggleNewsletterSubscription,
		).toHaveBeenCalledWith(false);
	});

	it("should disable the switch when loading", () => {
		mockSetAuthIsLoading(true);
		mockSetAuthProfile({
			...mockUserProfile,
			is_subscribed_to_newsletter: false,
		});
		render(<NotificationSettingsCard />);
		const switchControl = screen.getByRole("checkbox", {
			name: /Subscribe to system notices and updates/i,
		});
		expect(switchControl.hasAttribute("disabled")).toBe(true);
	});

	it("should display an error message when there is an error", () => {
		const errorMessage = "Failed to update settings";
		mockSetAuthError(new Error(errorMessage));
		mockSetAuthProfile({
			...mockUserProfile,
			is_subscribed_to_newsletter: false,
		});
		render(<NotificationSettingsCard />);
		expect(screen.getByTestId("error-message")).toBeDefined();
		expect(
			screen.getByText(new RegExp(`Error updating settings: ${errorMessage}`)),
		).toBeDefined();
	});
});
