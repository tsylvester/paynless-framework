import { useNavigate } from 'react-router-dom'
import { router } from './routes/routes'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect /*useRef */ } from 'react'
import { useAuthStore, useAiStore, useWalletStore, useOrganizationStore } from '@paynless/store'
import type { ChatContextPreferences } from '@paynless/types'
import { ThemeProvider } from './context/theme.context'
import { logger } from '@paynless/utils'
import { useSubscriptionStore } from '@paynless/store'
// import { ChatwootIntegration } from './components/integrations/ChatwootIntegration'
import { Toaster } from '@/components/ui/sonner'
import { PlatformProvider, usePlatform } from '@paynless/platform'
import { PlatformFeatureTester } from './components/debug/PlatformFeatureTester'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Component to handle navigation injection - Remains exported if needed elsewhere
export function NavigateInjector() {
  const navigate = useNavigate()
  const setNavigate = useAuthStore((state) => state.setNavigate)

  useEffect(() => {
    logger.info('Injecting navigate function into authStore.')
    setNavigate(navigate)
  }, [navigate, setNavigate])

  return null
}

// NEW: Internal component to handle content rendering within PlatformProvider
function AppContent() {
  const profile = useAuthStore((state) => state.profile);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const { currentOrganizationId } = useOrganizationStore(state => ({ currentOrganizationId: state.currentOrganizationId })); // Get current org ID

  const {
    loadWallet,
    currentWallet,
    isLoadingWallet,
  } = useWalletStore(state => ({
    loadWallet: state.loadWallet,
    currentWallet: state.currentWallet,
    isLoadingWallet: state.isLoadingWallet,
  }));
  
  const {
    isChatContextHydrated,
    hydrateChatContext,
    resetChatContextToDefaults
  } = useAiStore((state) => ({
    isChatContextHydrated: state.isChatContextHydrated,
    hydrateChatContext: state.hydrateChatContext,
    resetChatContextToDefaults: state.resetChatContextToDefaults,
  }));

  const { isLoadingCapabilities, capabilityError } = usePlatform();

  useEffect(() => {
    if (profile && !isChatContextHydrated) {
      logger.info('[AppContent] Profile available and AI chat context not hydrated. Hydrating...');
      // Type assertion as UserProfile from authStore has chat_context as Json | null
      // and hydrateChatContext expects ChatContextPreferences | null.
      // This assumes the structure within profile.chat_context matches ChatContextPreferences.
      hydrateChatContext(profile.chat_context as ChatContextPreferences | null);
    } else if (!profile && isChatContextHydrated) {
      logger.info('[AppContent] Profile removed (logout) and AI chat context was hydrated. Resetting AI context...');
      resetChatContextToDefaults();
    }
  }, [profile, isChatContextHydrated, hydrateChatContext, resetChatContextToDefaults]);

  // Effect to load wallet information
  useEffect(() => {
    if (profile && !currentWallet && !isLoadingWallet) {
      logger.info('[AppContent] Profile available, wallet not loaded. Loading wallet...');
      loadWallet(); // Load wallet globally for the user session. Any other wallets are set locally from a users action.
    }
  }, [profile, currentWallet, isLoadingWallet, loadWallet]);

  if (isLoadingCapabilities) {
    return (
      <div className="flex dark:bg-black justify-center items-center min-h-screen">
        <div role="status">
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-800 fill-blue-500"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span className="sr-only">Loading Platform...</span>
        </div>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="flex dark:bg-black justify-center items-center min-h-screen">
        <div role="status">
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-800 fill-blue-500"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {capabilityError && (
        <div className="p-4 sticky top-0 z-50 bg-background">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Platform Capability Error</AlertTitle>
            <AlertDescription>
              {capabilityError.message || 'Failed to load platform features. Some functionality may be limited.'}
            </AlertDescription>
          </Alert>
        </div>
      )}
      <RouterProvider router={router} />
    </>
  );
}

// Combined App component
function App() {
  // Hooks REMOVED from here
  const setTestMode = useSubscriptionStore((state) => state.setTestMode)

  // useEffect for Test Mode Initialization moved here
  useEffect(() => {
    const isStripeTestMode = import.meta.env['VITE_STRIPE_TEST_MODE'] === 'true'
    setTestMode(isStripeTestMode)
    logger.info(
      `Stripe Test Mode initialized via useEffect: ${isStripeTestMode}`,
    )
  }, [setTestMode]) // Run once on mount

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PlatformProvider>
          {/* Render the internal component that uses the hooks */}
          <AppContent /> 
          {/* PlatformFeatureTester remains here, inside Provider but outside AppContent */}
          <PlatformFeatureTester />
        </PlatformProvider>
        {/* Toaster remains outside conditional render and PlatformProvider */}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App // Only App is default exported