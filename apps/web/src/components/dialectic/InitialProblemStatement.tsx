import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton'; // For loading state
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';

import { useDialecticStore } from '@paynless/store';
import { 
    selectCurrentProjectDetail,
} from '@paynless/store';

export const DisplayInitialProblemStatement: React.FC = () => {
  const {
    currentProjectDetail,
    fetchInitialPromptContent,
    initialPromptContentCache,
  } = useDialecticStore((state) => ({
    currentProjectDetail: selectCurrentProjectDetail(state),
    fetchInitialPromptContent: state.fetchInitialPromptContent,
    initialPromptContentCache: state.initialPromptContentCache,
  }));

  const resourceId = currentProjectDetail?.initial_prompt_resource_id;
  const cacheEntry = resourceId ? initialPromptContentCache[resourceId] : undefined;

  useEffect(() => {
    if (resourceId) {
      fetchInitialPromptContent(resourceId);
    }
  }, [resourceId, fetchInitialPromptContent]);
  
  if (!currentProjectDetail) {
    // Show a skeleton or compact loading state if project details themselves are loading
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Initial Problem Statement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-1/2 mb-2" data-testid="skeleton-loader" />
          <Skeleton className="h-20 w-full" data-testid="skeleton-loader" />
        </CardContent>
      </Card>
    );
  }

  const { initial_user_prompt, initial_prompt_resource_id } = currentProjectDetail;

  let title = "Initial Problem Statement";
  let contentDisplay: React.ReactNode;

  if (initial_prompt_resource_id) {
    if (cacheEntry?.isLoading) {
      contentDisplay = (
        <div className="flex items-center space-x-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading initial prompt file...</span>
        </div>
      );
    } else if (cacheEntry?.error) {
      contentDisplay = (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading File</AlertTitle>
          <AlertDescription>
            {cacheEntry.error.message || "Could not load the initial prompt file."}
          </AlertDescription>
        </Alert>
      );
    } else if (cacheEntry?.content) {
      title = `Initial Problem Statement (from file: ${cacheEntry.fileName || 'unknown'})`;
      contentDisplay = (
        <ScrollArea className="h-40 w-full rounded-md border p-3 text-sm whitespace-pre-wrap bg-muted/40">
          {cacheEntry.content}
        </ScrollArea>
      );
    } else {
      // Should ideally be covered by loading or error state, or if fetch hasn't started
      contentDisplay = <p className="text-sm text-muted-foreground">Prompt file specified, but content is not available.</p>;
    }
  } else if (initial_user_prompt) {
    contentDisplay = (
      <ScrollArea className="h-40 w-full rounded-md border p-3 text-sm whitespace-pre-wrap bg-muted/40">
        {initial_user_prompt}
      </ScrollArea>
    );
  } else {
    contentDisplay = <p className="text-sm text-muted-foreground">No initial problem statement provided for this project.</p>;
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center">
          <FileText className="mr-2 h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {contentDisplay}
      </CardContent>
    </Card>
  );
};

export { DisplayInitialProblemStatement as InitialProblemStatement }; 