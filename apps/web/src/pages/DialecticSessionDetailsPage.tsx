import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  useDialecticStore,
  selectCurrentProjectDetail,
  selectIsLoadingProjectDetail,
  selectProjectDetailError,
  selectModelCatalog,
  selectContributionContentCache,
} from '@paynless/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DialecticContribution, DialecticSession, AIModelCatalogEntry } from '@paynless/types';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

interface ContributionDisplayItemProps {
  contribution: DialecticContribution;
  session: DialecticSession; 
  modelCatalog: AIModelCatalogEntry[];
}

const ContributionDisplayItem: React.FC<ContributionDisplayItemProps> = ({ contribution, session, modelCatalog }) => {
  const fetchContributionContentAction = useDialecticStore(state => state.fetchContributionContent);
  const contributionContentCache = useDialecticStore(selectContributionContentCache);
  const contentData = contributionContentCache[contribution.id];

  useEffect(() => {
    if (contribution.id && (!contentData || (!contentData.content && !contentData.isLoading && !contentData.error))) {
      fetchContributionContentAction(contribution.id);
    }
  }, [fetchContributionContentAction, contribution.id, contentData]);

  const getModelName = (sessionModelId: string): string => {
    const sessionModel = session.dialectic_session_models?.find(sm => sm.id === sessionModelId);
    if (sessionModel && sessionModel.model_id) {
      const model = modelCatalog.find(m => m.id === sessionModel.model_id);
      return model ? `${model.provider_name} ${model.model_name}` : sessionModel.model_id;
    }
    return sessionModelId || 'Unknown Model';
  };
  
  const getTargetModelName = (targetContributionId: string | null): string => {
    if (!targetContributionId) return 'Unknown Target';
    const targetContribution = session.dialectic_contributions?.find(c => c.id === targetContributionId);
    if (targetContribution) {
      return getModelName(targetContribution.session_model_id);
    }
    return 'Unknown Target';
  };

  return (
    <Card key={contribution.id} className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">
          {contribution.stage === 'antithesis' && contribution.parent_contribution_id ? (
            <>
              {getModelName(contribution.session_model_id || '')} critiques {
                getTargetModelName(contribution.parent_contribution_id)}
              {` (Contribution ID: ${contribution.parent_contribution_id.substring(0,8)}... )`}
            </>
          ) : (
            <>{getModelName(contribution.session_model_id || '')} says:</>
          )}
        </CardTitle>
        <CardDescription>
          Type: <Badge variant="outline">{contribution.stage}</Badge> | 
          Created: {new Date(contribution.created_at).toLocaleString()} | 
          Tokens: In {contribution.tokens_used_input || 'N/A'}, Out {contribution.tokens_used_output || 'N/A'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {contentData?.isLoading && <Skeleton className="h-10 w-full" />}
        {contentData?.error && <Alert variant="destructive"><AlertDescription>{contentData.error}</AlertDescription></Alert>}
        {contentData?.content && <MarkdownRenderer content={contentData.content} />}
        {(!contentData || (!contentData.content && !contentData.isLoading && !contentData.error)) && (
            <Button onClick={() => fetchContributionContentAction(contribution.id)} variant="outline" size="sm">
                Load Content
            </Button>
        )}
      </CardContent>
    </Card>
  );
};

export const DialecticSessionDetailsPage: React.FC = () => {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const fetchDialecticProjectDetailsAction = useDialecticStore(state => state.fetchDialecticProjectDetails);

  const project = useDialecticStore(selectCurrentProjectDetail);
  const isLoading = useDialecticStore(selectIsLoadingProjectDetail);
  const error = useDialecticStore(selectProjectDetailError);
  const modelCatalog = useDialecticStore(selectModelCatalog) || [];

  useEffect(() => {
    if (projectId && (!project || project.id !== projectId)) {
      fetchDialecticProjectDetailsAction(projectId);
    }
  }, [fetchDialecticProjectDetailsAction, projectId, project]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error.message || 'Failed to load session details.'}</AlertDescription>
      </Alert>
    );
  }

  if (!project) {
    return (
      <Alert className="m-4">
        <AlertTitle>Project data not available</AlertTitle>
        <AlertDescription>Project details are currently unavailable. If loading persists, please try refreshing.</AlertDescription>
      </Alert>
    );
  }

  const session = project.sessions?.find((s: DialecticSession) => s.id === sessionId);

  if (!session) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Session Not Found</AlertTitle>
        <AlertDescription>
          The session with ID '{sessionId}' was not found in project '{project.project_name}'.
          <Button variant="link" asChild className="ml-2">
            <Link to={`/dialectic/${projectId}`}>Back to Project</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const thesisContributions = session.dialectic_contributions?.filter((c: DialecticContribution) => c.stage === 'thesis') || [];
  const antithesisContributions = session.dialectic_contributions?.filter((c: DialecticContribution) => c.stage === 'antithesis') || [];

  return (
    <div className="container mx-auto p-4" role="main">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl">
            Session: {session.session_description || 'Unnamed Session'}
          </CardTitle>
          <CardDescription>
            Part of Project: <Link to={`/dialectic/${projectId}`} className="text-blue-600 hover:underline">{project.project_name}</Link> | 
            Status: <Badge>{session.status}</Badge> | 
            Iteration: {session.iteration_count}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Initial problem for this project: {project.initial_user_prompt}</p>
          {session.current_stage_seed_prompt && (
            <p className="text-sm text-muted-foreground mt-1">Current stage seed prompt: {session.current_stage_seed_prompt}</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="thesis" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-4">
          <TabsTrigger value="thesis">Thesis ({thesisContributions.length})</TabsTrigger>
          <TabsTrigger value="antithesis">Antithesis ({antithesisContributions.length})</TabsTrigger>
          <TabsTrigger value="synthesis" disabled>Synthesis (0)</TabsTrigger>
          <TabsTrigger value="parenthesis" disabled>Parenthesis (0)</TabsTrigger>
          <TabsTrigger value="paralysis" disabled>Paralysis (0)</TabsTrigger>
        </TabsList>

        <TabsContent value="thesis">
          <Card>
            <CardHeader>
              <CardTitle>Thesis Contributions</CardTitle>
              <CardDescription>Initial responses generated by the AI models based on the session prompt.</CardDescription>
            </CardHeader>
            <CardContent>
              {thesisContributions.length > 0 ? 
                thesisContributions.map((contrib: DialecticContribution) => 
                  <ContributionDisplayItem 
                    key={contrib.id} 
                    contribution={contrib} 
                    session={session} 
                    modelCatalog={modelCatalog} 
                  />
                ) : 
                <p>No thesis contributions found for this session.</p>
              }
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="antithesis">
          <Card>
            <CardHeader>
              <CardTitle>Antithesis Contributions</CardTitle>
              <CardDescription>Critiques generated by AI models on the thesis contributions.</CardDescription>
            </CardHeader>
            <CardContent>
              {antithesisContributions.length > 0 ? 
                antithesisContributions.map((contrib: DialecticContribution) => 
                  <ContributionDisplayItem 
                    key={contrib.id} 
                    contribution={contrib} 
                    session={session} 
                    modelCatalog={modelCatalog} 
                  />
                ) : 
                <p>No antithesis contributions found for this session.</p>
              }
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="synthesis">
            <Card><CardHeader><CardTitle>Synthesis</CardTitle></CardHeader><CardContent><p>Synthesis contributions will appear here.</p></CardContent></Card>
        </TabsContent>
        <TabsContent value="parenthesis">
            <Card><CardHeader><CardTitle>Parenthesis</CardTitle></CardHeader><CardContent><p>Parenthesis contributions will appear here.</p></CardContent></Card>
        </TabsContent>
        <TabsContent value="paralysis">
            <Card><CardHeader><CardTitle>Paralysis</CardTitle></CardHeader><CardContent><p>Paralysis contributions will appear here.</p></CardContent></Card>
        </TabsContent>
      </Tabs>

      <Separator className="my-6" />

      <Card>
        <CardHeader>
          <CardTitle>Session Details & Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><strong>Active Thesis Prompt Template ID:</strong> {session.active_thesis_prompt_template_id || 'Default'}</p>
          <p><strong>Active Antithesis Prompt Template ID:</strong> {session.active_antithesis_prompt_template_id || 'Default'}</p>
          <p><strong>Associated Chat ID:</strong> {session.associated_chat_id || 'N/A'}</p>
          <div className="mt-4 space-x-2">
            <Button 
              onClick={() => alert('Trigger generateThesisContributions or appropriate action based on current status')}
              disabled={session.status === 'generating_thesis' || session.status === 'generating_antithesis'}
            >
              {session.status === 'pending_thesis' ? 'Generate Thesis' : 'Re-generate Current Stage'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => alert('Trigger next stage action')}
              disabled={!session.status?.includes('_complete')}
            >
              Proceed to Next Stage
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}; 