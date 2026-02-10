import { motion } from 'framer-motion'
import {
  Lightbulb,
  ShieldCheck,
  Merge,
  FileCode2,
  Trophy,
  ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ProcessStep {
  stage: number
  title: string
  subtitle: string
  description: string
  icon: LucideIcon
  color: string
  bgColor: string
  borderColor: string
}

const steps: ProcessStep[] = [
  {
    stage: 1,
    title: 'Proposal',
    subtitle: 'Generate Ideas',
    description:
      'Multiple AI models independently generate diverse approaches, solutions, and creative starting points for your project.',
    icon: Lightbulb,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  {
    stage: 2,
    title: 'Review',
    subtitle: 'Critical Review',
    description:
      'AI critics rigorously examine each proposal, identifying weaknesses, edge cases, and missed opportunities.',
    icon: ShieldCheck,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
  {
    stage: 3,
    title: 'Refinement',
    subtitle: 'Smart Integration',
    description:
      'The strongest elements are woven together into a coherent, comprehensive plan that addresses all identified concerns.',
    icon: Merge,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
  },
  {
    stage: 4,
    title: 'Planning',
    subtitle: 'Implementation Planning',
    description:
      'Detailed specifications, actionable steps, and technical blueprints are produced ready for execution.',
    icon: FileCode2,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  {
    stage: 5,
    title: 'Implementation',
    subtitle: 'Final Selection',
    description:
      'The best artifacts are selected, polished, and delivered as production-ready documents you can act on immediately.',
    icon: Trophy,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
}

export function ProcessSteps() {
  return (
    <section className="w-full py-24 bg-surface relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            5-Stage Dialectic Engine
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-textPrimary mb-4">
            How It Works
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-textSecondary">
            Our multi-model AI pipeline puts every idea through rigorous review,
            so you get plans that are battle-tested before you write a single line
            of code.
          </p>
        </motion.div>

        {/* Desktop: Timeline layout */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="hidden lg:block"
        >
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute top-[60px] left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 opacity-20" />

            <div className="grid grid-cols-5 gap-4">
              {steps.map((step, index) => {
                const Icon = step.icon
                return (
                  <motion.div
                    key={step.stage}
                    variants={itemVariants}
                    className="relative flex flex-col items-center text-center"
                  >
                    {/* Stage number + icon */}
                    <div
                      className={`relative z-10 w-[120px] h-[120px] rounded-2xl ${step.bgColor} border ${step.borderColor} flex flex-col items-center justify-center mb-6 backdrop-blur-sm`}
                    >
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${step.color} mb-1`}
                      >
                        Stage {step.stage}
                      </span>
                      <Icon className={`h-8 w-8 ${step.color}`} />
                    </div>

                    {/* Arrow between steps */}
                    {index < steps.length - 1 && (
                      <div className="absolute top-[52px] -right-2 z-20">
                        <ArrowRight className="h-5 w-5 text-textSecondary/30" />
                      </div>
                    )}

                    <h3 className={`text-lg font-bold ${step.color} mb-1`}>
                      {step.title}
                    </h3>
                    <p className="text-sm font-medium text-textPrimary mb-2">
                      {step.subtitle}
                    </p>
                    <p className="text-sm text-textSecondary/60 leading-relaxed px-2">
                      {step.description}
                    </p>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </motion.div>

        {/* Mobile/Tablet: Vertical cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="lg:hidden space-y-6"
        >
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.stage}
                variants={itemVariants}
                className={`relative flex items-start gap-4 p-6 rounded-xl ${step.bgColor} border ${step.borderColor} backdrop-blur-sm`}
              >
                <div
                  className={`flex-shrink-0 w-14 h-14 rounded-xl ${step.bgColor} border ${step.borderColor} flex items-center justify-center`}
                >
                  <Icon className={`h-7 w-7 ${step.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${step.color}`}
                    >
                      Stage {step.stage}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-textPrimary mb-1">
                    {step.title}{' '}
                    <span className="font-normal text-textSecondary">
                      — {step.subtitle}
                    </span>
                  </h3>
                  <p className="text-sm text-textSecondary/60 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
