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

export const WalletBalanceDisplay: React.FC = () => {
  const {
    currentWalletBalance,
    isLoadingWallet,
    walletError,
    loadWallet,
  } = useWalletStore(state => {
    // Log what the selector receives AND what it's about to return
    console.log('[WBDisplay Selector] state.currentWallet before selection:', state.currentWallet);
    console.log('[WBDisplay Selector] state.currentWallet?.balance before selection:', state.currentWallet?.balance);
    const balanceToReturn = state.selectCurrentWalletBalance();
    console.log('[WBDisplay Selector] Balance selected by selectCurrentWalletBalance():', balanceToReturn);
    return {
      currentWalletBalance: balanceToReturn,
      isLoadingWallet: state.isLoadingWallet,
      walletError: state.walletError,
      loadWallet: state.loadWallet,
    };
  });

  useEffect(() => {
    console.log('[WBDisplay Effect] Calling loadWallet() ON MOUNT');
    loadWallet();
  }, []); // Empty dependency array to run only on mount
  
  let content;
  if (isLoadingWallet) {
    content = <p className="text-textSecondary">Loading wallet balance...</p>;
  } else if (walletError) {
    content = <p className="text-red-500">Error: {walletError.message || 'Could not load balance.'}</p>;
  } else {
    let formattedBalance = 'N/A';
    if (currentWalletBalance !== 'N/A' && currentWalletBalance !== null) {
      const numericBalance = typeof currentWalletBalance === 'string' 
        ? parseFloat(currentWalletBalance) 
        : currentWalletBalance;

      if (typeof numericBalance === 'number' && !isNaN(numericBalance)) {
        formattedBalance = `${new Intl.NumberFormat('en-US').format(numericBalance)} Tokens`;
      } else {
        // Fallback if parsing fails or it's an unexpected type but not 'N/A' or null initially
        formattedBalance = `${currentWalletBalance} Tokens`; 
      }
    }
    content = <p className="text-2xl font-semibold text-textPrimary">{formattedBalance}</p>;
  }

  // Log what the component is about to render with
  console.log('[WBDisplay Render] isLoadingWallet:', isLoadingWallet, 'walletError:', walletError, 'currentWalletBalance for display:', currentWalletBalance);

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