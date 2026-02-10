import { motion } from 'framer-motion'
import {
  Rocket,
  Code2,
  Building2,
  GraduationCap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface UseCase {
  title: string
  description: string
  icon: LucideIcon
  items: string[]
  gradient: string
}

const useCases: UseCase[] = [
  {
    title: 'Indie Hackers & Vibe Coders',
    description:
      'Ship your SaaS idea with production-quality architecture from day one.',
    icon: Rocket,
    items: [
      'Turn a napkin sketch into a full spec',
      'Get database schemas and API designs',
      'Security review baked into every plan',
    ],
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    title: 'Development Teams',
    description:
      'Align your team on architecture before writing a single line of code.',
    icon: Code2,
    items: [
      'Share specs across your org',
      'Consistent technical standards',
      'Faster sprint planning',
    ],
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    title: 'Startups & Agencies',
    description:
      'Deliver client proposals and technical scopes in hours instead of weeks.',
    icon: Building2,
    items: [
      'Rapid project scoping',
      'Professional deliverables',
      'Iterate with AI before committing budget',
    ],
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    title: 'Learning & Teaching',
    description:
      'Understand software architecture through AI-guided dialectic exploration.',
    icon: GraduationCap,
    items: [
      'See how experts critique designs',
      'Learn by reviewing AI reasoning',
      'Build portfolio-ready project plans',
    ],
    gradient: 'from-emerald-500/20 to-teal-500/20',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
}

const cardVariants = {
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
            Perfect For Every Builder
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-textSecondary">
            Whether you&apos;re shipping a weekend project or architecting an
            enterprise platform, Paynless scales to your ambition.
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
              <motion.div
                key={useCase.title}
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
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
