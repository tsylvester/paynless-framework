import React from 'react';
import { render, RenderResult, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Mock, vi } from 'vitest';
import { SubscriptionPage } from './Subscription';

export interface SubscriptionPageTestWindowLocation {
  href: string;
  assign: Mock<[url: string], void>;
  replace: Mock<[url: string], void>;
}

export type SubscriptionPageMemoryRouter = ReturnType<
  typeof createMemoryRouter
>;

export interface SubscriptionPageRenderHarness {
  renderResult: RenderResult;
  router: SubscriptionPageMemoryRouter;
}

export interface RenderSubscriptionPageOptions {
  initialEntries?: string[];
}

export function installSubscriptionPageTestWindowLocation(): SubscriptionPageTestWindowLocation {
  const mockLocation: SubscriptionPageTestWindowLocation = {
    href: '',
    assign: vi.fn((url: string) => {
      mockLocation.href = url;
    }),
    replace: vi.fn((url: string) => {
      mockLocation.href = url;
    }),
  };
  Object.defineProperty(window, 'location', {
    value: mockLocation,
    writable: true,
  });
  return mockLocation;
}

export function renderSubscriptionPage(
  options?: RenderSubscriptionPageOptions,
): SubscriptionPageRenderHarness {
  const initialEntries: string[] =
    options?.initialEntries ?? ['/subscription'];
  const router: SubscriptionPageMemoryRouter = createMemoryRouter(
    [
      {
        path: '/subscription',
        element: React.createElement(SubscriptionPage),
      },
    ],
    { initialEntries },
  );
  const renderResult: RenderResult = render(
    React.createElement(RouterProvider, { router }),
  );
  const harness: SubscriptionPageRenderHarness = {
    renderResult,
    router,
  };
  return harness;
}

export function requireHTMLElementFromElement(candidate: Element): HTMLElement {
  if (!(candidate instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return candidate;
}

function requireParentHTMLElement(element: HTMLElement): HTMLElement {
  const candidate = element.parentElement;
  if (candidate === null) {
    throw new Error('Expected parent element');
  }
  return requireHTMLElementFromElement(candidate);
}

export function getMonthlyPlanGrid(): HTMLElement {
  const heading: HTMLElement = screen.getByRole('heading', {
    name: /Subscription Plans/i,
  });
  const parent: HTMLElement = requireParentHTMLElement(heading);
  const grandparent: HTMLElement = requireParentHTMLElement(parent);
  const gridCandidate = grandparent.querySelector('.grid.gap-8');
  if (gridCandidate === null) {
    throw new Error('Monthly plan cards grid not found');
  }
  return requireHTMLElementFromElement(gridCandidate);
}

export function getPlanCardByPlanName(planName: string): HTMLElement {
  const grid: HTMLElement = getMonthlyPlanGrid();
  const planHeading: HTMLElement = within(grid).getByRole('heading', {
    name: planName,
    level: 2,
  });
  const cardCandidate = planHeading.closest('div.border');
  if (cardCandidate === null) {
    throw new Error(`Plan card not found for ${planName}`);
  }
  return requireHTMLElementFromElement(cardCandidate);
}

export function getCurrentSubscriptionCard(): HTMLElement {
  const currentSubHeading: HTMLElement = screen.getByRole('heading', {
    name: /Current Subscription/i,
    level: 3,
  });
  const parent: HTMLElement = requireParentHTMLElement(currentSubHeading);
  return requireParentHTMLElement(parent);
}

export function findProcessingManageButton(
  currentSubCard: HTMLElement,
): HTMLElement {
  const processingButtons: HTMLElement[] = within(currentSubCard).getAllByRole(
    'button',
    { name: /Processing.../i },
  );
  for (const btn of processingButtons) {
    if (btn.querySelector('svg[class*="lucide-credit-card"]')) {
      return btn;
    }
  }
  throw new Error(
    'Could not find the processing Manage Billing button with CreditCard icon.',
  );
}

export function findProcessingCancelButton(
  currentSubCard: HTMLElement,
): HTMLElement {
  const processingButtons: HTMLElement[] = within(currentSubCard).getAllByRole(
    'button',
    { name: /Processing.../i },
  );
  for (const btn of processingButtons) {
    if (!btn.querySelector('svg')) {
      return btn;
    }
  }
  throw new Error('Could not find processing cancel button');
}
