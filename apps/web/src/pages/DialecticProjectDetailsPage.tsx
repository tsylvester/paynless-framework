import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import {
  selectCurrentProjectDetail,
  selectIsLoadingProjectDetail,
} from '@paynless/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, PlayCircle, Layers } from 'lucide-react';
import { EditableInitialProblemStatement } from '@/components/dialectic/EditableInitialProblemStatement';
import { ProjectSessionsList } from '@/components/dialectic/ProjectSessionsList';
import { StartDialecticSessionModal } from '@/components/dialectic/StartDialecticSessionModal';
import { Skeleton } from '@/components/ui/skeleton';

export const DialecticProjectDetailsPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    fetchDialecticProjectDetails,
    currentProjectDetail,
    isLoadingProjectDetail,
    projectDetailError,
    setStartNewSessionModalOpen,
  } = useDialecticStore((state) => ({
    fetchDialecticProjectDetails: state.fetchDialecticProjectDetails,
    currentProjectDetail: selectCurrentProjectDetail(state),
    isLoadingProjectDetail: selectIsLoadingProjectDetail(state),
    projectDetailError: state.projectDetailError,
    setStartNewSessionModalOpen: state.setStartNewSessionModalOpen,
  }));

  useEffect(() => {
    if (projectId) {
      fetchDialecticProjectDetails(projectId);
    } else {
      console.error("No project ID found in URL");
      navigate('/dialectic');
    }
  }, [projectId, fetchDialecticProjectDetails, navigate]);

  const handleStartNewSession = () => {
    setStartNewSessionModalOpen(true);
  };

  const handleSessionStarted = (sessionId: string) => {
    if (projectId) {
      navigate(`/dialectic/${projectId}/session/${sessionId}`);
    }
  };

  if (isLoadingProjectDetail) {
    return (
      <div className="container mx-auto p-6 space-y-8">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (projectDetailError) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold text-destructive">Error Loading Project</h1>
        <p>{projectDetailError.message || "Could not fetch project details."}</p>
        <Button onClick={() => navigate('/dialectic')} className="mt-4">Go to Projects</Button>
      </div>
    );
  }

  if (!currentProjectDetail) {
    return (
        <div className="container mx-auto p-6 text-center">
            <p>No project data available. It might be loading or the project ID is invalid.</p>
            <Button onClick={() => navigate('/dialectic')} className="mt-4">Go to Projects</Button>
        </div>
    );
  }

  if (projectId !== currentProjectDetail.id) {
    return (
      <div className="container mx-auto p-6 text-center">
        <p>Loading project data...</p> 
        <Skeleton className="h-10 w-1/4 mt-2" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      <Button variant="outline" size="sm" onClick={() => navigate('/dialectic')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
      </Button>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-x-4 gap-y-2 mb-6">
        <div className="flex-grow flex items-center flex-wrap gap-x-3 gap-y-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold flex items-center mr-2 shrink-0">
            <Layers className="mr-2 h-6 w-6 text-primary shrink-0" /> 
            <span className="truncate" title={currentProjectDetail.project_name}>
              {currentProjectDetail.project_name}
            </span>
          </h1>
          <span className="text-sm text-muted-foreground truncate" title={currentProjectDetail.id}>ID: {currentProjectDetail.id}</span>
          {currentProjectDetail.selected_domain_tag && (
            <Badge variant="outline" className="text-sm whitespace-nowrap">
              {currentProjectDetail.selected_domain_tag}
            </Badge>
          )}
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
            <Button onClick={handleStartNewSession} className="w-full sm:w-auto">
                <PlayCircle className="mr-2 h-4 w-4" /> Start New Session
            </Button>
        </div>
      </div>
      
      <EditableInitialProblemStatement />
      
      <ProjectSessionsList onStartNewSession={handleStartNewSession} />

      <StartDialecticSessionModal 
        onSessionStarted={handleSessionStarted} 
      />
    </div>
  );
}; 