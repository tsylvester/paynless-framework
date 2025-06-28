import React, { useEffect, useState } from 'react';
import { useDialecticStore } from '@paynless/store';
import { 
    SystemPrompt, 
    DialecticProject, 
} from '@paynless/types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { Skeleton } from '../ui/skeleton';

interface PromptRendererCardProps {
  promptTemplateName: string;
  title?: string;
  targetContributionId?: string; 
}

// Local interface for the parts of the store accessed by selectors in this component
export interface ContributionCacheEntry {
  content?: string | null;
  expiry?: number;
  isLoading?: boolean;
  error?: string | null;
}
export interface PromptRendererCardStoreAccessors {
  currentProjectDetail: DialecticProject | null | undefined;
  allSystemPrompts: SystemPrompt[] | null | undefined;
  fetchContributionContent: (contributionId: string) => void; // Assuming void or Promise<void>
  contributionContentCache: Record<string, ContributionCacheEntry> | undefined;
}

function selectDialecticCurrentProjectDetail(state: PromptRendererCardStoreAccessors) {
  return state.currentProjectDetail;
}

function selectSystemPromptsList(state: PromptRendererCardStoreAccessors) {
  return state.allSystemPrompts;
}

function selectFetchContributionContent(state: PromptRendererCardStoreAccessors) {
  return state.fetchContributionContent;
}

function selectContributionContentCache(state: PromptRendererCardStoreAccessors) {
  return state.contributionContentCache;
}

const renderTemplate = (templateString: string, context: Record<string, string | undefined>): string => {
  let rendered = templateString;
  for (const key in context) {
    if (context[key] !== undefined) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), context[key]!);
    }
  }
  // Ensure replacement string uses double quotes for the inner variable reference
  rendered = rendered.replace(/{{(.*?)}}/g, "[Variable \"$1\" not available in current context]");
  return rendered;
};

export const PromptRendererCard: React.FC<PromptRendererCardProps> = ({
  promptTemplateName,
  title,
  targetContributionId,
}) => {
  const systemPrompts = useDialecticStore(selectSystemPromptsList) as SystemPrompt[] | null | undefined;
  const currentProject = useDialecticStore(selectDialecticCurrentProjectDetail) as DialecticProject | null | undefined;
  const contributionContentCache = useDialecticStore(selectContributionContentCache);
  const fetchContributionContentAction = useDialecticStore(selectFetchContributionContent);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedPrompt, setRenderedPrompt] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setRenderedPrompt(null);

    if (!currentProject) {
      return; 
    }

    if (typeof fetchContributionContentAction !== 'function') {
        setError("Internal error: fetchContributionContent action not available from store.");
        setIsLoading(false);
        return;
    }

    if (!systemPrompts || systemPrompts.length === 0) {
      setError('Prompt templates are not available. Ensure they are loaded.');
      setIsLoading(false);
      return;
    }

    const template = systemPrompts.find((p: SystemPrompt) => p.name === promptTemplateName);
    if (!template) {
      setError(`Prompt template "${promptTemplateName}" not found.`);
      setIsLoading(false);
      return;
    }

    let finalTargetContributionContent: string | undefined | null = undefined;

    if (targetContributionId) {
      const cachedEntry = contributionContentCache?.[targetContributionId];

      if (cachedEntry?.content && (!cachedEntry.expiry || cachedEntry.expiry > Date.now())) {
        finalTargetContributionContent = cachedEntry.content;
      } else if (cachedEntry?.isLoading) {
        return;
      } else if (cachedEntry?.error && (!cachedEntry.expiry || cachedEntry.expiry > Date.now())) {
        // If there was an error but it's stale, we might want to retry.
        // For now, if error exists and is recent, use it.
        // If error is stale, let it fall through to fetch.
        if (cachedEntry.expiry && cachedEntry.expiry > Date.now()) {
            setError(`Failed to load content for contribution ${targetContributionId}: ${cachedEntry.error}`);
            finalTargetContributionContent = null; 
        } else {
            // Stale error, try fetching again
            fetchContributionContentAction(targetContributionId);
            return;
        }
      } else {
        // Not in cache, not loading, no fresh error, or content/expiry missing/stale -> fetch.
        fetchContributionContentAction(targetContributionId);
        return; 
      }
    } else {
      // No targetContributionId, so no content to fetch for it.
      finalTargetContributionContent = undefined; // Explicitly mark as not applicable
    }
    
    const contextData: Record<string, string | undefined> = {};
    const requiredVars = template.variables_required ? Object.keys(template.variables_required) : [];

    const knownContextFetchers: Record<string, () => string | undefined> = {
      'initial_user_prompt': () => currentProject?.initial_user_prompt,
      'user_problem_statement': () => currentProject?.initial_user_prompt,
      'current_date_time': () => new Date().toISOString(),
      'original_content': () => finalTargetContributionContent ?? undefined, 
    };

    for (const varName of requiredVars) {
      if (knownContextFetchers[varName]) {
        contextData[varName] = knownContextFetchers[varName]();
      }
    }
    for (const commonVarKey of Object.keys(knownContextFetchers)) {
      if (!(commonVarKey in contextData)) {
        contextData[commonVarKey] = knownContextFetchers[commonVarKey]();
      }
    }

    setRenderedPrompt(renderTemplate(template.prompt_text, contextData));
    setIsLoading(false);

  }, [
    systemPrompts, 
    currentProject, 
    promptTemplateName, 
    targetContributionId, 
    contributionContentCache, 
    fetchContributionContentAction // Added action to dependencies
  ]);

  const cardTitle = title || `Rendered Prompt: ${promptTemplateName}`;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle><Skeleton className="h-6 w-3/4" /></CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-2" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!renderedPrompt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Could not render prompt. Template may be missing, or context variables are insufficient, or content for a referenced contribution is still loading or failed to load.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownRenderer content={renderedPrompt} />
        {/* 
        {template?.prompt_text && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-500">View Raw Template & Context</summary>
            <div className="mt-2 p-2 border rounded bg-gray-50 dark:bg-gray-800">
              <h4 className="font-semibold text-xs mb-1">Raw Template:</h4>
              <pre className="text-xs whitespace-pre-wrap">{template.prompt_text}</pre>
              <h4 className="font-semibold text-xs mt-2 mb-1">Resolved Context (Example):</h4>
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(currentContextForDebug, null, 2)}</pre> 
            </div>
          </details>
        )}
        */}
      </CardContent>
    </Card>
  );
};

export default PromptRendererCard; 