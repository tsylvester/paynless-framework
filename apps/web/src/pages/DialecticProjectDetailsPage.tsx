import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import {
  selectCurrentProjectDetail,
  selectIsLoadingProjectDetail,
  selectProjectDetailError,
  selectActiveContextStage,
  selectActiveContextProjectId,
} from '@paynless/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, PlayCircle, Layers } from 'lucide-react';
import { InitialProblemStatement } from '@/components/dialectic/InitialProblemStatement';
import { ProjectSessionsList } from '@/components/dialectic/ProjectSessionsList';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function DialecticProjectDetailsPage() {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const { fetchDialecticProjectDetails, startDialecticSession } = useDialecticStore((state) => ({
    fetchDialecticProjectDetails: state.fetchDialecticProjectDetails,
    startDialecticSession: state.startDialecticSession,
  }));
  
  const project = useDialecticStore(selectCurrentProjectDetail);
  const isLoading = useDialecticStore(selectIsLoadingProjectDetail);
  const error = useDialecticStore(selectProjectDetailError);
  const initialStage = useDialecticStore(selectActiveContextStage);
  const activeContextProjectId = useDialecticStore(selectActiveContextProjectId);

  useEffect(() => {
    if (urlProjectId) {
      const shouldFetch = 
        urlProjectId !== activeContextProjectId || 
        !project || 
        project.id !== urlProjectId;

      if (shouldFetch) {
        fetchDialecticProjectDetails(urlProjectId);
      }
    }
  }, [urlProjectId, activeContextProjectId, project, fetchDialecticProjectDetails]);

  const handleStartNewSession = async () => {
    if (!project?.id) {
      toast.error("Cannot start a session without a loaded project ID.");
      return;
    }
    if (!initialStage) {
      toast.error("Initial stage for the project has not been determined yet. Please wait a moment and try again.");
      return;
    }
    const result = await startDialecticSession({
      projectId: project.id,
      selectedModelCatalogIds: [],
      stageSlug: initialStage.slug,
    });

    const newSession = result.data;
    if (newSession && newSession.id) {
      toast.success(`New session started: ${newSession.id}`);
      navigate(`/dialectic/${project.id}/session/${newSession.id}`);
    } else {
      toast.error(result.error?.message || "Failed to start a new session.");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-8">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error.message || 'An unexpected error occurred while fetching project details.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!project) {
    if (!isLoading && !error && urlProjectId) {
      return (
        <div className="container mx-auto p-4">
          <p>Project not found (ID: {urlProjectId}).</p>
        </div>
      );
    } else if (!isLoading && !error) {
      return (
        <div className="container mx-auto p-4">
          <p>Project not found or no project selected.</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-2 md:space-y-4">

      <div className="flex flex-col sm:flex-row justify-between items-center gap-x-4 gap-y-2 mb-6">
        <div className="flex-grow flex items-center flex-wrap gap-x-3 gap-y-1 min-w-0">
          <div className="flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
            <Button variant="outline" size="sm" onClick={() => navigate('/dialectic')} className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
            </Button>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center mr-2 shrink-0">
            <Layers className="mr-2 h-6 w-6 text-primary shrink-0" /> 
            <span className="truncate" title={project.project_name}>
              {project.project_name}
            </span>
          </h1>
          <span className="text-sm text-muted-foreground truncate" title={project.id}>ID: {project.id}</span>
          {project.dialectic_domains?.name && (
            <Badge variant="outline" className="text-sm whitespace-nowrap">
              {project.dialectic_domains.name}
            </Badge>
          )}
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
            <Button onClick={handleStartNewSession} className="w-full sm:w-auto">
                <PlayCircle className="mr-2 h-4 w-4" /> Start New Session
            </Button>
        </div>
      </div>
      
      <InitialProblemStatement />
      
      <ProjectSessionsList onStartNewSession={handleStartNewSession} />
    </div>
  );
} 