import React, { useEffect, useState, useCallback } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { logger } from '@paynless/utils';

import { 
  useDialecticStore, 
  selectIsCreatingProject,
  selectCreateProjectError,
  selectSelectedDomain,
  selectDomains,
} from '@paynless/store';
import { DomainSelector } from '@/components/dialectic/DomainSelector';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

import { TextInputArea } from '@/components/common/TextInputArea';
import { usePlatform } from '@paynless/platform';
import { platformEventEmitter, type PlatformEvents, type FileDropPayload } from '@paynless/platform';
import type { CreateProjectPayload } from '@paynless/types';

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
  containerClassName?: string;
}

export const CreateDialecticProjectForm: React.FC<CreateDialecticProjectFormProps> = ({
  onProjectCreated,
  defaultProjectName = '',
  defaultInitialPrompt = '',
  enableDomainSelection = true,
  submitButtonText = 'Create Project',
  containerClassName = 'max-w-3xl'
}) => {
  const createDialecticProject = useDialecticStore((state) => state.createDialecticProject);
  const isCreating = useDialecticStore(selectIsCreatingProject);
  const creationError = useDialecticStore(selectCreateProjectError);
  const selectedDomain = useDialecticStore(selectSelectedDomain);
  const domains = useDialecticStore(selectDomains);
  const fetchDomains = useDialecticStore((state) => state.fetchDomains);
  const setSelectedDomain = useDialecticStore((state) => state.setSelectedDomain);
  const currentSelectedDomainOverlayId = useDialecticStore((state) => state.selectedDomainOverlayId);
  const resetCreateProjectError = useDialecticStore((state) => state.resetCreateProjectError);

  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [projectNameManuallySet, setProjectNameManuallySet] = useState<boolean>(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    reset, 
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

  const stripMarkdown = useCallback((text: string): string => {
    return text.replace(/[#*_`[\]()]/g, '').trim();
  }, []);

  const handleFileLoadForPrompt = useCallback((fileContent: string | ArrayBuffer, file: File) => {
    if (typeof fileContent === 'string') {
      setValue('initialUserPrompt', fileContent, { shouldValidate: true, shouldDirty: true });
      setPromptFile(file);

      if (!projectNameManuallySet) {
        let derivedProjectName = '';
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        if (fileExtension === 'md' || file.type === 'text/markdown') {
          const firstLine = fileContent.split('\n')[0];
          const potentialName = stripMarkdown(firstLine);
          if (potentialName) {
            derivedProjectName = potentialName.substring(0, 50);
          }
        } else if (fileExtension === 'json' || file.type === 'application/json') {
          try {
            const jsonData = JSON.parse(fileContent);
            let jsonFieldName = '';
            if (typeof jsonData.title === 'string' && jsonData.title.trim()) {
              jsonFieldName = jsonData.title.trim();
            } else if (typeof jsonData.name === 'string' && jsonData.name.trim()) {
              jsonFieldName = jsonData.name.trim();
            } else if (typeof jsonData.description === 'string' && jsonData.description.trim()) {
              jsonFieldName = jsonData.description.trim();
            }

            if (jsonFieldName) {
              derivedProjectName = stripMarkdown(jsonFieldName).substring(0, 50);
            }
          } catch (e) {
            const errorLogDetails = e instanceof Error 
              ? { message: e.message, name: e.name, stack: e.stack } 
              : { rawError: String(e) };
            logger.error("Error parsing JSON for project name derivation", errorLogDetails);
          }
        }

        if (!derivedProjectName && file.name) {
            const fileNameWithoutExt = file.name.split('.').slice(0, -1).join('.');
            const potentialName = stripMarkdown(fileNameWithoutExt);
            if (potentialName) {
                derivedProjectName = potentialName.substring(0, 50);
            }
        }
        
        if (derivedProjectName) {
          setValue('projectName', derivedProjectName, { shouldValidate: true, shouldDirty: true });
        }
      }
    } else {
      logger.error("File content is not a string, cannot set prompt or derive project name.");
    }
  }, [setValue, projectNameManuallySet, stripMarkdown]);

  useEffect(() => {
    if (projectNameManuallySet) return;
    if (watchedPrompt) {
        const firstLine = watchedPrompt.split('\n')[0];
        const summary = stripMarkdown(firstLine).substring(0, 50);
        if (summary && (summary !== watchedProjectName || !watchedProjectName?.trim())) {
            setValue('projectName', summary, { shouldValidate: true, shouldDirty: true });
        }
    }
  }, [watchedPrompt, watchedProjectName, projectNameManuallySet, setValue, stripMarkdown]); 

  useEffect(() => {
    if (capabilities?.platform === 'web') {
      const preventGlobalDragDrop = (e: DragEvent) => {
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
            logger.warn("Global drop event prevented outside designated dropzone.");
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

  useEffect(() => {
    if (capabilities?.platform === 'tauri' && platformEventEmitter && platformEventEmitter.on) {
      const handler = (eventPayload: unknown) => {
        const payload = eventPayload as Partial<FileDropPayload & { paths?: string[] }>;
        logger.info('Desktop file drop event received', { payload });

        const paths = payload?.paths;

        if (Array.isArray(paths) && paths.length > 0) {
          const filePath = paths[0];
          logger.info('File path from desktop drop', { filePath });
          alert(`File dropped (Desktop): ${filePath}. Auto-load needs platform specific file reading logic here.`);
        } else {
          logger.warn('Desktop file drop event received without valid paths.', { payload });
        }
      };
      const eventName = 'file-drop' as keyof PlatformEvents;
      platformEventEmitter.on(eventName, handler as (payload: unknown) => void);
      return () => {
        platformEventEmitter.off(eventName, handler as (payload: unknown) => void);
      };
    }
  }, [capabilities, handleFileLoadForPrompt]);

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

  useEffect(() => {
    reset({
      projectName: defaultProjectName,
      initialUserPrompt: defaultInitialPrompt,
    });
    setPromptFile(null);
    setProjectNameManuallySet(!!defaultProjectName);
    resetCreateProjectError(); 
  }, [defaultProjectName, defaultInitialPrompt, reset, resetCreateProjectError]);

  useEffect(() => {
    if (!domains || domains.length === 0) {
      fetchDomains();
    }
  }, [domains, fetchDomains]);

  useEffect(() => {
    if ((!selectedDomain) && domains && domains.length > 0) {
        const generalDomain = domains.find(d => d.name === 'General');
        if (generalDomain) {
            setSelectedDomain(generalDomain);
        }
    }
  }, [selectedDomain, domains, setSelectedDomain]);

  const onSubmit = async (data: CreateProjectFormValues) => {
    logger.info('Submitting form with data', data);

    const selectedDomainId = selectedDomain?.id;

    if (!selectedDomainId) {
      logger.error("No domain selected. Cannot create project.");
      // Optionally, set an error state to inform the user
      return;
    }

    const payload: CreateProjectPayload = {
      projectName: data.projectName,
      initialUserPrompt: data.initialUserPrompt,
      promptFile: promptFile,
      selectedDomainId: selectedDomainId,
      selectedDomainOverlayId: currentSelectedDomainOverlayId,
    };

    try {
      const response = await createDialecticProject(payload);

      if (response.data && onProjectCreated) {
        logger.info('Project created successfully', { projectId: response.data.id });
        onProjectCreated(response.data.id, response.data.project_name);
      } else {
        logger.error('Project creation failed', { error: response?.error });
      }
    } catch (e) {
      logger.error('Error submitting form', { error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Card className={containerClassName}> 
      <CardHeader>
        <CardTitle>
          {enableDomainSelection && (
            <div className="flex flex-row items-center gap-2">
              <span>Create</span>
              <DomainSelector /> 
              <span>Project</span>
            </div>
          )} 
        </CardTitle>
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
            <Label htmlFor="project-name">Project Name</Label>
            <Controller
              name="projectName"
              control={control}
              render={({ field }) => (
                <input
                  id="project-name"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="E.g., Q4 Product Strategy (auto-fills from prompt or file name)"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e); 
                    if (e.target.value.trim() !== '') {
                        setProjectNameManuallySet(true);
                    } else {
                        // If user clears the field, allow auto-naming to resume
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
                  id="initial-user-prompt"
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