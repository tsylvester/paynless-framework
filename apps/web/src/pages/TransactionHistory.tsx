'use client';

import { TransactionHistoryCard } from '@/components/wallet/TransactionHistoryCard';

export function TransactionHistoryPage() {
  // For the main page, we can default to personal transaction history.
  // The card can be configured with an organizationId prop elsewhere if needed.
  return (
    <div className="container mx-auto px-4 py-8">
      {/* 
        The card itself has a title, but we might want a page-level title too, 
        or let the card handle its own title exclusively.
        For now, the card has its own title prop which defaults to "Transaction History".
      */}
      {/* <h1 className="text-3xl font-bold mb-8 text-textPrimary">Transaction History</h1> */}
      
      <TransactionHistoryCard 
        organizationId={null} // Explicitly personal for this page route
      />
    </div>
  );
} 