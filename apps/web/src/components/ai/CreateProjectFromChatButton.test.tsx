import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import {
  initializeMockDialecticState,
  setDialecticStateValues,
  getDialecticStoreActionMock,
} from '@/mocks/dialecticStore.mock';
import {
  useAiStore,
  selectSelectedChatMessages,
  selectCurrentChatSelectionState,
} from '@paynless/store';
import type { ChatMessage, DialecticDomain, CreateProjectAutoStartResult } from '@paynless/types';

import { CreateProjectFromChatButton } from './CreateProjectFromChatButton.tsx';

const mockNavigate = vi.fn();
const mockFormatChatMessagesAsPrompt = vi.fn();

vi.mock('@paynless/store', async (importOriginal) => {
  const dialecticMock = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...dialecticMock,
    useAiStore: vi.fn(),
    selectSelectedChatMessages: actual.selectSelectedChatMessages,
    selectCurrentChatSelectionState: actual.selectCurrentChatSelectionState,
    selectDomains: actual.selectDomains,
    selectSelectedDomain: actual.selectSelectedDomain,
  };
});

vi.mock('@/utils/formatChatMessagesAsPrompt', () => ({
  formatChatMessagesAsPrompt: (messages: ChatMessage[]) => mockFormatChatMessagesAsPrompt(messages),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

function makeChatMessage(overrides: { id: string; role: string; content: string }): ChatMessage {
  return {
    id: overrides.id,
    chat_id: 'chat-1',
    role: overrides.role,
    content: overrides.content,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    is_active_in_thread: true,
    ai_provider_id: null,
    system_prompt_id: null,
    token_usage: null,
    user_id: null,
    error_type: null,
    response_to_message_id: null,
  };
}

const generalDomain: DialecticDomain = {
  id: 'domain-general',
  name: 'General',
  description: '',
  parent_domain_id: null,
  is_enabled: true,
};

const otherDomain: DialecticDomain = {
  id: 'domain-other',
  name: 'Other',
  description: '',
  parent_domain_id: null,
  is_enabled: true,
};

let mockSelectedMessages: ChatMessage[];
let mockSelectionState: 'all' | 'some' | 'none' | 'empty';

describe('CreateProjectFromChatButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedMessages = [
      makeChatMessage({ id: '1', role: 'user', content: 'First user line\nSecond line' }),
      makeChatMessage({ id: '2', role: 'assistant', content: 'Reply' }),
    ];
    mockSelectionState = 'some';
    mockFormatChatMessagesAsPrompt.mockReturnValue('User: First user line\n\nAssistant: Reply');

    initializeMockDialecticState({
      domains: [generalDomain, otherDomain],
      selectedDomain: null,
      isAutoStarting: false,
      autoStartStep: null,
    });

    vi.mocked(useAiStore).mockImplementation((selector) => {
      if (selector === selectSelectedChatMessages) {
        return mockSelectedMessages;
      }
      if (selector === selectCurrentChatSelectionState) {
        return mockSelectionState;
      }
      return undefined;
    });
  });

  it('renders a button with text "Create Project"', () => {
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
  });

  it('button is disabled when selection state is "none"', () => {
    mockSelectionState = 'none';
    vi.mocked(useAiStore).mockImplementation((selector) => {
      if (selector === selectSelectedChatMessages) return mockSelectedMessages;
      if (selector === selectCurrentChatSelectionState) return mockSelectionState;
      return undefined;
    });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeDisabled();
  });

  it('button is disabled when selection state is "empty"', () => {
    mockSelectionState = 'empty';
    vi.mocked(useAiStore).mockImplementation((selector) => {
      if (selector === selectSelectedChatMessages) return mockSelectedMessages;
      if (selector === selectCurrentChatSelectionState) return mockSelectionState;
      return undefined;
    });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Create Project/i })).toBeDisabled();
  });

  it('button is disabled when isAutoStarting is true', () => {
    setDialecticStateValues({ isAutoStarting: true, autoStartStep: 'Creating project…' });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByTestId('create-project-from-chat-button')).toBeDisabled();
  });

  it('button is enabled when selection state is "all" and not auto-starting', () => {
    mockSelectionState = 'all';
    vi.mocked(useAiStore).mockImplementation((selector) => {
      if (selector === selectSelectedChatMessages) return mockSelectedMessages;
      if (selector === selectCurrentChatSelectionState) return mockSelectionState;
      return undefined;
    });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Create Project/i })).not.toBeDisabled();
  });

  it('button is enabled when selection state is "some" and not auto-starting', () => {
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Create Project/i })).not.toBeDisabled();
  });

  it('on click, calls fetchDomains if domains array is empty', async () => {
    const user = userEvent.setup();
    initializeMockDialecticState({
      domains: [],
      selectedDomain: null,
      isAutoStarting: false,
      autoStartStep: null,
    });
    const fetchDomainsMock = getDialecticStoreActionMock('fetchDomains');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(fetchDomainsMock).toHaveBeenCalled();
    });
  });

  it('on click, uses selectedDomain.id as selectedDomainId when a domain is already selected', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: otherDomain, domains: [generalDomain, otherDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDomainId: 'domain-other',
          idempotencyKey: expect.any(String),
          sessionIdempotencyKey: expect.any(String),
        })
      );
    });
  });

  it('on click, shows error toast when selectedDomain is null (domain comes from selector, no fallback)', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    setDialecticStateValues({ selectedDomain: null, domains: [generalDomain, otherDomain] });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(getDialecticStoreActionMock('createProjectAndAutoStart')).not.toHaveBeenCalled();
  });

  it('on click, shows error toast if no domain can be resolved (empty domains list, no selectedDomain)', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    initializeMockDialecticState({
      domains: [],
      selectedDomain: null,
      isAutoStarting: false,
      autoStartStep: null,
    });
    vi.mocked(getDialecticStoreActionMock('fetchDomains')).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('on click, calls formatChatMessagesAsPrompt with the selected messages', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockFormatChatMessagesAsPrompt).toHaveBeenCalledWith(mockSelectedMessages);
    });
  });

  it('on click, derives projectName from first user message content (first line, truncated to 50 chars)', async () => {
    const user = userEvent.setup();
    const longFirstLine = 'a'.repeat(60);
    mockSelectedMessages = [
      makeChatMessage({ id: '1', role: 'user', content: `${longFirstLine}\nsecond` }),
    ];
    vi.mocked(useAiStore).mockImplementation((selector) => {
      if (selector === selectSelectedChatMessages) return mockSelectedMessages;
      if (selector === selectCurrentChatSelectionState) return mockSelectionState;
      return undefined;
    });
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: longFirstLine.slice(0, 50),
          selectedDomainId: 'domain-general',
          idempotencyKey: expect.any(String),
          sessionIdempotencyKey: expect.any(String),
        })
      );
    });
  });

  it('on click, calls createProjectAndAutoStart with { projectName, initialUserPrompt, selectedDomainId, idempotencyKey, sessionIdempotencyKey }', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: expect.any(String),
          initialUserPrompt: expect.any(String),
          selectedDomainId: 'domain-general',
          idempotencyKey: expect.any(String),
          sessionIdempotencyKey: expect.any(String),
        })
      );
    });
  });

  it('on click, passes distinct idempotencyKey and sessionIdempotencyKey (permanent keys from UI)', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalledTimes(1);
      const payload: { idempotencyKey: string; sessionIdempotencyKey: string } =
        vi.mocked(createProjectAndAutoStartMock).mock.calls[0][0];
      expect(payload.idempotencyKey).toBeTruthy();
      expect(payload.sessionIdempotencyKey).toBeTruthy();
      expect(payload.idempotencyKey).not.toBe(payload.sessionIdempotencyKey);
    });
  });

  it('on success with sessionId !== null and hasDefaultModels true, navigates to /dialectic/${projectId}/session/${sessionId} with state: { autoStartGeneration: true }', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-123',
      sessionId: 'sess-456',
      hasDefaultModels: true,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-123/session/sess-456', {
        state: { autoStartGeneration: true },
      });
    });
  });

  it('on success with sessionId !== null and hasDefaultModels false, navigates to /dialectic/${projectId}/session/${sessionId} without autoStartGeneration state', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-123',
      sessionId: 'sess-456',
      hasDefaultModels: false,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      const navCall = mockNavigate.mock.calls[0];
      expect(navCall[0]).toBe('/dialectic/proj-123/session/sess-456');
      expect(navCall[1]?.state?.autoStartGeneration).not.toBe(true);
    });
  });

  it('on success with sessionId === null, navigates to /dialectic/${projectId}', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-only',
      sessionId: null,
      hasDefaultModels: false,
    };
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dialectic/proj-only');
    });
  });

  it('on error from createProjectAndAutoStart, shows error toast and remains on chat page', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    vi.mocked(getDialecticStoreActionMock('createProjectAndAutoStart')).mockResolvedValue({
      projectId: '',
      sessionId: null,
      hasDefaultModels: false,
      error: { message: 'Server error', code: 'SERVER_ERROR' },
    });

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Server error');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays loading spinner and autoStartStep text while isAutoStarting is true', () => {
    setDialecticStateValues({
      isAutoStarting: true,
      autoStartStep: 'Creating project…',
    });
    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    expect(screen.getByText('Creating project…')).toBeInTheDocument();
  });

  it('does not call createDialecticProject directly (only calls createProjectAndAutoStart)', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedDomain: generalDomain, domains: [generalDomain] });
    const createDialecticProjectMock = getDialecticStoreActionMock('createDialecticProject');
    const createProjectAndAutoStartMock = getDialecticStoreActionMock('createProjectAndAutoStart');
    const result: CreateProjectAutoStartResult = {
      projectId: 'proj-1',
      sessionId: 'sess-1',
      hasDefaultModels: true,
    };
    vi.mocked(createProjectAndAutoStartMock).mockResolvedValue(result);

    render(
      <MemoryRouter>
        <CreateProjectFromChatButton />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Create Project/i }));

    await waitFor(() => {
      expect(createProjectAndAutoStartMock).toHaveBeenCalled();
    });
    expect(createDialecticProjectMock).not.toHaveBeenCalled();
  });
});
