import React, { useEffect, useState, useCallback } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { logger } from '@paynless/utils';
import { useNavigate } from 'react-router-dom';
import {
  useDialecticStore,
  useWalletStore,
  selectIsCreatingProject,
  selectCreateProjectError,
  selectSelectedDomain,
  selectDomains,
  selectDefaultGenerationModels,
  selectActiveChatWalletInfo,
  selectSortedStages,
  selectSelectedModels,
} from '@paynless/store';
import { DomainSelector } from '@/components/dialectic/DomainSelector';
import { AIModelSelector } from '@/components/dialectic/AIModelSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronDown, Cpu, Loader2 } from 'lucide-react';

import { TextInputArea } from '@/components/common/TextInputArea';
import { usePlatform } from '@paynless/platform';
import { platformEventEmitter, type PlatformEvents, type FileDropPayload } from '@paynless/platform';
import type { CreateProjectPayload, CreateProjectAndAutoStartPayload, SelectedModels } from '@paynless/types';
import { toast } from 'sonner';
import { z } from 'zod';
import { Popover, PopoverContent, PopoverTrigger } from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const projectNamePlaceholder = "A Notepad App with To Do lists";
const initialUserPromptPlaceholder = `I want to create a notepad app with a to-do list, reminders, and event scheduling. It should say hello world, tell me the date, and then list all of my tasks and notes.

I want it to record dates from my to-do list, schedule when it needs to be completed by, and provide reminders when the deadline is approaching.

It should be a web app with user accounts, built in typescript with next.js and shadcn components.`;

const createProjectFormSchema = z.object({
  projectName: z.string().max(100).optional(),
  initialUserPrompt: z.string().max(50000).optional(),
});

type CreateProjectFormValues = z.infer<typeof createProjectFormSchema>;

type SetupMode = 'autostart' | 'autoconfig' | 'manual';

const SETUP_MODE_EXPLAINER =
  'Autostart: Create project, open a session with default models, and start generation automatically.\n\n' +
  'Autoconfig: Create project and open a session with default models; you choose when to start generation.\n\n' +
  'Manual: Create project only; you create the session, pick models, and start when you\'re ready.';

interface CreateDialecticProjectFormProps {
  defaultProjectName?: string;
  defaultInitialPrompt?: string;
  enableDomainSelection?: boolean;
  submitButtonText?: string;
  containerClassName?: string;
}

export const CreateDialecticProjectForm: React.FC<CreateDialecticProjectFormProps> = ({
  defaultProjectName = '',
  defaultInitialPrompt = '',
  enableDomainSelection = true,
  submitButtonText = 'Create Project',
  containerClassName = 'max-w-3xl mx-auto'
}) => {
  const createDialecticProject = useDialecticStore((state) => state.createDialecticProject);
  const createProjectAndAutoStart = useDialecticStore((state) => state.createProjectAndAutoStart);
  const fetchAIModelCatalog = useDialecticStore((state) => state.fetchAIModelCatalog);
  const isCreating = useDialecticStore(selectIsCreatingProject);
  const creationError = useDialecticStore(selectCreateProjectError);
  const selectedDomain = useDialecticStore(selectSelectedDomain);
  const domains = useDialecticStore(selectDomains);
  const defaultModels = useDialecticStore(selectDefaultGenerationModels);
  const autoStartStep = useDialecticStore((state) => state.autoStartStep);
  const isAutoStarting = useDialecticStore((state) => state.isAutoStarting);
  const fetchDomains = useDialecticStore((state) => state.fetchDomains);
  const setSelectedDomain = useDialecticStore((state) => state.setSelectedDomain);
  const currentSelectedDomainOverlayId = useDialecticStore((state) => state.selectedDomainOverlayId);
  const resetCreateProjectError = useDialecticStore((state) => state.resetCreateProjectError);
  const isLoadingModelCatalog = useDialecticStore((state) => state.isLoadingModelCatalog);

  const walletInfo = useWalletStore((state) => selectActiveChatWalletInfo(state, null));
  const sortedStages = useDialecticStore(selectSortedStages);
	const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [projectNameManuallySet, setProjectNameManuallySet] = useState<boolean>(false);
  const [configureManually, setConfigureManually] = useState<boolean>(false);
  const [startGeneration, setStartGeneration] = useState<boolean>(true);
  const [catalogFetchTriggered, setCatalogFetchTriggered] = useState<boolean>(false);
  const navigate = useNavigate();

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

  const selectedModels: SelectedModels[] = useDialecticStore(selectSelectedModels);
  const uniqueModelCount = new Set(selectedModels.map((model) => model.id)).size;

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
      const eventTargetToElement = (target: EventTarget | null): Element | null => {
        if (target instanceof Element) return target;
        if (target instanceof Node) {
          let node: Node | null = target;
          while (node) {
            if (node instanceof Element) return node;
            node = node.parentNode;
          }
        }
        return null;
      };

      const isOverDropzone = (target: EventTarget | null): boolean => {
        let el: Element | null = eventTargetToElement(target);
        while (el) {
          if (el.matches('[data-testid$="-dropzone"]')) return true;
          el = el.parentElement;
        }
        return false;
      };

      const preventGlobalDragDrop = (e: DragEvent) => {
        if (!isOverDropzone(e.target)) {
          e.preventDefault();
        }
      };
      const handleGlobalDrop = (e: DragEvent) => {
        if (!isOverDropzone(e.target)) {
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
    return;
  }, [capabilities?.platform]);

  useEffect(() => {
    if (capabilities?.platform === 'tauri' && platformEventEmitter && platformEventEmitter.on) {
      const handler = (eventPayload: FileDropPayload) => {
        const payload: FileDropPayload = eventPayload;
        logger.info('Desktop file drop event received', { payload });

        if (Array.isArray(payload) && payload.length > 0) {
          const filePath = payload[0];
          logger.info('File path from desktop drop', { filePath });
          alert(`File dropped (Desktop): ${filePath}. Auto-load needs platform specific file reading logic here.`);
        } else {
          logger.warn('Desktop file drop event received without valid paths.', { payload });
        }
      };
      const eventName: keyof PlatformEvents = 'file-drop';
      platformEventEmitter.on(eventName, handler);
      return () => {
        platformEventEmitter.off(eventName, handler);
      };
    }
    return;
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

  useEffect(() => {
    fetchAIModelCatalog();
    setCatalogFetchTriggered(true);
  }, [fetchAIModelCatalog]);

  useEffect(() => {
    if (configureManually) return;
    const noDefaults = !isLoadingModelCatalog && defaultModels.length === 0;
    const firstStageMinBalance = sortedStages[0]?.minimum_balance;
    const lowBalance =
      typeof firstStageMinBalance === 'number' &&
      Number(walletInfo.balance ?? '0') < firstStageMinBalance;
    if (noDefaults || lowBalance) {
      setStartGeneration(false);
    } else {
      setStartGeneration(true);
    }
  }, [configureManually, isLoadingModelCatalog, defaultModels.length, walletInfo.balance, sortedStages]);

  const firstStageMinBalance = sortedStages[0]?.minimum_balance;
  const lowBalanceForReason =
    typeof firstStageMinBalance === 'number' &&
    Number(walletInfo.balance ?? '0') < firstStageMinBalance;
  const autoUncheckReason: string | null =
    !configureManually && !startGeneration
      ? !isLoadingModelCatalog && defaultModels.length === 0
        ? 'No default models available'
        : lowBalanceForReason
          ? 'Wallet balance too low for auto-start'
          : null
      : null;

  const setupMode: SetupMode = configureManually
    ? 'manual'
    : startGeneration
      ? 'autostart'
      : 'autoconfig';

  const cycleSetupMode = useCallback(() => {
    if (setupMode === 'autostart') {
      setStartGeneration(false);
    } else if (setupMode === 'autoconfig') {
      setConfigureManually(true);
    } else {
      setConfigureManually(false);
      setStartGeneration(true);
    }
  }, [setupMode]);

  const setupModeLabel = setupMode === 'autostart' ? 'Autostart' : setupMode === 'autoconfig' ? 'Autoconfig' : 'Manual';

  const setupModeChecked =
    setupMode === 'autostart' ? true : setupMode === 'autoconfig' ? ('indeterminate' as const) : false;

  const onSubmit = async (data: CreateProjectFormValues) => {
    logger.info('Submitting form with data', data);

    const selectedDomainId = selectedDomain?.id;

    if (!selectedDomainId) {
      logger.error("No domain selected. Cannot create project.");
      return;
    }

    const idempotencyKey: string = crypto.randomUUID();
    const payload: CreateProjectPayload = {
      idempotencyKey,
      projectName: data.projectName || projectNamePlaceholder,
      initialUserPrompt: data.initialUserPrompt || initialUserPromptPlaceholder,
      promptFile: promptFile,
      selectedDomainId: selectedDomainId,
      selectedDomainOverlayId: currentSelectedDomainOverlayId,
    };

    if (configureManually) {
      try {
        const response = await createDialecticProject(payload);
        if (response.data) {
          logger.info('Project created successfully, navigating.', { projectId: response.data.id });
          navigate(`/dialectic/${response.data.id}`);
        } else {
          logger.error('Project creation failed', { error: response.error });
        }
      } catch (e) {
        logger.error('Error submitting form', { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    const sessionIdempotencyKey: string = crypto.randomUUID();
    const autoStartPayload: CreateProjectAndAutoStartPayload = { ...payload, sessionIdempotencyKey };
    try {
      const result = await createProjectAndAutoStart(autoStartPayload);
      if (result.error) {
        toast.error(result.error.message ?? 'Auto-start failed');
        return;
      }
      if (result.sessionId !== null) {
        navigate(`/dialectic/${result.projectId}/session/${result.sessionId}`, {
          state: { autoStartGeneration: startGeneration && result.hasDefaultModels },
        });
      } else {
        navigate(`/dialectic/${result.projectId}`);
      }
    } catch (e) {
      logger.error('Error submitting form', { error: e instanceof Error ? e.message : String(e) });
      toast.error(e instanceof Error ? e.message : 'Auto-start failed');
    }
  };

  const catalogReady = catalogFetchTriggered && !isLoadingModelCatalog;

  if (!catalogReady) {
    return (
      <Card className={containerClassName} data-testid="create-dialectic-project-form">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2 text-sm">Loading models…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={containerClassName} data-testid="create-dialectic-project-form">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <CardContent className="space-y-6">
          {creationError && (
            <Alert variant="destructive" data-testid="creation-error-alert">
              <AlertTitle>Creation Failed</AlertTitle>
              <AlertDescription>{creationError.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 relative"> 
          {enableDomainSelection && (
            <div className="flex flex-row items-center gap-2 ">
              <span>Create</span>
              <DomainSelector /> 
              <span>Project</span>
              <Controller
                name="projectName"
                control={control}
                render={({ field }) => (
                  <input
                    id="project-name"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={projectNamePlaceholder}
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
              <span>with</span>
              <Popover open={isModelSelectorOpen} onOpenChange={setIsModelSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 px-3 gap-2",
                      uniqueModelCount === 0 && "ring-2 ring-primary animate-pulse",
                    )}
                  >
                    <Cpu className="h-4 w-4" />
                    <span>
                      {uniqueModelCount > 0
                        ? `${uniqueModelCount} model${uniqueModelCount !== 1 ? "s" : ""}`
                        : "Select models"}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0 bg-popover border shadow-lg" align="start">
                  <div className="p-3 border-b bg-popover">
                    <p className="text-sm font-medium">AI Models</p>
                    <p className="text-xs text-muted-foreground">Select models for generation</p>
                  </div>
                  <div className="p-3 bg-popover overflow-y-auto">
                    <AIModelSelector />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
            {errors.projectName && <p className="text-sm text-destructive data-testid='project-name-error'">{errors.projectName.message}</p>}

            <Controller
              name="initialUserPrompt"
              control={control}
              render={({ field }) => (
                <TextInputArea
                  id="initial-user-prompt"
                  label=""
                  placeholder={initialUserPromptPlaceholder}
                  value={field.value || ''}
                  onChange={field.onChange}
                  rows={8} 
                  dataTestId="text-input-area-for-prompt"
                  disabled={isCreating || isAutoStarting}
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
        <CardFooter className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-2 shrink-0 min-w-[7.5rem]">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center space-x-2" data-testid="create-project-setup-mode">
                  <Checkbox
                    id="create-project-setup-mode-checkbox"
                    checked={setupModeChecked}
                    onCheckedChange={cycleSetupMode}
                    aria-label={setupModeLabel}
                  />
                  <label
                    htmlFor="create-project-setup-mode-checkbox"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {setupModeLabel}
                  </label>
                </div>
              </TooltipTrigger>
              <TooltipContent sideOffset={4} className="w-80 min-w-80 max-w-80 whitespace-pre-line">
                {SETUP_MODE_EXPLAINER}
              </TooltipContent>
            </Tooltip>
            {!configureManually && !startGeneration && autoUncheckReason !== null && (
              <p className="text-sm text-muted-foreground">{autoUncheckReason}</p>
            )}
          </div>
          <Button type="submit" disabled={isCreating || isAutoStarting} className="shrink-0 flex-1 min-w-0 data-testid='create-project-button'">
            {isAutoStarting && autoStartStep ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {autoStartStep}</>
            ) : isCreating ? (
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