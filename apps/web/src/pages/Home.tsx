import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore, useAiStore } from '@paynless/store'
import { logger } from '@paynless/utils'
import { HeroAnimation } from '../components/marketing/HeroAnimation'
import { ProcessSteps } from '../components/marketing/ProcessSteps'
import { FeatureCards } from '../components/marketing/FeatureCards'
import { StatsSection } from '../components/marketing/StatsSection'
import { UseCases } from '../components/marketing/UseCases'
import { CTASection } from '../components/marketing/CTASection'

export function HomePage() {
  const { user } = useAuthStore((state) => ({ user: state.user }))
  const { loadAiConfig, startNewChat, availableProviders } = useAiStore(
    (state) => state
  )

  const hasSetDefaults = useRef(false)

  useEffect(() => {
    if (!user) return
    loadAiConfig()
    startNewChat()
    hasSetDefaults.current = false
  }, [loadAiConfig, startNewChat, user])

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
    <div className="overflow-hidden -mt-[3.25rem] md:-mx-4 md:-mb-4">
      {/* Hero Section */}
      <section className="relative w-full py-16 md:py-24">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDIwIDAgTCAwIDAgMCAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMC4yIiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiAvPjwvc3ZnPg==')] opacity-20" />
        </div>

        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 shadow-sm backdrop-blur-sm">
                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                <span>AI-Powered Planning Engine</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl leading-[1.1]">
                <span className="block text-textPrimary mb-2">
                  Build Plans That
                </span>
                <span className="block text-primary">
                  Actually Work
                </span>
              </h1>
              <p className="mt-8 text-lg text-textSecondary leading-relaxed max-w-xl">
                Describe your goals and watch multiple AI models collaborate
                in a 5-stage process to deliver production-ready
                requirements, specs, and implementation plans.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                {user ? (
                  <Link
                    to="/dashboard"
                    className="group inline-flex items-center px-8 py-3.5 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
                  >
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/register"
                      className="group inline-flex items-center px-8 py-3.5 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
                    >
                      Get Started Free
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <a
                      href="#how-it-works"
                      className="inline-flex items-center px-8 py-3.5 text-base font-semibold rounded-xl text-textPrimary bg-surface border border-border hover:bg-background transition-all duration-300"
                    >
                      See How It Works
                    </a>
                  </>
                )}
              </div>

              {/* Trust indicators */}
              <div className="mt-10 flex items-center gap-6 text-sm text-textSecondary">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Free to start
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Multi-model AI
                </div>
              </div>
            </motion.div>

            {/* Right: 3D Animation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
              className="hidden lg:block"
            >
              <HeroAnimation />
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works - 5 Stages */}
      <div id="how-it-works">
        <ProcessSteps />
      </div>

      {/* Stats */}
      <StatsSection />

      {/* Feature Cards */}
      <FeatureCards />

      {/* Use Cases */}
      <UseCases />

      {/* Final CTA */}
      <CTASection />
    </div>
  )
}
