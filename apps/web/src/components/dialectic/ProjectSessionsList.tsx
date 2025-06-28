import React from 'react';
// import { Link } from 'react-router-dom';
import { useDialecticStore } from '@paynless/store';
import { 
    selectCurrentProjectSessions, 
    selectCurrentProjectDetail,
    selectCurrentProjectId
} from '@paynless/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListChecks, Edit3, PlayCircle } from 'lucide-react';
import type { DialecticSession } from '@paynless/types';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewSessionButton } from './controls/ViewSessionButton';

interface ProjectSessionsListProps {
  onStartNewSession: () => void;
}

export const ProjectSessionsList: React.FC<ProjectSessionsListProps> = ({ onStartNewSession }) => {
  const projectIdFromStore = useDialecticStore(selectCurrentProjectId);
  const projectDetail = useDialecticStore(selectCurrentProjectDetail);
  const sessions = useDialecticStore(selectCurrentProjectSessions);

  const currentProjectId = projectDetail?.id === projectIdFromStore ? projectIdFromStore : undefined;
  const displayableSessions = projectDetail?.id === projectIdFromStore ? sessions : undefined;

  if (!currentProjectId) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <ListChecks className="mr-3 h-7 w-7 text-primary" /> Sessions
        </h2>
        <div className="space-y-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 flex items-center">
        <ListChecks className="mr-3 h-7 w-7 text-primary" /> Sessions
      </h2>
      {displayableSessions && displayableSessions.length > 0 ? (
        <div className="space-y-6">
          {displayableSessions.map((session: DialecticSession) => (
            <Card key={session.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {session.session_description || `Session ${session.id.substring(0, 8)}`}
                    </CardTitle>
                    <CardDescription>
                      Created: {new Date(session.created_at).toLocaleString()} | Status: <Badge variant={session.status?.startsWith('pending') || session.status?.startsWith('generating') ? 'outline' : 'default'}>{session.status}</Badge>
                    </CardDescription>
                  </div>
                  <ViewSessionButton 
                    projectId={currentProjectId} 
                    sessionId={session.id}
                  >
                    View Session
                  </ViewSessionButton>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
          <Edit3 className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-xl font-medium text-muted-foreground">No sessions yet for this project.</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Start a new session to begin the dialectic process.</p>
          <Button onClick={onStartNewSession} variant="outline">
            <PlayCircle className="mr-2 h-4 w-4" /> Start First Session
          </Button>
        </div>
      )}
    </div>
  );
}; 