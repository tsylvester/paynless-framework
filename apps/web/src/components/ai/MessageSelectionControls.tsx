import React, { useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAiStore } from "@paynless/store";
import { selectCurrentChatSelectionState } from "@paynless/store";
import { Label } from "@/components/ui/label";

export const MessageSelectionControls: React.FC = () => {
	const { selectAllMessages, deselectAllMessages, currentChatId } = useAiStore(
		(state) => ({
			selectAllMessages: state.selectAllMessages,
			deselectAllMessages: state.deselectAllMessages,
			currentChatId: state.currentChatId,
		}),
	);

	const selectionState = useAiStore(selectCurrentChatSelectionState);
	const checkboxRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (checkboxRef.current) {
			if (selectionState === "some") {
				checkboxRef.current.setAttribute("data-state", "indeterminate");
			} else {
				// For 'all' or 'none' or 'empty', data-state will be 'checked' or 'unchecked' respectively by the component itself
				// We don't need to manually remove 'data-state' as the component handles its primary states.
			}
		}
	}, [selectionState]);

	const handleCheckedChange = () => {
		if (!currentChatId) return;

		if (selectionState === "all") {
			deselectAllMessages(currentChatId);
		} else {
			// 'none' or 'some' or 'empty' (if empty, selectAll will do nothing gracefuly)
			selectAllMessages(currentChatId);
		}
	};

	const isDisabled = selectionState === "empty" || !currentChatId;
	let checkboxCheckedState: boolean | "indeterminate" = false;
	if (selectionState === "all") {
		checkboxCheckedState = true;
	} else if (selectionState === "some") {
		checkboxCheckedState = "indeterminate";
	} // 'none' or 'empty' remains false

	return (
		<div className="flex items-center space-x-2">
			<Checkbox
				id="select-all-messages-checkbox"
				ref={checkboxRef}
				checked={checkboxCheckedState}
				onCheckedChange={handleCheckedChange}
				disabled={isDisabled}
				aria-label={
					selectionState === "all"
						? "Deselect all messages"
						: "Select all messages"
				}
			/>
			<Label
				htmlFor="select-all-messages-checkbox"
				className={`text-sm ${isDisabled ? "text-muted-foreground" : ""}`}
			>
				{selectionState === "all"
					? "All"
					: selectionState === "some"
						? "Some"
						: "None"}
			</Label>
		</div>
	);
};
