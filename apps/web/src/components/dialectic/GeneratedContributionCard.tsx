import React, { useState, useEffect, useMemo } from 'react';
import { useDialecticStore, selectContributionById } from '@paynless/store';
import { DialecticContribution, ApiError } from '@paynless/types';
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
  originalModelContributionIdForResponse: string;
  initialResponseText?: string;
  onResponseChange: (originalModelContributionIdForResponse: string, responseText: string) => void;
}

export const GeneratedContributionCard: React.FC<GeneratedContributionCardProps> = ({
  contributionId,
  originalModelContributionIdForResponse,
  initialResponseText = '',
  onResponseChange
}) => {
  const contribution = useDialecticStore(state => selectContributionById(state, contributionId));

  const contentCacheEntry = useDialecticStore(state =>
    contribution?.content_storage_path ? state.contributionContentCache?.[contribution.content_storage_path] : undefined
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
    if (contribution?.content_storage_path && (!contentCacheEntry || (!contentCacheEntry.content && !contentCacheEntry.isLoading && !contentCacheEntry.error))) {
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
        originalContributionIdToEdit: contribution.original_model_contribution_id || contribution.id,
        editedContentText,
      });
      // Type assertion if the store action returns a more specific success object
      if ((result as any)?.success || !(result as any)?.error) { 
        toast.success('Edit Saved', { description: 'Your changes to the contribution have been saved.' });
        setIsEditing(false);
        // Content will refresh from store due to new version becoming latest
      } else {
        const errorPayload = result as unknown as { error: ApiError };
        toast.error("Failed to Save Edit", { description: errorPayload?.error?.message || saveEditError?.message || "An unexpected error occurred." });
      }
    } catch (e: any) {
        console.error("Error saving contribution edit:", e);
        toast.error("Save Error", { description: e.message || "A client-side error occurred while saving." });
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
  const authorDisplay = isUserEdited ? `Edited by user: ${contribution.user_id.substring(0,8)}...` : `Generated by: ${contribution.model_name || 'AI Model'}`;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="text-lg">{contribution.model_name || 'AI Contribution'}</CardTitle>
                <CardDescription className="text-xs">
                    {isUserEdited ? 
                        <Badge variant="outline" className="border-amber-500 text-amber-600">Edited by User</Badge> : 
                        <Badge variant="secondary">AI Generated</Badge>}\
                    <span className="ml-2">V{contribution.edit_version}</span>
                </CardDescription>
            </div>
            {!isEditing && (
                 <Button variant="outline" size="icon_sm" onClick={handleEditToggle} title="Edit this contribution" disabled={isSavingEdit}>\
                    <Edit3 className="h-4 w-4" />
                </Button>
            )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto">
        {isEditing ? (
          <div className="space-y-2">
            <TextInputArea
              value={editedContentText}
              onChange={setEditedContentText}
              placeholder="Enter edited content..."
              minHeight="150px"
              rawTextMode={true} // For direct text editing
              showPreviewToggle={false}
              showFileUpload={false}
            />
            <p className="text-xs text-muted-foreground px-1">
              Recommended for minor corrections or quick fixes. For substantive dialogue, use the response area below.
            </p>
          </div>
        ) : (
          <>
            {isLoadingContent && <div data-testid="content-loading-skeleton"><Skeleton className="h-24 w-full" /></div>}\
            {contentError && <Alert variant="destructive"><AlertDescription>{contentError}</AlertDescription></Alert>}\
            {displayContent && !isLoadingContent && !contentError && (
              <div className="prose dark:prose-invert max-w-none text-sm p-1 border rounded-md max-h-60 overflow-y-auto bg-muted/20">
                <MarkdownRenderer content={displayContent} />
              </div>
            )}\
            {!displayContent && !isLoadingContent && !contentError && <p className="text-sm text-muted-foreground italic p-1">No content available or content is empty.</p>}\
          </>
        )}\
        {saveEditError && isEditing && (
            <Alert variant="destructive" className="mt-2">
                <AlertTitle>Save Error</AlertTitle>
                <AlertDescription>{saveEditError.message || "Could not save your edit."}</AlertDescription>
            </Alert>
        )}\
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 pt-3 border-t">
        {isEditing ? (
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={handleEditToggle} size="sm" disabled={isSavingEdit}>\
              <XCircle className="mr-1.5 h-4 w-4"/> Discard
            </Button>\
            <Button onClick={handleSaveEdit} size="sm" disabled={isSavingEdit || editedContentText === displayContent}>\
              {isSavingEdit ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Save className="mr-1.5 h-4 w-4"/>} \
              {isSavingEdit ? 'Saving...' : 'Save Edit'}
            </Button>\
          </div>
        ) : (
          <div className="w-full space-y-1.5">
            <label htmlFor={`response-${contribution.id}`} className="text-xs font-medium text-muted-foreground pl-1">Your Response / Notes:</label>\
            <TextInputArea
              id={`response-${contribution.id}`}
              value={currentResponseText}
              onChange={handleResponseChangeInternal}
              placeholder={`Respond to ${contribution.model_name || 'this contribution'}...`}
              minHeight="80px"
              showPreviewToggle={true}
              showFileUpload={false} // No file uploads for individual responses here
            />
          </div>
        )}\
      </CardFooter>
    </Card>
  );
}; 