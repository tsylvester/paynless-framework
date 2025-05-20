import React, { useEffect } from 'react';
import { useWalletStore } from '@paynless/store'; // Adjust path as needed

export const WalletBalanceDisplay: React.FC = () => {
  const {
    currentWalletBalance,
    isLoadingWallet,
    errorLoadingWallet,
  } = useWalletStore(state => ({
    currentWalletBalance: state.selectCurrentWalletBalance,
    isLoadingWallet: state.isLoadingWallet,
    errorLoadingWallet: state.errorLoadingWallet,
  }));

    useEffect(() => {
        useWalletStore.getState().loadWallet()
    }, [])
  
  if (isLoadingWallet) {
    return <div>Loading wallet balance...</div>;
  }

  if (errorLoadingWallet) {
    return <div>Error: {errorLoadingWallet}</div>;
  }

  const balanceText = currentWalletBalance !== null ? `${currentWalletBalance} AI Tokens` : 'N/A';

  return (
    <div>
      Current Balance: {balanceText}
    </div>
  );
}; 