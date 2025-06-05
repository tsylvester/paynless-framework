import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialecticStageSelector } from './DialecticStageSelector';

// Polyfill for PointerEvents (copied from ChatContextSelector.test.tsx)
if (typeof window !== 'undefined') {
    class MockPointerEvent extends Event {
        button: number;
        ctrlKey: boolean;
        pointerType: string;
        pointerId: number;

        constructor(type: string, props: PointerEventInit) {
            super(type, props);
            this.button = props.button || 0;
            this.ctrlKey = props.ctrlKey || false;
            this.pointerType = props.pointerType || 'mouse';
            this.pointerId = props.pointerId || 0;
        }
    }
    // @ts-expect-error // window.PointerEvent is read-only
    window.PointerEvent = MockPointerEvent;

    if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = (pointerId: number) => {
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] hasPointerCapture: ${pointerId}`);
            }
            return false; 
        };
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] releasePointerCapture: ${pointerId}`);
            }
        };
    }
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] setPointerCapture: ${pointerId}`);
            }
        };
    }
}

// Import the entire module that will be mocked
import * as PaynlessStoreModule from '@paynless/store';

// Import the mock implementation logic and state helpers
import { mockedUseDialecticStoreHookLogic, resetDialecticStoreMock, setDialecticStateValues, getDialecticStoreState } from '../../mocks/dialecticStore.mock';

import { DialecticStage } from '@paynless/types';
import type { DialecticStore } from '@paynless/types';

// Mock @paynless/store: This factory replaces the actual exports from '@paynless/store'
vi.mock('@paynless/store', async (importOriginal) => {
  const actualStoreModule = await importOriginal<typeof import('@paynless/store')>();
  return {
    // Ensure all named exports used by the component are explicitly provided.
    // DialecticStageSelector uses: useDialecticStore, selectSelectedStageAssociation
    selectSelectedStageAssociation: actualStoreModule.selectSelectedStageAssociation,
    useDialecticStore: vi.fn(), // This is the crucial mock
  };
});

// Mock logger
vi.mock('@paynless/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DialecticStageSelector', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let storeStateForAssertions: DialecticStore;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDialecticStoreMock();

    // Use the imported module namespace to access the mocked function.
    // This ensures we are targeting the 'useDialecticStore' that Vitest has replaced.
    vi.mocked(PaynlessStoreModule.useDialecticStore).mockImplementation(mockedUseDialecticStoreHookLogic);
    
    storeStateForAssertions = getDialecticStoreState();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  const setup = (initialStoreStateValues?: Partial<DialecticStore>, props: Partial<React.ComponentProps<typeof DialecticStageSelector>> = {}) => {
    if (initialStoreStateValues) {
      setDialecticStateValues(initialStoreStateValues);
    }
    return render(<DialecticStageSelector {...props} />);
  };

  it('renders with "Thesis Stage" selected by default and sets it in the store', async () => {
    setup({ selectedStageAssociation: null });
    expect(screen.getByRole('combobox')).toHaveTextContent('Thesis Stage');
    await waitFor(() => {
      expect(getDialecticStoreState().setSelectedStageAssociation).toHaveBeenCalledWith(DialecticStage.THESIS);
    });
    expect(getDialecticStoreState().selectedStageAssociation).toBe(DialecticStage.THESIS);
  });

  it('displays the currently selected stage from the store', () => {
    setup({ selectedStageAssociation: DialecticStage.ANTITHESIS });
    expect(screen.getByRole('combobox')).toHaveTextContent('Antithesis Stage');
  });

  it('allows selecting a different stage and calls setSelectedStageAssociation', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedStageAssociation: DialecticStage.THESIS });
    setup();

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveTextContent('Thesis Stage');

    await user.click(combobox);
    const antithesisOption = await screen.findByRole('option', { name: 'Antithesis Stage' });
    await user.click(antithesisOption);

    await waitFor(() => {
      expect(getDialecticStoreState().setSelectedStageAssociation).toHaveBeenCalledWith(DialecticStage.ANTITHESIS);
    });
    expect(getDialecticStoreState().selectedStageAssociation).toBe(DialecticStage.ANTITHESIS);
  });

  it('is disabled when the disabled prop is true', () => {
    setup({ selectedStageAssociation: DialecticStage.THESIS }, { disabled: true });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders all DialecticStage options in the dropdown', async () => {
    const user = userEvent.setup();
    setDialecticStateValues({ selectedStageAssociation: DialecticStage.THESIS });
    setup();
    
    const combobox = screen.getByRole('combobox');
    await user.click(combobox);

    await waitFor(async () => {
      for (const stage of Object.values(DialecticStage)) {
        const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
        expect(await screen.findByRole('option', { name: `${stageName} Stage` })).toBeInTheDocument();
      }
    });
  });
}); 