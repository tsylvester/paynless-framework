import type { WalletStore } from "@paynless/store";
import {
	selectIsLoadingPersonalWallet,
	selectPersonalWalletBalance,
	selectPersonalWalletError,
	useWalletStore,
} from "@paynless/store";
import type React from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ViewTransactionHistoryButton } from "./ViewTransactionHistoryButton";

export const WalletBalanceDisplay: React.FC = () => {
	const personalWalletBalance = useWalletStore(selectPersonalWalletBalance);
	const isLoadingPersonalWallet = useWalletStore(selectIsLoadingPersonalWallet);
	const personalWalletError = useWalletStore(selectPersonalWalletError);
	const loadPersonalWallet = useWalletStore(
		(state: WalletStore) => state.loadPersonalWallet,
	);

	useEffect(() => {
		loadPersonalWallet();
	}, [loadPersonalWallet]);

	let content: React.ReactNode;
	if (isLoadingPersonalWallet) {
		content = <p className="text-textSecondary">Loading wallet balance...</p>;
	} else if (
		personalWalletError &&
		typeof personalWalletError.message === "string"
	) {
		content = (
			<p className="text-red-500">
				Error: {personalWalletError.message || "Could not load balance."}
			</p>
		);
	} else if (personalWalletError) {
		content = (
			<p className="text-red-500">
				Error: Could not load balance (unknown error structure).
			</p>
		);
	} else {
		let formattedBalance = "N/A";
		if (personalWalletBalance !== "N/A" && personalWalletBalance !== null) {
			const numericBalance =
				typeof personalWalletBalance === "string"
					? parseFloat(personalWalletBalance)
					: parseFloat(String(personalWalletBalance));

			if (typeof numericBalance === "number" && !Number.isNaN(numericBalance)) {
				formattedBalance = `${new Intl.NumberFormat("en-US").format(numericBalance)} Tokens`;
			} else {
				formattedBalance = `${personalWalletBalance} Tokens`;
			}
		}
		content = (
			<p className="text-2xl font-semibold text-textPrimary">
				{formattedBalance}
			</p>
		);
	}

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-xl font-bold text-textPrimary">
					Wallet
				</CardTitle>
				<CardDescription>
					Your current token balance and transaction history.
				</CardDescription>
			</CardHeader>
			<CardContent>{content}</CardContent>
			<CardFooter className="flex gap-2">
				<ViewTransactionHistoryButton />
				<Button asChild variant="outline" size="sm">
					<Link to="/subscription">Purchase Tokens</Link>
				</Button>
			</CardFooter>
		</Card>
	);
};
