import {
  ArrowRight,
  Sparkles,
  Cpu,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore, useAiStore } from '@paynless/store'
import { useEffect, useRef } from 'react'
import { logger } from '@paynless/utils'
import { CreateDialecticProjectForm } from '../components/dialectic/CreateDialecticProjectForm'

export function HomePage() {
  const { user } = useAuthStore((state) => ({ user: state.user }))
  const { loadAiConfig, startNewChat, availableProviders } = useAiStore(
    (state) => state
  )

  const hasSetDefaults = useRef(false)

  useEffect(() => {
    loadAiConfig()
    startNewChat()
    hasSetDefaults.current = false
  }, [loadAiConfig, startNewChat])

  useEffect(() => {
    if (!hasSetDefaults.current && availableProviders.length > 0) {
      logger.info('[HomePage] Attempting to set default AI selections...')
      const defaultProvider = availableProviders.find(
        (p) => p.name === 'OpenAI GPT-4o'
      )

      const defaultPromptId = '__none__'

      if (defaultProvider) {
        hasSetDefaults.current = true
        logger.info('[HomePage] Default provider and prompt selected.', {
          providerId: defaultProvider.id,
          promptId: defaultPromptId,
        })
      } else {
        logger.warn(
          "[HomePage] Could not find default provider by name 'OpenAI GPT-4o'.",
          {
            foundProvider: !!defaultProvider,
            providerCount: availableProviders.length,
          }
        )
      }
    }
  }, [availableProviders])

  return (
    <div>
      {/* Hero Section */}
      <div className="relative overflow-hidden w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDIwIDAgTCAwIDAgMCAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMC4yIiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiAvPjwvc3ZnPg==')] opacity-20" />
        </div>
        <div className="relative w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-36">
            <div className="text-center">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 shadow-sm backdrop-blur-sm animate-fadeIn">
                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                <span>Automate Software Planning</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
                <span className="block text-textPrimary mb-2">
                  Paynless Coding
                </span>
                <span className="block text-primary bg-clip-text bg-gradient-to-r from-primary to-primary/80">
                  Build Better Software Faster
                </span>
              </h1>
              <p className="mt-8 max-w-2xl mx-auto text-lg text-textSecondary leading-relaxed">
                Generate requirements, user stories, and detailed implementation
                plans in seconds.
              </p>
              <div className="mt-12 flex justify-center gap-4">
                {user ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-md hover:shadow-lg"
                  >
                    Try It Now
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

      {/* Dialectic Project Creation Section */}
      <div className="w-full py-12 bg-surface relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto bg-background rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 p-8 w-full ">
            <div className="text-center">
              <div >
                <p className="mx-auto text-textSecondary mb-4">
                  Describe what you want to build or upload an .md project file.
                </p>
              <CreateDialecticProjectForm />

              </div>
            </div>
          </div>          
          <div className="text-center mt-12">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4 shadow-sm backdrop-blur-sm">
              <Cpu className="h-4 w-4 mr-2" />
              <span>Paynless Planning Engine</span>
            </div>
            <h2 className="text-2xl font-bold text-textPrimary">
              Explain what you want, get what you need
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-textSecondary">
              Orchestrate multiple AI agents through a
              five-stage process—Idea, Critique, Combination,
              Formalization, and Organization—to deliver comprehensive project
              plans.
            </p>
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
              security. If you're building, Paynless is for you.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}