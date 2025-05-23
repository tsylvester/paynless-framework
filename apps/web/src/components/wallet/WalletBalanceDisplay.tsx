import React, { useEffect } from 'react';
import { useWalletStore } from '@paynless/store'; // Adjust path as needed
import { Link } from 'react-router-dom'; // Added for linking to transaction history
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // For a potential top-up button
import { ViewTransactionHistoryButton } from './ViewTransactionHistoryButton'; // Import the new component
import { 
  selectPersonalWalletBalance, 
  selectIsLoadingPersonalWallet, 
  selectPersonalWalletError 
} from '@paynless/store'; // Assuming path to selectors
// Import WalletStore type for explicit typing if needed
import type { WalletStore } from '@paynless/store';

export const WalletBalanceDisplay: React.FC = () => {
  // Use selectors directly with the state from useWalletStore()
  const personalWalletBalance = useWalletStore(selectPersonalWalletBalance);
  const isLoadingPersonalWallet = useWalletStore(selectIsLoadingPersonalWallet);
  const personalWalletError = useWalletStore(selectPersonalWalletError);
  // Explicitly type state parameter if linter complains
  const loadPersonalWallet = useWalletStore((state: WalletStore) => state.loadPersonalWallet);

  useEffect(() => {
    // console.log('[WBDisplay Effect] Calling loadPersonalWallet() ON MOUNT');
    loadPersonalWallet();
  }, [loadPersonalWallet]); // loadPersonalWallet should be stable, but good practice to include if it's from the store
  
  let content;
  if (isLoadingPersonalWallet) {
    content = <p className="text-textSecondary">Loading wallet balance...</p>;
  } else if (personalWalletError && typeof personalWalletError.message === 'string') {
    content = <p className="text-red-500">Error: {personalWalletError.message || 'Could not load balance.'}</p>;
  } else if (personalWalletError) {
    content = <p className="text-red-500">Error: Could not load balance (unknown error structure).</p>;
  } else {
    let formattedBalance = 'N/A';
    if (personalWalletBalance !== 'N/A' && personalWalletBalance !== null) {
      const numericBalance = typeof personalWalletBalance === 'string' 
        ? parseFloat(personalWalletBalance) 
        : parseFloat(String(personalWalletBalance)); // Ensure it's a string before parsing

      if (typeof numericBalance === 'number' && !isNaN(numericBalance)) {
        formattedBalance = `${new Intl.NumberFormat('en-US').format(numericBalance)} Tokens`;
      } else {
        formattedBalance = `${personalWalletBalance} Tokens`; 
      }
    }
    content = <p className="text-2xl font-semibold text-textPrimary">{formattedBalance}</p>;
  }

  // console.log('[WBDisplay Render] isLoadingPersonalWallet:', isLoadingPersonalWallet, 'personalWalletError:', personalWalletError, 'personalWalletBalance for display:', personalWalletBalance);

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-textPrimary">Wallet Overview</CardTitle>
        <CardDescription>
          Your current token balance and transaction history.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {content}
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-2 sm:flex-row sm:justify-between sm:space-y-0">
        <ViewTransactionHistoryButton />
        {/* Optional: Button to navigate to subscription/top-up page */}
        <Button asChild variant="outline" size="sm">
            <Link to="/subscription">Purchase Tokens</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}; 