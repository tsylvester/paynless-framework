import React, { useEffect, useState, useCallback } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useDialecticStore } from '@paynless/store';
import {
  selectIsCreatingProject,
  selectCreateProjectError,
  selectSelectedDomainTag,
} from '@paynless/store';
import type { CreateProjectPayload } from '@paynless/types';
import { DomainSelector } from '@/components/dialectic/DomainSelector';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

import { TextInputArea } from '@/components/common/TextInputArea';
import { usePlatform } from '@paynless/platform';
import type { FileSystemCapabilities } from '@paynless/types';
import { platformEventEmitter } from '@paynless/platform';

// Placeholder type until DialecticProjectResource is available in @paynless/types
interface PlaceholderDialecticProjectResource {
    id: string;
    projectId: string;
    fileName: string;
    storagePath: string;
}

const createProjectFormSchema = z.object({
  projectName: z.string().min(3, 'Project name must be at least 3 characters').max(100),
  initialUserPrompt: z.string().min(10, 'Initial prompt must be at least 10 characters').max(50000, 'Initial prompt cannot exceed 50,000 characters'),
});

type CreateProjectFormValues = z.infer<typeof createProjectFormSchema>;

interface CreateDialecticProjectFormProps {
  onProjectCreated?: (projectId: string, projectName?: string) => void;
  defaultProjectName?: string;
  defaultInitialPrompt?: string;
  enableDomainSelection?: boolean;
  submitButtonText?: string;
  containerClassName?: string; // Optional class for the root Card element
}

export const CreateDialecticProjectForm: React.FC<CreateDialecticProjectFormProps> = ({
  onProjectCreated,
  defaultProjectName = '',
  defaultInitialPrompt = '',
  enableDomainSelection = true,
  submitButtonText = 'Create Project',
  containerClassName = 'max-w-3xl' // Default max-width, can be overridden
}) => {
  const createDialecticProject = useDialecticStore((state) => state.createDialecticProject);
  const isCreating = useDialecticStore(selectIsCreatingProject);
  const creationError = useDialecticStore(selectCreateProjectError);
  const selectedDomainTag = useDialecticStore(selectSelectedDomainTag);
  const resetCreateProjectError = useDialecticStore((state) => state.resetCreateProjectError);
  const uploadProjectResourceFile = useDialecticStore((state) => (state as any).uploadProjectResourceFile); 

  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [projectNameManuallySet, setProjectNameManuallySet] = useState<boolean>(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    reset, 
    watch, 
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectFormSchema),
    defaultValues: {
      projectName: defaultProjectName,
      initialUserPrompt: defaultInitialPrompt,
    },
  });

  const { capabilities } = usePlatform();

  const watchedPrompt = useWatch({
    control,
    name: 'initialUserPrompt',
  });

  const watchedProjectName = useWatch({
    control,
    name: 'projectName',
  });

  const handleFileLoadForPrompt = useCallback((fileContent: string | ArrayBuffer, file: File) => {
    if (typeof fileContent === 'string') {
      setValue('initialUserPrompt', fileContent, { shouldValidate: true, shouldDirty: true });
      setPromptFile(file);
      // Automatically update project name if not manually set
      if (!projectNameManuallySet && file.name) {
        const fileNameWithoutExt = file.name.split('.').slice(0, -1).join('.');
        const summary = fileNameWithoutExt.substring(0, 50);
        if (summary) {
          setValue('projectName', summary, { shouldValidate: true, shouldDirty: true });
        }
      }
    } else {
      console.error("File content is not a string, cannot set prompt.");
    }
  }, [setValue, projectNameManuallySet]);

  // Auto-name project from prompt text if project name is empty and not manually set
  useEffect(() => {
    if (!projectNameManuallySet && watchedPrompt && (!watchedProjectName || watchedProjectName.trim() === '')) {
      const firstLine = watchedPrompt.split('\n')[0].trim();
      const summary = firstLine.substring(0, 50); // Cap at 50 chars
      if (summary) {
        setValue('projectName', summary, { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [watchedPrompt, watchedProjectName, projectNameManuallySet, setValue]);

  // Handle manual project name input to stop auto-naming
  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if (name === 'projectName' && value.projectName !== watchedProjectName) {
        if (value.projectName !== watchedPrompt.split('\n')[0].trim().substring(0,50)) {
            setProjectNameManuallySet(true);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, watchedPrompt, watchedProjectName]);

  // Global drag/drop prevention for the window - WEB PLATFORM ONLY
  useEffect(() => {
    if (capabilities?.platform === 'web') {
      const preventGlobalDragDrop = (e: DragEvent) => {
        // Only prevent if not dropping onto a designated drop zone within TextInputArea
        // This check is basic; a more robust solution might involve checking e.target against TextInputArea's dropzone element.
        // For now, we allow TextInputArea to handle its own drops via onDragOver in its own container.
        // If TextInputArea is not configured for file drops, this global preventer will still catch it.
        let targetElement = e.target as HTMLElement | null;
        let isOverTextInputAreaDropZone = false;
        while (targetElement) {
            // This selector needs to be specific to the dropzone *inside* TextInputArea
            // Assuming TextInputArea's dropzone might have a specific data attribute or class
            if (targetElement.matches('[data-testid$="-dropzone"]')) { 
                isOverTextInputAreaDropZone = true;
                break;
            }
            targetElement = targetElement.parentElement;
        }
        if (!isOverTextInputAreaDropZone) {
            e.preventDefault();
        }
      };
      const handleGlobalDrop = (e: DragEvent) => {
        let targetElement = e.target as HTMLElement | null;
        let isOverTextInputAreaDropZone = false;
        while (targetElement) {
            if (targetElement.matches('[data-testid$="-dropzone"]')) {
                isOverTextInputAreaDropZone = true;
                break;
            }
            targetElement = targetElement.parentElement;
        }
        if (!isOverTextInputAreaDropZone) {
            e.preventDefault();
        }
      };

      window.addEventListener('dragover', preventGlobalDragDrop);
      window.addEventListener('drop', handleGlobalDrop);
      return () => {
        window.removeEventListener('dragover', preventGlobalDragDrop);
        window.removeEventListener('drop', handleGlobalDrop);
      };
    }
  }, [capabilities?.platform]);

  // Tauri-specific file drop handler
  useEffect(() => {
    if (capabilities?.platform === 'tauri' && capabilities.fileSystem.isAvailable) {
      const handleTauriFileDrop = async (paths: string[]) => {
        if (paths && paths.length > 0) {
          const filePath = paths[0];
          try {
            const fs = capabilities.fileSystem as FileSystemCapabilities; 
            const fileContentBuffer = await fs.readFile(filePath);
            const fileName = filePath.split(/[\\/]/).pop() || 'dropped-file'; 
            const tempFile = new File([fileContentBuffer.slice()], fileName); 
            
            const fileContentText = new TextDecoder().decode(fileContentBuffer);
            // Directly call handleFileLoadForPrompt, which is now passed to TextInputArea
            handleFileLoadForPrompt(fileContentText, tempFile);
          } catch (error) {
            console.error('Error reading dropped file on Tauri:', error);
          }
        }
      };
      
      platformEventEmitter.on('file-drop', handleTauriFileDrop);
      return () => {
        platformEventEmitter.off('file-drop', handleTauriFileDrop);
      };
    }
  }, [capabilities, handleFileLoadForPrompt]);

  useEffect(() => {
    reset({
        projectName: defaultProjectName,
        initialUserPrompt: defaultInitialPrompt,
    });
  }, [defaultProjectName, defaultInitialPrompt, reset]);

  useEffect(() => {
    if (creationError) {
      resetCreateProjectError();
    }
    return () => {
      if (creationError) {
        resetCreateProjectError();
      }
    };
  }, [creationError, resetCreateProjectError]);

  const handleActualFileUpload = async (fileToUpload: File, projectId: string): Promise<{ success: boolean; error?: string; resourceReference?: PlaceholderDialecticProjectResource }> => {
    if (!uploadProjectResourceFile) {
      console.error("uploadProjectResourceFile thunk is not available");
      return { success: false, error: "File upload service not configured." };
    }
    const result = await uploadProjectResourceFile({
      projectId,
      file: fileToUpload,
      resourceDescription: 'Initial prompt file for project creation.',
    });
    if (result.data) {
      console.log('File uploaded successfully as project resource:', result.data);
      return { success: true, resourceReference: result.data as PlaceholderDialecticProjectResource };
    } else {
      console.error('Failed to upload file as project resource:', result.error);
      return { success: false, error: result.error?.message || 'Unknown upload error' };
    }
  };

  const onSubmit = async (data: CreateProjectFormValues) => {
    if (creationError) {
      resetCreateProjectError();
    }
    const payload: CreateProjectPayload = {
      ...data,
      selectedDomainTag: enableDomainSelection ? selectedDomainTag : null, 
    };
    
    const projectCreationResult = await createDialecticProject(payload);

    if (projectCreationResult.data) {
      const newProjectId = projectCreationResult.data.id;
      const newProjectName = projectCreationResult.data.project_name;
      if (promptFile) {
        console.log(`Project ${newProjectId} created. Now uploading prompt file ${promptFile.name}...`);
        handleActualFileUpload(promptFile, newProjectId).then(uploadResult => {
          if (uploadResult.success) {
            console.log("Prompt file uploaded as resource successfully.");
          } else {
            console.warn("Prompt file resource upload failed:", uploadResult.error);
          }
        });
      }
      if (onProjectCreated) {
        onProjectCreated(newProjectId, newProjectName);
      }
    } else if (projectCreationResult.error) {
      console.error("Project creation failed:", projectCreationResult.error);
    }
  };

  return (
    <Card className={containerClassName}> 
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <span>Create New</span>
          {enableDomainSelection ? (
            <DomainSelector />
          ) : (
            <span>Dialectic</span>
          )}
          <span>Project</span>
        </CardTitle>
        <CardDescription>
          Define the initial parameters for your new dialectic exploration.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <CardContent className="space-y-6">
          {creationError && (
            <Alert variant="destructive" data-testid="creation-error-alert">
              <AlertTitle>Creation Failed</AlertTitle>
              <AlertDescription>{creationError.message}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="projectName">Project Name</Label>
            <Controller
              name="projectName"
              control={control}
              render={({ field }) => (
                <input
                  id="projectName"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="E.g., Q4 Product Strategy (auto-fills from prompt or file name)"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e); 
                    if (e.target.value.trim() !== '') {
                        setProjectNameManuallySet(true);
                    } else {
                        setProjectNameManuallySet(false);
                    }
                  }}
                  aria-invalid={!!errors.projectName}
                />
              )}
            />
            {errors.projectName && <p className="text-sm text-destructive data-testid='project-name-error'">{errors.projectName.message}</p>}
          </div>

          <div className="space-y-2 relative"> 
            <Controller
              name="initialUserPrompt"
              control={control}
              render={({ field }) => (
                <TextInputArea
                  id="initialUserPrompt"
                  label="Initial User Prompt / Problem Statement"
                  placeholder="Describe the core problem, question, or topic... or load from a .md file."
                  value={field.value}
                  onChange={field.onChange}
                  rows={8} 
                  dataTestId="text-input-area-for-prompt"
                  disabled={isCreating}
                  textAreaClassName="relative z-10 bg-transparent w-full min-h-[168px] resize-y"
                  showPreviewToggle={true}
                  showFileUpload={true}
                  fileUploadConfig={{
                    acceptedFileTypes: ['.md', 'text/markdown'],
                    maxSize: 5 * 1024 * 1024, // 5MB
                    multipleFiles: false,
                  }}
                  onFileLoad={handleFileLoadForPrompt}
                  dropZoneLabel="Drag & drop a .md file here, or click to select for prompt"
                />
              )}
            />
            {errors.initialUserPrompt && <p className="text-sm text-destructive data-testid='prompt-error'" >{errors.initialUserPrompt.message}</p>}
          </div>
          
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isCreating} className="w-full data-testid='create-project-button'">
            {isCreating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating {submitButtonText}...</>
            ) : (
              submitButtonText
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}; 