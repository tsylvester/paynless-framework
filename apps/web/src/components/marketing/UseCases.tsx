import { Link } from 'react-router-dom'
import { motion, Variants } from 'framer-motion'
import {
  Rocket,
  Code2,
  Building2,
  Briefcase,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface UseCase {
  slug: string
  title: string
  description: string
  icon: LucideIcon
  items: string[]
  gradient: string
}

const useCases: UseCase[] = [
  {
    slug: 'vibecoder',
    title: 'Vibecoders',
    description:
      "Stop burning money on 'please fix' — give your agent a real plan.",
    icon: Rocket,
    items: [
      'End the regeneration loop that breaks more than it fixes',
      'Get structured specs your AI agent can follow without losing context',
      'Know exactly what to build, what to leave alone, and in what order',
    ],
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    slug: 'indiehacker',
    title: 'Indiehackers & Solo Developers',
    description:
      "You know how to code. You just don't know this stack yet.",
    icon: Code2,
    items: [
      'Make sound architectural decisions in unfamiliar territory',
      'Skip weeks of studying best practices before shipping',
      'Get guardrails from devs who have shipped in that stack',
    ],
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    slug: 'startup',
    title: 'Startups & Small Teams',
    description:
      "Clock's ticking. You can't afford weeks of planning, or none at all.",
    icon: Building2,
    items: [
      'Get the rigor of a mature planning process in an afternoon',
      'Align your whole team on architecture before writing line one',
      'Ship with confidence instead of hoping the architecture holds',
    ],
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    slug: 'agency',
    title: 'Agencies & Freelancers',
    description:
      "Your client won't pay for discovery. Your team pays the price.",
    icon: Briefcase,
    items: [
      'Generate scope docs before quoting to estimate accurately',
      'Surface gaps in the client brief before they become change orders',
      'Hand your dev team clear specs instead of a 2-page feature list',
    ],
    gradient: 'from-emerald-500/20 to-teal-500/20',
  },
]

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
}

export function UseCases() {
  return (
    <section className="w-full py-24 bg-background relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            Built For You
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-textPrimary mb-4">
            Built for How You Actually Ship
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-textSecondary">
            Whether you&apos;re prompting AI agents, learning a new stack, racing to MVP,
            or scoping client work — Paynless generates the plan you need.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {useCases.map((useCase) => {
            const Icon = useCase.icon
            return (
              <Link key={useCase.slug} to={`/${useCase.slug}`} className="block">
                <motion.div
                  variants={cardVariants}
                  className={`relative p-8 rounded-2xl border border-border bg-gradient-to-br ${useCase.gradient} backdrop-blur-sm hover:shadow-lg transition-all duration-300`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-background/80 border border-border flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-textPrimary mb-2">
                        {useCase.title}
                      </h3>
                      <p className="text-textSecondary mb-4">
                        {useCase.description}
                      </p>
                      <ul className="space-y-2">
                        {useCase.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-center gap-2 text-sm text-textSecondary"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              </Link>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
