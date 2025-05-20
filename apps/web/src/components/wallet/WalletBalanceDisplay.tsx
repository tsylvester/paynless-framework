import React, { useEffect } from 'react';
import { useWalletStore } from '@paynless/store'; // Adjust path as needed
import { Link } from 'react-router-dom'; // Added for linking to transaction history

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
    // The logic for currentWalletBalance being null to show 'N/A' or value for '0' is now handled by the selector
    // However, the display text formatting should remain.
    const balanceText = currentWalletBalance === 'N/A' || currentWalletBalance === null 
                          ? 'N/A' 
                          : `${currentWalletBalance} AI Tokens`;
    content = <p className="text-2xl font-semibold text-textPrimary">{balanceText}</p>;
  }

  // Log what the component is about to render with
  console.log('[WBDisplay Render] isLoadingWallet:', isLoadingWallet, 'walletError:', walletError, 'currentWalletBalance for display:', currentWalletBalance);

  return (
    <div className="bg-backgroundOffset shadow-lg rounded-lg p-6 my-4 w-full max-w-md">
      <h2 className="text-xl font-semibold text-textPrimary mb-4">Wallet Overview</h2>
      {content}
      <div className="mt-4">
        <Link 
          to="/transaction-history"
          className="text-sm text-primary hover:underline"
        >
          View Transaction History
        </Link>
      </div>
      {/* Placeholder for a top-up link/button if desired */}
      {/* <div className="mt-2">
        <Link 
          to="/subscription" // Or a dedicated top-up page
          className="text-sm text-primary hover:underline"
        >
          Purchase More Tokens
        </Link>
      </div> */}
    </div>
  );
}; 