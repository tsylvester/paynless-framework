import { render as rtlRender } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../context/theme.context';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
}

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

export function render(
  ui: ReactElement,
  {
    initialRoute = '/',
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  const testQueryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialRoute]}>
        <QueryClientProvider client={testQueryClient}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react'; 