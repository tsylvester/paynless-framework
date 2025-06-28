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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: 'A test template',
  },
];

const mockProject: DialecticProject = {
  id: 'proj1',
  user_id: 'user1',
  project_name: 'Test Project',
  initial_user_prompt: 'Solve world hunger',
  initial_prompt_resource_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'active',
  selected_domain_id: 'dom-1',
  domain_name: 'test_domain',
  selected_domain_overlay_id: null,
  repo_url: 'https://github.com/test/test',
  dialectic_sessions: [
    {
        id: 'sess1',
        project_id: 'proj1',
        status: 'thesis_complete',
        iteration_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_description: 'Test session',
        associated_chat_id: 'chat1',
        user_input_reference_url: null,
        selected_model_ids: [],
        current_stage_id: 'stage-1',
        dialectic_contributions: [
            {
                id: 'contrib1',
                session_id: 'sess1',
                user_id: 'model1',
                stage: 'thesis',
                iteration_number: 1,
                model_id: 'gpt-4',
                model_name: 'GPT-4',
                prompt_template_id_used: '1',
                seed_prompt_url: 'path/to/seed.md',
                target_contribution_id: null,
                error: null,
                tokens_used_input: 100,
                tokens_used_output: 200,
                processing_time_ms: 1000,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                raw_response_storage_path: 'path/raw.json',
                citations: [],
                is_latest_edit: true,
                edit_version: 1,
                original_model_contribution_id: 'contrib1',
            },
        ] as any
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