import { render, screen, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { useDialecticStore } from '@paynless/store';
import { 
    PromptRendererCard, 
    type PromptRendererCardStoreAccessors,
    type ContributionCacheEntry
} from './PromptRendererCard';
import { SystemPrompt, DialecticProject, DialecticContribution } from '@paynless/types';

// Mock the useDialecticStore hook
vi.mock('@paynless/store', () => ({
  useDialecticStore: vi.fn(),
}));

// Mock MarkdownRenderer
vi.mock('../common/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown-renderer">{content}</div>,
}));

const mockSystemPrompts: SystemPrompt[] = [
  {
    id: '1',
    name: 'test_template_v1',
    prompt_text: 'Hello {{name}}, your project is {{initial_user_prompt}}. The original thesis was: {{original_content}}. Missing: {{missing_var}}',
    is_active: true,
    version: 1,
    variables_required: { name: 'string', initial_user_prompt: 'string', original_content: 'string', missing_var: 'string' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stage_association: 'thesis',
    description: 'A test template',
    is_stage_default: true,
    context: 'testing'
  },
];

const mockProject: DialecticProject = {
  id: 'proj1',
  user_id: 'user1',
  project_name: 'Test Project',
  initial_user_prompt: 'Solve world hunger',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'active',
  selected_domain_tag: 'test_domain',
  repo_url: 'https://github.com/test/test',
  sessions: [
    {
        id: 'sess1',
        project_id: 'proj1',
        status: 'thesis_complete',
        iteration_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_description: 'Test session',
        current_stage_seed_prompt: 'Test prompt',
        associated_chat_id: 'chat1',
        active_thesis_prompt_template_id: 'template1',
        active_antithesis_prompt_template_id: 'template2',
        active_synthesis_prompt_template_id: 'template3',
        active_parenthesis_prompt_template_id: 'template4',
        active_paralysis_prompt_template_id: 'template5',
        max_iterations: 10,
        dialectic_contributions: [
            {
                id: 'contrib1',
                session_id: 'sess1',
                user_id: 'model1',
                contribution_type: 'thesis',
                content: 'My great thesis content',
                model_id: 'gpt-4',
                tokens_used_input: 100,
                tokens_used_output: 200,
                processing_time_ms: 1000,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                content_storage_bucket: 'bucket',
                content_storage_path: 'path/thesis.md',
                content_mime_type: 'text/markdown',
                raw_response_storage_path: 'path/raw.json',
                session_model_id: 'gpt-4',
                stage: 'thesis',
                iteration_number: 1,
                actual_prompt_sent: 'original_prompt',
                content_size_bytes: 1000,
                citations: [],
                parent_contribution_id: null,
            } as DialecticContribution,
        ]
    }
  ]
};

// Define a type for the return value of an individual selector function
type SelectorReturnValue = 
  | PromptRendererCardStoreAccessors['currentProjectDetail']
  | PromptRendererCardStoreAccessors['allSystemPrompts']
  | PromptRendererCardStoreAccessors['fetchContributionContent'] // This will be Mock<[string], void> in practice for tests
  | PromptRendererCardStoreAccessors['contributionContentCache'];

type SelectorFunction = (state: PromptRendererCardStoreAccessors) => SelectorReturnValue;
interface NamedSelectorFunction extends SelectorFunction {
    name?: string;
}

// Define a union type for possible return values of the mocked store selectors
// This is what the mockImplementation of the entire useDialecticStore hook returns
type MockHookReturnValue = 
  | SystemPrompt[] 
  | DialecticProject 
  | Mock<[string], void> // fetchContributionContent is mocked as this
  | Record<string, ContributionCacheEntry> 
  | null 
  | undefined;

describe('PromptRendererCard', () => {
  let mockFetchContributionContentAction: Mock<[string], void>;

  beforeEach(() => {
    mockFetchContributionContentAction = vi.fn();
    (useDialecticStore as unknown as Mock<[NamedSelectorFunction], MockHookReturnValue>)
      .mockImplementation((selector) => {
        if (selector.name === 'selectSystemPromptsList') {
          return mockSystemPrompts;
        }
        if (selector.name === 'selectDialecticCurrentProjectDetail') {
          return mockProject;
        }
        if (selector.name === 'selectFetchContributionContent') {
          return mockFetchContributionContentAction;
        }
        if (selector.name === 'selectContributionContentCache') {
          return {
            contrib1: { 
              content: 'My great thesis content', 
              isLoading: false, 
              error: null, 
              expiry: Date.now() + 3600 * 1000 
            } 
          } as Record<string, ContributionCacheEntry>; 
        }
        return undefined;
    });
  });

  it('should render the prompt with context variables filled', async () => {
    render(<PromptRendererCard promptTemplateName="test_template_v1" title="Test Prompt" targetContributionId="contrib1" />);

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toHaveTextContent(
        'Hello [Variable "name" not available in current context], your project is Solve world hunger. The original thesis was: My great thesis content. Missing: [Variable "missing_var" not available in current context]'
      );
    });
    expect(screen.getByText('Test Prompt')).toBeInTheDocument();
  });

  it('should show an error if the prompt template is not found', async () => {
    render(<PromptRendererCard promptTemplateName="non_existent_template" />);
    await waitFor(() => {
        expect(screen.getByText('Prompt template "non_existent_template" not found.')).toBeInTheDocument();
    })
  });

  it('should show a loading state initially when data is not yet available', () => {
    (useDialecticStore as unknown as Mock<[NamedSelectorFunction], MockHookReturnValue>)
      .mockImplementation((selector) => {
        if (selector.name === 'selectSystemPromptsList') {
            return null; 
        }
        if (selector.name === 'selectDialecticCurrentProjectDetail') {
            return null; 
        }
        if (selector.name === 'selectFetchContributionContent') {
            return vi.fn() as Mock<[string], void>; 
        }
        if (selector.name === 'selectContributionContentCache') {
            return {} as Record<string, ContributionCacheEntry>; 
        }
        return undefined;
    });
    render(<PromptRendererCard promptTemplateName="test_template_v1" />);
    const cardTitle = screen.getByText((content, element) => {
      return element instanceof HTMLElement && element.dataset['slot'] === 'card-title';
    });
    expect(cardTitle.querySelector('[data-slot="skeleton"].h-6.w-3\\/4')).toBeInTheDocument();
  });
  
  it('renders correctly when targetContributionId is not provided', async () => {
    render(<PromptRendererCard promptTemplateName="test_template_v1" title="No Target Contribution" />); 
    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toHaveTextContent(
        'Hello [Variable "name" not available in current context], your project is Solve world hunger. The original thesis was: [Variable "original_content" not available in current context]. Missing: [Variable "missing_var" not available in current context]'
      );
    });
    expect(screen.getByText('No Target Contribution')).toBeInTheDocument();
  });
}); 