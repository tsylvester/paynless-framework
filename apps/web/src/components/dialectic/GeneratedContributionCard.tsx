import React, { useState, useEffect } from 'react';
import { useDialecticStore, selectContributionById } from '@paynless/store';
import { ApiError } from '@paynless/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { TextInputArea } from '@/components/common/TextInputArea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit3, XCircle, Save } from 'lucide-react';
import { toast } from 'sonner';

interface GeneratedContributionCardProps {
  contributionId: string;
  projectId: string;
  originalModelContributionIdForResponse: string;
  initialResponseText?: string;
  onResponseChange: (originalModelContributionIdForResponse: string, responseText: string) => void;
}

export const GeneratedContributionCard: React.FC<GeneratedContributionCardProps> = ({
  contributionId,
  projectId,
  originalModelContributionIdForResponse,
  initialResponseText = '',
  onResponseChange
}) => {
  const contribution = useDialecticStore(state => selectContributionById(state, contributionId));

  const contentCacheEntry = useDialecticStore(state =>
    contribution?.id ? state.contributionContentCache?.[contribution.id] : undefined
  );
  const fetchContributionContent = useDialecticStore(state => state.fetchContributionContent);
  const saveContributionEdit = useDialecticStore(state => state.saveContributionEdit);
  const isSavingEdit = useDialecticStore(state => state.isSavingContributionEdit);
  const saveEditError = useDialecticStore(state => state.saveContributionEditError as ApiError | null);
  const resetSaveEditError = useDialecticStore(state => state.resetSaveContributionEditError); // Assuming this action exists

  const [isEditing, setIsEditing] = useState(false);
  const [editedContentText, setEditedContentText] = useState('');
  const [currentResponseText, setCurrentResponseText] = useState(initialResponseText);

  const displayContent = contentCacheEntry?.content || '';
  const isLoadingContent = contentCacheEntry?.isLoading || false;
  const contentError = contentCacheEntry?.error || null;

  useEffect(() => {
    setCurrentResponseText(initialResponseText);
  }, [initialResponseText]);

  useEffect(() => {
    if (contribution?.id && (!contentCacheEntry || (!contentCacheEntry.content && !contentCacheEntry.isLoading && !contentCacheEntry.error))) {
      fetchContributionContent(contribution.id); // Pass contribution ID to thunk
    }
  }, [contribution, contentCacheEntry, fetchContributionContent]);

  useEffect(() => {
    if (isEditing) {
      setEditedContentText(displayContent);
    }
  }, [isEditing, displayContent]);

  // Clear save error when edit mode is toggled or component unmounts
  useEffect(() => {
    return () => {
      if(saveEditError && resetSaveEditError) resetSaveEditError();
    };
  }, [saveEditError, resetSaveEditError]);

  const handleEditToggle = () => {
    if(isSavingEdit) return;
    setIsEditing(!isEditing);
    if (!isEditing) {
      setEditedContentText(displayContent);
    }
    if(saveEditError && resetSaveEditError) resetSaveEditError(); // Clear error on toggle
  };

  const handleSaveEdit = async () => {
    if (!contribution || isSavingEdit) return;
    if(saveEditError && resetSaveEditError) resetSaveEditError();

    try {
        const result = await saveContributionEdit({
            projectId: projectId,
            sessionId: contribution.session_id,
            originalModelContributionId: contribution.original_model_contribution_id || contribution.id,
            responseText: editedContentText,
            originalContributionIdToEdit: contribution.id,
            editedContentText,
      });
      // Type assertion if the store action returns a more specific success object
      if (result?.data || !result?.error) { 
        toast.success('Edit Saved', { description: 'Your changes to the contribution have been saved.' });
        setIsEditing(false);
        // Content will refresh from store due to new version becoming latest
      } else {
        const errorPayload = result as unknown as { error: ApiError };
        toast.error("Failed to Save Edit", { description: errorPayload?.error?.message || saveEditError?.message || "An unexpected error occurred." });
      }
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "A client-side error occurred while saving.";
        toast.error("Save Error", { description: errorMessage });
    }
  };

  const handleResponseChangeInternal = (text: string) => {
    setCurrentResponseText(text);
    onResponseChange(originalModelContributionIdForResponse, text);
  };

  if (!contribution) {
    return <Card className="animate-pulse"><CardHeader><Skeleton className="h-5 w-3/4"/></CardHeader><CardContent><Skeleton className="h-20 w-full"/></CardContent></Card>;
  }

  const isUserEdited = contribution.edit_version > 1 && contribution.user_id;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="text-lg">{contribution.model_name || 'AI Contribution'}</CardTitle>
                <CardDescription className="text-xs">
                    {isUserEdited ? 
                        <Badge variant="outline" className="border-amber-500 text-amber-600">Edited by User</Badge> : 
                        <Badge variant="secondary">AI Generated</Badge>}
                    <span className="ml-2">V{contribution.edit_version}</span>
                </CardDescription>
            </div>
            {!isEditing && (
                 <Button variant="outline" size="icon" onClick={handleEditToggle} title="Edit this contribution" disabled={isSavingEdit}>
                    <Edit3 className="h-4 w-4" />
                </Button>
            )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto">
        {isEditing ? (
          <div className="space-y-2">
            <TextInputArea
              label="Enter edited content..."
              value={editedContentText}
              onChange={setEditedContentText}
              placeholder="Enter edited content..."
              showPreviewToggle={false}
              showFileUpload={false}
            />
            <p className="text-xs text-muted-foreground px-1">
              Recommended for significant corrections. For substantive dialogue, use the response area below.
            </p>
          </div>
        ) : (
          <>
            {isLoadingContent && <div data-testid="content-loading-skeleton"><Skeleton className="h-24 w-full" /></div>}
            {contentError && <Alert variant="destructive"><AlertDescription>{contentError.message}</AlertDescription></Alert>}
            {displayContent && !isLoadingContent && !contentError && (
              <div className="prose dark:prose-invert max-w-none text-sm p-1 border rounded-md max-h-60 overflow-y-auto bg-muted/20">
                <MarkdownRenderer content={displayContent} />
              </div>
            )}
            {!displayContent && !isLoadingContent && !contentError && <p className="text-sm text-muted-foreground italic p-1">No content available or content is empty.</p>}
          </>
        )}
        {saveEditError && isEditing && (
            <Alert variant="destructive" className="mt-2">
                <AlertTitle>Save Error</AlertTitle>
                <AlertDescription>{saveEditError.message || "Could not save your edit."}</AlertDescription>
            </Alert>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 pt-3 border-t">
        {isEditing ? (
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={handleEditToggle} size="sm" disabled={isSavingEdit}>
              <XCircle className="mr-1.5 h-4 w-4"/> Discard
            </Button>
            <Button onClick={handleSaveEdit} size="sm" disabled={isSavingEdit || editedContentText === displayContent}>
              {isSavingEdit ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Save className="mr-1.5 h-4 w-4"/>} 
              {isSavingEdit ? 'Saving...' : 'Save Edit'}
            </Button>
          </div>
        ) : (
          <div className="w-full space-y-1.5">
            <TextInputArea
              id={`response-${contribution.id}`}
              value={currentResponseText}
              onChange={handleResponseChangeInternal}
              placeholder={`Respond to ${contribution.model_name || 'this contribution'}...`}
              showPreviewToggle={true}
              showFileUpload={false} // No file uploads for individual responses here
              label="Enter your response, notes, criticism, requests, or other feedback. Anything you add will be used by the model for the next stage."
            />
          </div>
        )}
      </CardFooter>
    </Card>
  );
}; 