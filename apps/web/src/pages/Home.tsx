import {
  ArrowRight,
  Database,
  Lock,
  CheckCircle,
  Sparkles,
  CreditCard,
  Cpu,
  Shield,
  Zap,
  Terminal,
  Layers,
  Package,
  GitBranch,
  Globe,
  Smartphone,
  Laptop,
  Monitor,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore, useAiStore } from '@paynless/store'
import { useApi } from '@paynless/api'
import { useState, useEffect, useRef } from 'react'
import { logger } from '@paynless/utils'
import { ModelSelector } from '../components/ai/ModelSelector'
import { PromptSelector } from '../components/ai/PromptSelector'
import { AiChatbox } from '../components/ai/AiChatbox'
import { useTheme } from '../hooks/useTheme'

export function HomePage() {
  const { user, session, isLoading: isAuthLoading } = useAuthStore()
  const navigate = useNavigate()
  const { colorMode } = useTheme()
  const apiClient = useApi()

  const loadAiConfig = useAiStore((state) => state.loadAiConfig)
  const { 
    startNewChat, 
    availableProviders, 
    isConfigLoading: isAiConfigLoading,
    aiError
  } = useAiStore(state => ({
    startNewChat: state.startNewChat,
    availableProviders: state.availableProviders,
    isConfigLoading: state.isConfigLoading,
    aiError: state.aiError
  }))

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)

  const hasSetDefaults = useRef(false)
  const configLoadedRef = useRef(false)

  useEffect(() => {
    if (!isAuthLoading && !configLoadedRef.current && apiClient) {
      logger.info('[HomePage] Auth loaded, initiating AI config load and new chat...')
      loadAiConfig(apiClient)
      startNewChat()
      configLoadedRef.current = true
      hasSetDefaults.current = false
    }
  }, [isAuthLoading, loadAiConfig, startNewChat, apiClient])

  useEffect(() => {
    if (!isAiConfigLoading && !hasSetDefaults.current && availableProviders.length > 0) {
      logger.info('[HomePage] Attempting to set default AI selections...')
      const defaultProvider = availableProviders.find(
        (p) => p.name === 'OpenAI GPT-4o'
      )
      const defaultPromptId = '__none__'

      if (defaultProvider) {
        setSelectedProviderId(defaultProvider.id)
        setSelectedPromptId(defaultPromptId)
        hasSetDefaults.current = true
        logger.info('[HomePage] Default provider and prompt selected.', {
          providerId: defaultProvider.id,
          promptId: defaultPromptId,
        })
      } else {
        logger.warn(
          "[HomePage] Could not find default provider by name 'OpenAI GPT-4o'.",
          { providerCount: availableProviders.length }
        )
        if (availableProviders.length > 0 && !selectedProviderId) {
          setSelectedProviderId(availableProviders[0].id)
          setSelectedPromptId(defaultPromptId)
          hasSetDefaults.current = true
          logger.info('[HomePage] Using first available provider as fallback.', {
            providerId: availableProviders[0].id,
            promptId: defaultPromptId,
          })
        }
      }
    }
  }, [availableProviders, isAiConfigLoading, selectedProviderId])

  return (
    <div>
      {/* Hero Section */}
      <div className="relative overflow-hidden w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDIwIDAgTCAwIDAgMCAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMC4yIiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiAvPjwvc3ZnPg==')] opacity-20" />
        </div>
        <div className="relative w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 sm:py-36">
            <div className="text-center">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 shadow-sm backdrop-blur-sm animate-fadeIn">
                <Zap className="h-4 w-4 mr-2 animate-pulse" />
                <span>Production Ready Framework</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
                <span className="block text-textPrimary mb-2">
                  Welcome to the
                </span>
                <span className="block text-primary bg-clip-text bg-gradient-to-r from-primary to-primary/80">
                  Paynless Framework
                </span>
              </h1>
              <p className="mt-8 max-w-2xl mx-auto text-lg text-textSecondary leading-relaxed">
                Get your app up and running in seconds without burning a single
                token. A production-ready Web, iOS, Android, and Desktop app
                foundation.
              </p>
              <div className="mt-12 flex justify-center gap-4">
                {user ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-md hover:shadow-lg"
                  >
                    Go to Dashboard
                    <ArrowRight
                      className="ml-2 group-hover:translate-x-1 transition-transform"
                      size={20}
                    />
                  </Link>
                ) : (
                  <Link
                    to="/register"
                    className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-md hover:shadow-lg"
                  >
                    Get Started
                    <ArrowRight
                      className="ml-2 opacity-100 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                      size={20}
                    />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat Section */}
      <div className="w-full py-24 bg-surface relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4 shadow-sm backdrop-blur-sm">
              <Cpu className="h-4 w-4 mr-2" />
              <span>Powered by AI</span>
            </div>
            <h2 className="text-2xl font-bold text-textPrimary">
              Try Paynless AI
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-textSecondary">
              Experience the power of AI with our integrated chat interface
            </p>
          </div>
          {isAiConfigLoading ? (
            <div className="text-center p-8 text-textSecondary">Loading AI options...</div>
          ) : aiError ? (
            <div className="text-center p-8 text-destructive bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="font-semibold mb-2">Error Loading AI Configuration</p>
              <p className="text-sm">{aiError}</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto bg-background rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <ModelSelector
                  selectedProviderId={selectedProviderId}
                  onProviderChange={setSelectedProviderId}
                />
                <PromptSelector
                  selectedPromptId={selectedPromptId}
                  onPromptChange={setSelectedPromptId}
                />
              </div>
              <AiChatbox
                providerId={selectedProviderId}
                promptId={selectedPromptId}
                isAnonymous={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tech Stack Section */}
      <div className="w-full bg-surface py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4 shadow-sm backdrop-blur-sm">
              <Package className="h-4 w-4 mr-2" />
              <span>Technology Stack</span>
            </div>
            <h2 className="text-2xl font-bold text-textPrimary">
              Built with Modern Tools
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-textSecondary">
              A powerful stack that scales with your needs
            </p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="flex flex-col items-center group">
              <div className="p-4 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-all duration-300 shadow-sm group-hover:shadow transform group-hover:-translate-y-1">
                <img
                  src="/logos/pnpm.svg"
                  alt="pnpm logo"
                  className="h-10 w-10"
                />
              </div>
              <span className="mt-3 text-sm font-medium text-textSecondary group-hover:text-textPrimary transition-colors">
                pnpm
              </span>
            </div>
            <div className="flex flex-col items-center group">
              <div className="p-4 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-all duration-300 shadow-sm group-hover:shadow transform group-hover:-translate-y-1">
                <img
                  src="/logos/vite.svg"
                  alt="Vite logo"
                  className="h-10 w-14"
                />
              </div>
              <span className="mt-3 text-sm font-medium text-textSecondary group-hover:text-textPrimary transition-colors">
                React / Vite
              </span>
            </div>
            <div className="flex flex-col items-center group">
              <div className="p-4 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-all duration-300 shadow-sm group-hover:shadow transform group-hover:-translate-y-1">
                <img
                  src="/logos/supabase-light.svg"
                  alt="Supabase logo"
                  className="h-10 w-32 dark:hidden"
                />
                <img
                  src="/logos/supabase.svg"
                  alt="Supabase logo"
                  className="h-10 w-32 hidden dark:block"
                />
              </div>
              <span className="mt-3 text-sm font-medium text-textSecondary group-hover:text-textPrimary transition-colors">
                Supabase
              </span>
            </div>
            <div className="flex flex-col items-center group">
              <div className="p-4 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-all duration-300 shadow-sm group-hover:shadow transform group-hover:-translate-y-1">
                <img
                  src="/logos/stripe.svg"
                  alt="Stripe logo"
                  className="h-10 w-18"
                />
              </div>
              <span className="mt-3 text-sm font-medium text-textSecondary group-hover:text-textPrimary transition-colors">
                Stripe
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="w-full py-24 bg-background relative">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMC4yIiBzdHJva2Utb3BhY2l0eT0iMC4wNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIgLz48L3N2Zz4=')] opacity-50" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4 shadow-sm backdrop-blur-sm">
              <Layers className="h-4 w-4 mr-2" />
              <span>Framework Features</span>
            </div>
            <h2 className="text-2xl font-bold text-textPrimary">
              Everything You Need
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-textSecondary">
              A comprehensive set of features to kickstart your application
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="group bg-surface p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] hover:border-primary/20">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary mb-6 group-hover:bg-primary/20 transition-colors duration-300 group-hover:scale-110 transform">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-textPrimary mb-3">
                Multi-Platform API
              </h3>
              <p className="text-textSecondary leading-relaxed mb-4">
                Deploy seamlessly to Web, iOS, Android, and Desktop from one
                codebase.
              </p>
              <div className="flex gap-2 items-center">
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Globe className="h-4 w-4 text-textSecondary" />
                </div>
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Smartphone className="h-4 w-4 text-textSecondary" />
                </div>
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Laptop className="h-4 w-4 text-textSecondary" />
                </div>
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Monitor className="h-4 w-4 text-textSecondary" />
                </div>
              </div>
            </div>
            <div className="group bg-surface p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] hover:border-primary/20">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary mb-6 group-hover:bg-primary/20 transition-colors duration-300 group-hover:scale-110 transform">
                <Database className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-textPrimary mb-3">
                Supabase Backend
              </h3>
              <p className="text-textSecondary leading-relaxed mb-4">
                Powered by Supabase for database, authentication, storage, and
                edge functions.
              </p>
              <div className="flex gap-2 items-center">
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Terminal className="h-4 w-4 text-textSecondary" />
                </div>
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <GitBranch className="h-4 w-4 text-textSecondary" />
                </div>
              </div>
            </div>
            <div className="group bg-surface p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] hover:border-primary/20">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary mb-6 group-hover:bg-primary/20 transition-colors duration-300 group-hover:scale-110 transform">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-textPrimary mb-3">
                Secure Authentication
              </h3>
              <p className="text-textSecondary leading-relaxed mb-4">
                Industry-standard JWT-based authentication with proper security
                measures.
              </p>
              <div className="flex gap-2 items-center">
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Lock className="h-4 w-4 text-textSecondary" />
                </div>
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Cpu className="h-4 w-4 text-textSecondary" />
                </div>
              </div>
            </div>
            <div className="group bg-surface p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.02] hover:border-primary/20">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary mb-6 group-hover:bg-primary/20 transition-colors duration-300 group-hover:scale-110 transform">
                <CreditCard className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-textPrimary mb-3">
                Stripe Integration
              </h3>
              <p className="text-textSecondary leading-relaxed mb-4">
                Pre-configured Stripe integration for subscription plans and
                billing.
              </p>
              <div className="flex gap-2 items-center">
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <CheckCircle className="h-4 w-4 text-textSecondary" />
                </div>
                <div className="p-1.5 rounded-md bg-background/80 group-hover:bg-background transition-colors">
                  <Sparkles className="h-4 w-4 text-textSecondary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Perfect For Section */}
      <div className="w-full py-24 bg-background relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-textPrimary">
              Perfect For...
            </h2>
            <p className="mt-4 max-w-3xl mx-auto text-textSecondary text-lg">
              Vibe coders, SaaS startups, indie hackers, and development teams
              who want to ship faster without compromising on quality or
              security. If you're building a modern application with React,
              Supabase, and Stripe, this framework is designed for you.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="w-full relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMC41IiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiAvPjwvc3ZnPg==')] opacity-30" />
        </div>
        <div className="relative py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/20 text-white dark:text-black text-sm font-medium mb-8 shadow-sm backdrop-blur-sm">
            <Zap className="h-4 w-4 mr-2" />
            <span>Get Started Today</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white dark:text-gray-800 mb-6">
            Ready to Build Paynless-ly?
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-white/90 dark:text-black/90 mb-10">
            Fork the repository, follow the setup guide, and start building your
            next big idea today with our production-ready framework.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
            <Link
              to="https://github.com/tsylvester/paynless-framework"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center justify-center px-8 py-3.5 border-2 border-white/30 text-base font-medium rounded-lg text-white dark:text-black bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-300 shadow-md hover:shadow-lg"
            >
              <GitBranch className="h-5 w-5 mr-2" />
              Fork on GitHub
              <ArrowRight
                className="ml-2 opacity-100 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                size={20}
              />
            </Link>
            <Link
              to="/dashboard"
              className="group inline-flex items-center justify-center px-8 py-3.5 border-2 border-white text-base font-medium rounded-lg text-primary bg-white hover:bg-gray-50 transition-all duration-300 shadow-md hover:shadow-lg dark:text-black"
            >
              View Setup Guide
              <ArrowRight
                className="ml-2 opacity-100 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300 dark:text-black"
                size={20}
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
