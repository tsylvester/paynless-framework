import React, { useState, useEffect, useCallback, useRef } from 'react';
// import { useParams } from 'react-router-dom'; // Removed useParams
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { TextInputArea } from '@/components/common/TextInputArea';
import { useDialecticStore } from '@paynless/store';
import { 
    selectCurrentProjectInitialPrompt, 
    selectCurrentProjectDetail,
    selectCurrentProjectId // Added selector
} from '@paynless/store';
import { Save, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWarnIfUnsavedChanges } from '@/hooks/useWarnIfUnsavedChanges';
import { CardSkeleton } from '../common/CardSkeleton';

const getLocalStorageKey = (projectId: string) => `unsavedPrompt_${projectId}`;

export const EditableInitialProblemStatement: React.FC = () => {
  // const { projectId: projectIdFromParams } = useParams<{ projectId: string }>(); // Removed
  const projectIdFromStore = useDialecticStore(selectCurrentProjectId);
  const projectDetail = useDialecticStore(selectCurrentProjectDetail);
  const initialPromptFromStore = useDialecticStore(selectCurrentProjectInitialPrompt);
  const updateProjectPrompt = useDialecticStore((state) => state.updateDialecticProjectInitialPrompt);

  const [currentPrompt, setCurrentPrompt] = useState(initialPromptFromStore || '');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textInputAreaRef = useRef<HTMLTextAreaElement>(null);

  // Derived actual initial prompt for logic, only when data is loaded and matches the store's current project.
  const actualInitialPrompt = projectDetail?.id === projectIdFromStore ? initialPromptFromStore : undefined;

  useWarnIfUnsavedChanges(isDirty);

  useEffect(() => {
    if (projectIdFromStore && actualInitialPrompt !== undefined) {
      const savedPrompt = localStorage.getItem(getLocalStorageKey(projectIdFromStore));
      if (savedPrompt !== null && savedPrompt !== actualInitialPrompt) {
        setCurrentPrompt(savedPrompt);
        setIsDirty(true);
      } else {
        setCurrentPrompt(actualInitialPrompt);
        setIsDirty(false);
        localStorage.removeItem(getLocalStorageKey(projectIdFromStore));
      }
    } else if (actualInitialPrompt === undefined && projectIdFromStore) {
      // If prompt is not yet loaded from store for the current project ID, clear local state
      setCurrentPrompt('');
      setIsDirty(false);
    } else if (actualInitialPrompt !== undefined && currentPrompt !== actualInitialPrompt && !isDirty) {
      // Fallback to ensure currentPrompt aligns with store if no local storage and not dirty
      setCurrentPrompt(actualInitialPrompt);
    }
  }, [projectIdFromStore, actualInitialPrompt]); // Main effect based on store data

  const handlePromptChange = useCallback((value: string) => {
    if (actualInitialPrompt === undefined || !projectIdFromStore) return;

    setCurrentPrompt(value);
    const currentlyDirty = value !== actualInitialPrompt;
    if (currentlyDirty) {
      localStorage.setItem(getLocalStorageKey(projectIdFromStore), value);
    } else {
      localStorage.removeItem(getLocalStorageKey(projectIdFromStore));
    }
    if (isDirty !== currentlyDirty) {
      setIsDirty(currentlyDirty);
    }
  }, [actualInitialPrompt, projectIdFromStore, isDirty]);

  const handleFileLoadForPrompt = useCallback((fileContent: string | ArrayBuffer, file: File) => {
    if (typeof fileContent === 'string') {
      if (actualInitialPrompt !== undefined) {
        handlePromptChange(fileContent);
        toast.success(`Prompt updated from ${file.name}`);
      } else {
        toast.error('Cannot load from file: Original prompt not yet available.');
      }
    } else {
      toast.error('Failed to load file content as text.');
    }
  }, [handlePromptChange, actualInitialPrompt]);

  const handleCancel = () => {
    if (actualInitialPrompt === undefined || !projectIdFromStore) return;
    setCurrentPrompt(actualInitialPrompt);
    setIsDirty(false);
    localStorage.removeItem(getLocalStorageKey(projectIdFromStore));
    toast.info('Changes to initial prompt have been reverted.');
  };

  const handleSave = async () => {
    if (!projectIdFromStore || actualInitialPrompt === undefined) {
      toast.error('Cannot save: Project data not fully loaded.');
      return;
    }
    if (typeof updateProjectPrompt !== 'function') {
        toast.error('Save Action Not Implemented', { description: 'The store action is not available.'});
        return;
    }
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    try {
      const response = await updateProjectPrompt({ projectId: projectIdFromStore, newInitialPrompt: currentPrompt });
      if (response.error) {
        toast.error('Save Failed', { description: response.error.message || 'Error' });
      } else {
        toast.success('Success', { description: 'Initial problem statement saved.' });
        setIsDirty(false); 
        localStorage.removeItem(getLocalStorageKey(projectIdFromStore));
      }
    } catch (error) {
      let message = 'Could not save the initial problem statement. Please try again.';
      if (error instanceof Error) message = error.message;
      toast.error('Save Failed', { description: message });
    } finally {
      setIsSaving(false);
    }
  };

  if (!projectIdFromStore || projectDetail?.id !== projectIdFromStore || actualInitialPrompt === undefined) {
    return (
      <CardSkeleton
        includeHeader={false}
        numberOfFields={1} 
        fieldHeight="h-20"
        includeFooter={true}
        footerHeight="h-10"
        // The CardSkeleton itself is wrapped in a Card, so the mb-8 from the original outer Card should be handled
        // by ensuring the parent of EditableInitialProblemStatement provides margins, or by wrapping CardSkeleton if needed.
        // For now, we use CardSkeleton directly. The original Card had className="mb-8".
        // CardSkeleton's own Card has "w-full flex flex-col". We might need to adjust this later if layout is an issue.
      />
    );
  }
  
  return (
    <Card className="mb-8">
      <CardContent className="pt-1">
        <TextInputArea
          ref={textInputAreaRef}
          label="Initial Problem Statement"
          value={currentPrompt}
          onChange={handlePromptChange}
          placeholder="Describe the initial problem or topic for dialectic exploration..."
          id={`project-ips-${projectIdFromStore}`}
          showPreviewToggle={true}
          showFileUpload={true}
          onFileLoad={handleFileLoadForPrompt}
        />
      </CardContent>
      {isDirty && (
        <CardFooter className="flex justify-between items-center border-t px-6 py-4">
            <div className="flex items-center text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4 mr-2" />
                You have unsaved changes.
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel
                </Button>
                <Button onClick={handleSave} disabled={!isDirty || isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>
        </CardFooter>
      )}
    </Card>
  );
}; 