import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  ApiResponse,
  DocumentDisplayMetadata,
  RegenerateDocumentPayload,
  RegenerateDocumentResponse,
} from '@paynless/types';

import { getDialecticStoreActions } from '../../mocks/dialecticStore.mock';

import { RegenerateDocumentButton, PerModelLabel, RegenerateDocumentButtonProps } from './RegenerateDocumentButton.tsx';

vi.mock('@paynless/store', () => import('../../mocks/dialecticStore.mock'));

const sessionId = 'session-1';
const stageSlug = 'synthesis';
const iterationNumber = 1;
const documentKey = 'business_case';

const perModelLabelSingle: PerModelLabel = {
  modelId: 'model-a',
  displayName: 'Model A',
  statusLabel: 'Completed',
};

const perModelLabelsMulti: PerModelLabel[] = [
  { modelId: 'model-a', displayName: 'Model A', statusLabel: 'Completed' },
  { modelId: 'model-b', displayName: 'Model B', statusLabel: 'Failed' },
  { modelId: 'model-c', displayName: 'Model C', statusLabel: 'Not started' },
];

function buildDocumentDisplayMetadata(): Map<string, DocumentDisplayMetadata> {
  const map = new Map<string, DocumentDisplayMetadata>();
  map.set(documentKey, { displayName: 'Business Case', description: 'Summary document' });
  return map;
}

function defaultProps(overrides?: Partial<RegenerateDocumentButtonProps>): RegenerateDocumentButtonProps {
  return {
    activeSessionId: sessionId,
    iterationNumber,
    documentKey,
    stageSlug,
    perModelLabels: [perModelLabelSingle],
    isDocumentOnCurrentStage: true,
    hasStageProgress: true,
    documentDisplayMetadata: buildDocumentDisplayMetadata(),
    entryStatus: 'completed',
    ...overrides,
  };
}

describe('RegenerateDocumentButton', () => {
  beforeEach(() => {
    const actions = getDialecticStoreActions();
    vi.mocked(actions.regenerateDocument).mockReset();
    vi.mocked(actions.regenerateDocument).mockResolvedValue({
      data: { jobIds: ['job-1'] },
      error: undefined,
      status: 200,
    });
  });

  it('renders inline RefreshCcw icon button when isDocumentOnCurrentStage is true', () => {
    render(<RegenerateDocumentButton {...defaultProps({ isDocumentOnCurrentStage: true })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    expect(button).toBeInTheDocument();
  });

  it('does not render inline icon button when isDocumentOnCurrentStage is false (renders passive status dot instead)', () => {
    render(<RegenerateDocumentButton {...defaultProps({ isDocumentOnCurrentStage: false })} />);
    expect(screen.queryByRole('button', { name: /regenerate document/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="document-completed-icon"]')).toBeInTheDocument();
  });

  it('does not render inline icon button when hasStageProgress is false (renders passive status dot instead)', () => {
    render(<RegenerateDocumentButton {...defaultProps({ hasStageProgress: false })} />);
    expect(screen.queryByRole('button', { name: /regenerate document/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="document-completed-icon"]')).toBeInTheDocument();
  });

  it('single-model click calls regenerateDocument with correct RegenerateDocumentPayload including idempotencyKey', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: [perModelLabelSingle] })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    await waitFor(() => {
      const actions = getDialecticStoreActions();
      expect(actions.regenerateDocument).toHaveBeenCalledTimes(1);
    });

    const actions = getDialecticStoreActions();
    const payload: RegenerateDocumentPayload = vi.mocked(actions.regenerateDocument).mock.calls[0][0];
    expect(payload).toMatchObject({
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey, modelId: perModelLabelSingle.modelId }],
    });
    expect(typeof payload.idempotencyKey).toBe('string');
    expect(payload.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('single-model click does NOT call regenerateDocument when isSubmitting is true (request already in flight)', async () => {
    const resolvePromise: { resolve: () => void } = { resolve: () => {} };
    const response: ApiResponse<RegenerateDocumentResponse> = {
      data: { jobIds: [] },
      error: undefined,
      status: 200,
    };
    const slowPromise: Promise<ApiResponse<RegenerateDocumentResponse>> = new Promise((resolve) => {
      resolvePromise.resolve = () => resolve(response);
    });
    const actions = getDialecticStoreActions();
    vi.mocked(actions.regenerateDocument).mockReturnValue(slowPromise);

    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: [perModelLabelSingle] })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    await waitFor(() => {
      expect(actions.regenerateDocument).toHaveBeenCalledTimes(1);
    });

    await user.click(button);
    const actionsAfter = getDialecticStoreActions();
    expect(actionsAfter.regenerateDocument).toHaveBeenCalledTimes(1);
    act(() => {
      resolvePromise.resolve();
    });
  });

  it('multi-model click opens dialog with checkboxes for each model', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Model A')).toBeInTheDocument();
    expect(screen.getByText('Model B')).toBeInTheDocument();
    expect(screen.getByText('Model C')).toBeInTheDocument();
  });

  it('dialog pre-checks models with statusLabel of Failed or Not started', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    const checkboxB = screen.getByRole('checkbox', { name: /model b/i });
    const checkboxC = screen.getByRole('checkbox', { name: /model c/i });
    expect(checkboxB).toBeChecked();
    expect(checkboxC).toBeChecked();
  });

  it('confirm button is disabled when no models are selected', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    await user.click(screen.getByRole('button', { name: /regenerate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText(/model b/i));
    await user.click(screen.getByLabelText(/model c/i));

    const confirmButton = screen.getByRole('button', { name: /^regenerate$/i });
    expect(confirmButton).toBeDisabled();
  });

  it('confirm button is disabled when isSubmitting is true even if models are selected', async () => {
    const resolvePromise: { resolve: () => void } = { resolve: () => {} };
    const response: ApiResponse<RegenerateDocumentResponse> = {
      data: { jobIds: [] },
      error: undefined,
      status: 200,
    };
    const slowPromise: Promise<ApiResponse<RegenerateDocumentResponse>> = new Promise((resolve) => {
      resolvePromise.resolve = () => resolve(response);
    });
    const actions = getDialecticStoreActions();
    vi.mocked(actions.regenerateDocument).mockReturnValue(slowPromise);

    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    await user.click(screen.getByRole('button', { name: /regenerate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    const failedCheckbox = screen.getByLabelText(/model b/i);
    await user.click(failedCheckbox);
    const confirmButton = screen.getByRole('button', { name: /^regenerate$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/regenerating/i)).toBeInTheDocument();
    });
    expect(confirmButton).toBeDisabled();
    act(() => {
      resolvePromise.resolve();
    });
  });

  it('confirm button shows Loader2 spinner and Regenerating... text when isSubmitting is true', async () => {
    const resolvePromise: { resolve: () => void } = { resolve: () => {} };
    const response: ApiResponse<RegenerateDocumentResponse> = {
      data: { jobIds: [] },
      error: undefined,
      status: 200,
    };
    const slowPromise: Promise<ApiResponse<RegenerateDocumentResponse>> = new Promise((resolve) => {
      resolvePromise.resolve = () => resolve(response);
    });
    const actions = getDialecticStoreActions();
    vi.mocked(actions.regenerateDocument).mockReturnValue(slowPromise);

    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    await user.click(screen.getByRole('button', { name: /regenerate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^regenerate$/i }));

    await waitFor(() => {
      expect(screen.getByText(/regenerating/i)).toBeInTheDocument();
    });
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    act(() => {
      resolvePromise.resolve();
    });
  });

  it('after regenerateDocument resolves (success or error), isSubmitting returns to false and button is re-enabled', async () => {
    const resolvePromise: { resolve: () => void } = { resolve: () => {} };
    const response: ApiResponse<RegenerateDocumentResponse> = {
      data: { jobIds: [] },
      error: undefined,
      status: 200,
    };
    const slowPromise: Promise<ApiResponse<RegenerateDocumentResponse>> = new Promise((resolve) => {
      resolvePromise.resolve = () => resolve(response);
    });
    const actions = getDialecticStoreActions();
    vi.mocked(actions.regenerateDocument).mockReturnValue(slowPromise);

    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: [perModelLabelSingle] })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    await waitFor(() => {
      expect(actions.regenerateDocument).toHaveBeenCalled();
    });

    act(() => {
      resolvePromise.resolve();
    });

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /regenerate document/i });
      expect(btn).not.toBeDisabled();
    });
  });

  it('confirm calls regenerateDocument with all selected model IDs and correct payload including idempotencyKey', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    await user.click(screen.getByRole('button', { name: /regenerate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: /model a/i }));
    await user.click(screen.getByRole('checkbox', { name: /model c/i }));
    await user.click(screen.getByRole('button', { name: /^regenerate$/i }));

    await waitFor(() => {
      const actions = getDialecticStoreActions();
      expect(actions.regenerateDocument).toHaveBeenCalledTimes(1);
    });

    const actions = getDialecticStoreActions();
    const payload: RegenerateDocumentPayload = vi.mocked(actions.regenerateDocument).mock.calls[0][0];
    expect(payload.sessionId).toBe(sessionId);
    expect(payload.stageSlug).toBe(stageSlug);
    expect(payload.iterationNumber).toBe(iterationNumber);
    expect(payload.documents).toHaveLength(2);
    expect(payload.documents).toEqual(
      expect.arrayContaining([
        { documentKey, modelId: 'model-a' },
        { documentKey, modelId: 'model-b' },
      ]),
    );
    expect(typeof payload.idempotencyKey).toBe('string');
  });

  it('confirm closes dialog and resets state', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    await user.click(screen.getByRole('button', { name: /regenerate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText(/model b/i));
    await user.click(screen.getByRole('button', { name: /^regenerate$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /regenerate document/i })).not.toBeInTheDocument();
    });
  });

  it('cancel closes dialog and resets state without calling regenerateDocument', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ perModelLabels: perModelLabelsMulti })} />);
    await user.click(screen.getByRole('button', { name: /regenerate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /regenerate document/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /regenerate document/i })).not.toBeInTheDocument();
    });

    const actions = getDialecticStoreActions();
    expect(actions.regenerateDocument).not.toHaveBeenCalled();
  });

  it('does not call regenerateDocument when activeSessionId is null', async () => {
    const user = userEvent.setup();
    render(<RegenerateDocumentButton {...defaultProps({ activeSessionId: null, isDocumentOnCurrentStage: true })} />);
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    const actions = getDialecticStoreActions();
    expect(actions.regenerateDocument).not.toHaveBeenCalled();
  });

  it('does not call regenerateDocument when iterationNumber is undefined', async () => {
    const user = userEvent.setup();
    render(
      <RegenerateDocumentButton
        {...defaultProps({ iterationNumber: undefined, isDocumentOnCurrentStage: true })}
      />,
    );
    const button = screen.getByRole('button', { name: /regenerate document/i });
    await user.click(button);

    const actions = getDialecticStoreActions();
    expect(actions.regenerateDocument).not.toHaveBeenCalled();
  });
});
