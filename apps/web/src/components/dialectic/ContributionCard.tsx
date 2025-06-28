import React, { useEffect } from 'react';
import { useDialecticStore } from '@paynless/store';
import { DialecticStateValues, DialecticStore } from '@paynless/types';
import { selectContributionContentCache } from '@paynless/store';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

// It might be useful to pass the whole contribution object later for more details
// For now, focusing on content retrieval as per 1.1.5.C.4
export interface ContributionCardProps {
  contributionId: string;
  className?: string;
  // Potentially add title or other metadata here if not fetching full contribution object
  title?: string; 
}

export const ContributionCard: React.FC<ContributionCardProps> = ({
  contributionId,
  className,
  title = "Contribution" 
}) => {
  const fetchContributionContent = useDialecticStore(
    (s: DialecticStore) => s.fetchContributionContent
  );
  const cacheEntry = useDialecticStore((state: DialecticStateValues) => {
    const cache = selectContributionContentCache(state);
    return cache[contributionId];
  });

  useEffect(() => {
    if (contributionId) {
      // The thunk itself checks cache, so calling it is fine.
      // It won't refetch if content is fresh.
      fetchContributionContent(contributionId);
    }
  }, [contributionId, fetchContributionContent]);

  const renderContent = () => {
    if (cacheEntry?.isLoading) {
      return (
        <>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6" />
        </>
      );
    }

    if (cacheEntry?.error) {
      return (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Could not load contribution content: {cacheEntry.error}
          </AlertDescription>
        </Alert>
      );
    }

    if (cacheEntry?.content) {
      if (cacheEntry.mimeType === 'text/markdown') {
        return <MarkdownRenderer content={cacheEntry.content} />;
      }
      // Fallback for plain text or other types
      return <pre className="whitespace-pre-wrap text-sm">{cacheEntry.content}</pre>;
    }

    // If no cache entry yet, or not loading and no content (e.g., initial state before useEffect runs)
    // Show skeleton as well, as it should quickly transition to loading or content.
    return (
        <>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6" />
        </>
      );
  };

  return (
    <Card className={className}>
      <CardHeader>
        {/* In the future, this title could come from contribution metadata */}
        <CardTitle>{title}</CardTitle>
        {/* Other metadata like model name, timestamp, stage could go here */}
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
}; 