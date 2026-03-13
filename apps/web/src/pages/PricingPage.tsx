import { motion } from 'framer-motion'
import { Sparkles, ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@paynless/store'

interface PlanCard {
  name: string
  price: string
  period: string
  tokens: string
  description: string
  highlight?: string
  featured?: boolean
}

const freePlan: PlanCard = {
  name: 'Free',
  price: '$0',
  period: '/mo',
  tokens: '100k tokens/mo',
  description: 'Get started with Paynless for free',
}

const monthlyPlans: PlanCard[] = [
  {
    name: 'Basic Monthly',
    price: '$19.99',
    period: '/month',
    tokens: '1M tokens/mo',
    description: 'A basic monthly subscription to Paynless, providing 1 million tokens per month',
    featured: true,
  },
  {
    name: 'Extra Monthly',
    price: '$49.99',
    period: '/month',
    tokens: '3M tokens/mo',
    description: 'An extra-sized monthly subscription to Paynless, providing 3 million tokens per month',
  },
  {
    name: 'Premium Monthly',
    price: '$79.99',
    period: '/month',
    tokens: '5M tokens/mo',
    description: 'A premium monthly subscription providing 5 million tokens per month',
    highlight: '15% bonus over other monthly plans',
  },
]

const annualPlans: PlanCard[] = [
  {
    name: 'Basic Annual',
    price: '$199.99',
    period: '/year',
    tokens: '12M tokens',
    description: 'A basic annual subscription to Paynless, providing 12 million tokens',
    highlight: 'Save 20% vs monthly',
  },
  {
    name: 'Extra Annual',
    price: '$499.99',
    period: '/year',
    tokens: '36M tokens',
    description: 'An extra sized annual subscription to Paynless, providing 36 million tokens',
    highlight: 'Save 20% vs monthly',
  },
  {
    name: 'Premium Annual',
    price: '$799.99',
    period: '/year',
    tokens: '60M tokens',
    description: 'A premium annual subscription to Paynless, providing 60 million tokens',
    highlight: 'Best value - save the most',
    featured: true,
  },
]

const oneTimePlans: PlanCard[] = [
  {
    name: 'Top-Up 1.5M',
    price: '$29.99',
    period: ' one-time',
    tokens: '1.5M tokens',
    description: 'Add 1.5 million tokens whenever you need more',
  },
  {
    name: 'Top-Up 4M',
    price: '$69.99',
    period: ' one-time',
    tokens: '4M tokens',
    description: 'Add 4 million tokens whenever you need more',
  },
  {
    name: 'Top-Up 10M',
    price: '$149.99',
    period: ' one-time',
    tokens: '10M tokens',
    description: 'Add 10 million tokens whenever you need more',
    highlight: 'Best value top-up',
  },
]

const features: string[] = [
  'Access to all AI models',
  '5-stage planning pipeline',
  'Export to markdown',
  'Full feature parity across all plans',
]

export function PricingPage() {
  const { user } = useAuthStore((state) => ({ user: state.user }))

  const renderPlanCard = (plan: PlanCard, index: number) => (
    <motion.div
      key={plan.name}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className={`relative p-6 rounded-xl border bg-surface ${
        plan.featured ? 'border-2 border-primary' : 'border-border'
      }`}
    >
      {plan.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white dark:text-black text-xs font-medium rounded-full">
          Popular
        </div>
      )}
      <div className="text-sm font-medium text-textSecondary mb-2">{plan.name}</div>
      <div className="flex items-baseline mb-2">
        <span className="text-3xl font-bold text-textPrimary">{plan.price}</span>
        <span className="text-textSecondary ml-1">{plan.period}</span>
      </div>
      <p className="text-primary font-medium mb-2">{plan.tokens}</p>
      {plan.highlight && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-2">{plan.highlight}</p>
      )}
      <p className="text-sm text-textSecondary mb-4">{plan.description}</p>
      {user ? (
        <Link
          to="/subscription"
          className="block w-full text-center px-4 py-2 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          Manage Subscription
        </Link>
      ) : (
        <Link
          to="/register?ref=pricing"
          className="block w-full text-center px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white dark:text-black hover:bg-primary/90 transition-colors"
        >
          Get Started Free
        </Link>
      )}
    </motion.div>
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4 mr-2" />
            1M tokens free on signup
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-textPrimary mb-4">
            Choose Your Plan
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-textSecondary mb-6">
            All plans include full feature parity. The only difference is how many tokens you get.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {features.map((feature) => (
              <div key={feature} className="flex items-center text-sm text-textSecondary">
                <Check className="h-4 w-4 text-emerald-500 mr-2" />
                {feature}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-bold text-textPrimary mb-6 text-center">Free</h2>
          <div className="max-w-md mx-auto">
            {renderPlanCard(freePlan, 0)}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-bold text-textPrimary mb-6 text-center">Monthly</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {monthlyPlans.map((plan, index) => renderPlanCard(plan, index))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-bold text-textPrimary mb-2 text-center">Annual</h2>
          <p className="text-center text-emerald-600 dark:text-emerald-400 mb-6">Save up to 20% with annual billing</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {annualPlans.map((plan, index) => renderPlanCard(plan, index))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-bold text-textPrimary mb-6 text-center">One-Time Top-Ups</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {oneTimePlans.map((plan, index) => renderPlanCard(plan, index))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          {user ? (
            <Link
              to="/subscription"
              className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
            >
              Manage Subscription
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <Link
              to="/register?ref=pricing"
              className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-textPrimary mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <dl className="divide-y divide-border">
            <div className="py-6">
              <dt className="text-lg font-medium text-textPrimary">
                How do I cancel my subscription?
              </dt>
              <dd className="mt-2 text-textSecondary">
                You can cancel your subscription at any time from your account settings.
                Your subscription will remain active until the end of your current billing period.
              </dd>
            </div>
            <div className="py-6">
              <dt className="text-lg font-medium text-textPrimary">
                What payment methods do you accept?
              </dt>
              <dd className="mt-2 text-textSecondary">
                We accept all major credit cards including Visa, MasterCard, American Express, and Discover.
              </dd>
            </div>
            <div className="py-6">
              <dt className="text-lg font-medium text-textPrimary">
                Can I upgrade or downgrade my plan?
              </dt>
              <dd className="mt-2 text-textSecondary">
                Yes, you can change your plan at any time. When upgrading, you&apos;ll be charged a prorated amount.
                When downgrading, the change takes effect at the end of your current billing period.
              </dd>
            </div>
            <div className="py-6">
              <dt className="text-lg font-medium text-textPrimary">
                What happens when I run out of tokens?
              </dt>
              <dd className="mt-2 text-textSecondary">
                You can purchase a one-time top-up at any time to add more tokens to your account.
                Tokens never expire, no matter how you get them.
              </dd>
            </div>
          </dl>
        </motion.div>
      </div>
    </div>
  )
}
