import { motion } from 'framer-motion'
import { Sparkles, ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@paynless/store'

export function PricingSection() {
  const { user } = useAuthStore((state) => ({ user: state.user }))

  return (
    <section className="w-full py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4 mr-2" />
            1M tokens free on signup
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-textPrimary mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-textSecondary">
            Start free, scale as you grow. No hidden fees.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12"
        >
          <div className="relative p-8 rounded-xl border border-border bg-surface">
            <div className="text-sm font-medium text-textSecondary mb-2">Free</div>
            <div className="flex items-baseline mb-4">
              <span className="text-4xl font-bold text-textPrimary">$0</span>
              <span className="text-textSecondary ml-2">/mo</span>
            </div>
            <p className="text-textSecondary mb-6">100k tokens/mo</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2 flex-shrink-0" />
                Gemini 3.1 Pro or Gemini 3.0 Flash
              </li>
              <li className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2 flex-shrink-0" />
                5-stage planning pipeline
              </li>
              <li className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2 flex-shrink-0" />
                Export your project, download any document in markdown, or sync to GitHub
              </li>
            </ul>
          </div>

          <div className="relative p-8 rounded-xl border-2 border-primary bg-surface">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white dark:text-black text-xs font-medium rounded-full">
              Most Popular
            </div>
            <div className="text-sm font-medium text-textSecondary mb-2">Monthly</div>
            <div className="flex items-baseline mb-4">
              <span className="text-4xl font-bold text-textPrimary">$19.99</span>
              <span className="text-textSecondary ml-2">/mo</span>
            </div>
            <p className="text-textSecondary mb-6">1M tokens/mo</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2 flex-shrink-0" />
                Everything in Free
              </li>
              <li className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2 flex-shrink-0" />
                ChatGPT, Google, and Anthropic models
              </li>
              <li className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2 flex-shrink-0" />
                Organization and team collaboration
              </li>
            </ul>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center"
        >
          <p className="text-textSecondary mb-6">
            Extra, Premium, Annual, and multiple sizes of one-time purchases available.{' '}
            <Link to="/pricing" className="text-primary hover:underline">
              See all pricing options
            </Link>
          </p>

          {user ? (
            <Link
              to="/pricing"
              className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
            >
              View Plans
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <Link
              to="/register"
              className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </motion.div>
      </div>
    </section>
  )
}
