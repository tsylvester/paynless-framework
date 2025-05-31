import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import {
  selectCurrentProjectDetail,
  selectIsLoadingProjectDetail,
  selectProjectDetailError,
} from '@paynless/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle, ListChecks, Edit3, FileText } from 'lucide-react';
// import { StartDialecticSessionModal } from '@/components/dialectic/StartDialecticSessionModal'; // Will be used later

export const DialecticProjectDetailsPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const fetchProjectDetails = useDialecticStore((state) => state.fetchDialecticProjectDetails);
  const project = useDialecticStore(selectCurrentProjectDetail);
  const isLoading = useDialecticStore(selectIsLoadingProjectDetail);
  const error = useDialecticStore(selectProjectDetailError);
  const resetProjectDetailsError = useDialecticStore((state) => state.resetProjectDetailsError);

  // Local state for modal visibility - will be connected to actual modal later
  const [isStartSessionModalOpen, setIsStartSessionModalOpen] = useState(false);

  useEffect(() => {
    if (projectId) {
        if(error) resetProjectDetailsError(); // Clear previous error before new fetch
        fetchProjectDetails(projectId);
    }
    return () => {
        if(error) resetProjectDetailsError(); // Clear error on unmount if it occurred
    }
  }, [projectId, fetchProjectDetails, resetProjectDetailsError]); // removed error from dep array

  const handleOpenStartSessionModal = () => {
    setIsStartSessionModalOpen(true);
    // When StartDialecticSessionModal is integrated, this will likely manage its open state
    // console.log('Open Start New Session Modal - Placeholder');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-lg">Loading project details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
        <AlertTitle>Error loading project details:</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
        <Button onClick={() => projectId && fetchProjectDetails(projectId)} variant="outline" className="mt-4">
          Try Again
        </Button>
      </Alert>
    );
  }

  if (!project) {
    return (
      <Alert className="max-w-lg mx-auto mt-8">
        <AlertTitle>Project not found</AlertTitle>
        <AlertDescription>
          The requested project could not be found. It might have been deleted or you may not have access.
        </AlertDescription>
        <Button asChild variant="outline" className="mt-4">
            <Link to="/dialectic">Back to Projects List</Link>
        </Button>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <header className="mb-8">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center">
                    <FileText className="mr-3 h-8 w-8 text-primary" /> 
                    {project.projectName}
                </h1>
                <p className="text-muted-foreground mt-1">
                    Project ID: {project.id}
                </p>
            </div>
            <Button onClick={handleOpenStartSessionModal} size="lg">
                <PlayCircle className="mr-2 h-5 w-5" /> Start New Session
            </Button>
        </div>
        {project.selectedDomainTag && (
            <Badge variant="secondary" className="mt-2 text-sm">
                Domain: {project.selectedDomainTag}
            </Badge>
        )}
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl">Initial Problem Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground whitespace-pre-wrap">{project.initialUserPrompt}</p>
        </CardContent>
      </Card>

      <Separator className="my-8" />

      <div>
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <ListChecks className="mr-3 h-7 w-7 text-primary" /> Sessions
        </h2>
        {project.dialecticSessions && project.dialecticSessions.length > 0 ? (
          <div className="space-y-6">
            {project.dialecticSessions.map((session) => (
              <Card key={session.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg hover:text-primary transition-colors">
                            <Link to={`/dialectic/${project.id}/session/${session.id}`}>
                                {session.sessionDescription || `Session ${session.id.substring(0, 8)}`}
                            </Link>
                        </CardTitle>
                        <CardDescription>
                            Created: {new Date(session.createdAt).toLocaleString()} | Status: <Badge variant={session.status.startsWith('pending') || session.status.startsWith('generating') ? 'outline' : 'default'}>{session.status}</Badge>
                        </CardDescription>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                        <Link to={`/dialectic/${project.id}/session/${session.id}`}>View Session</Link>
                    </Button>
                  </div>
                </CardHeader>
                {session.currentStageSeedPrompt && (
                    <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                            <strong>Last Seed Prompt:</strong> {session.currentStageSeedPrompt}
                        </p>
                    </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
            <Edit3 className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-xl font-medium text-muted-foreground">No sessions yet for this project.</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Start a new session to begin the dialectic process.</p>
            <Button onClick={handleOpenStartSessionModal} variant="outline">
                <PlayCircle className="mr-2 h-4 w-4" /> Start First Session
            </Button>
          </div>
        )}
      </div>

      {/* Placeholder for StartDialecticSessionModal */}
      {isStartSessionModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Start New Dialectic Session (Modal)</CardTitle>
                    <CardDescription>Modal content will go here.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>Configure your new session.</p>
                </CardContent>
                <CardFooter>
                    <Button variant="outline" onClick={() => setIsStartSessionModalOpen(false)} className="mr-2">Cancel</Button>
                    <Button onClick={() => { alert('Starting session...'); setIsStartSessionModalOpen(false); }}>Start Session</Button>
                </CardFooter>
            </Card>
        </div>
      )}

    </div>
  );
}; 