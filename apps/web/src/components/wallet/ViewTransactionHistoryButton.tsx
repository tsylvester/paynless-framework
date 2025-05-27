import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const ViewTransactionHistoryButton: React.FC = () => {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/transaction-history">
        Transaction History
      </Link>
    </Button>
  );
}; 