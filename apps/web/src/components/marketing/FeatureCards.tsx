import { motion } from 'framer-motion'
import {
  BrainCircuit,
  Layers3,
  FileText,
  ShieldAlert,
  Eye,
  Download,
  Zap,
  Lock,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Feature {
  title: string
  description: string
  icon: LucideIcon
  color: string
  bgColor: string
}

const features: Feature[] = [
  {
    title: 'Multi-Model AI',
    description:
      'Harness GPT-4, Claude, Gemini and more. Each model brings unique strengths to your project planning process.',
    icon: BrainCircuit,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    title: '5-Stage Pipeline',
    description:
      'A rigorous dialectic process ensures every plan is challenged, refined, and battle-tested before delivery.',
    icon: Layers3,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    title: 'Production-Ready Docs',
    description:
      'Get requirements, user stories, technical specs, and implementation plans you can act on immediately.',
    icon: FileText,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    title: 'Built-In QA',
    description:
      'AI critics automatically identify edge cases, security concerns, and architectural issues before you start building.',
    icon: ShieldAlert,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    title: 'Real-Time Progress',
    description:
      'Watch your documents evolve through each stage with live updates and transparent AI reasoning.',
    icon: Eye,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    title: 'Export Anywhere',
    description:
      'Download finished plans as Markdown, JSON, or structured files ready for your project management tools.',
    icon: Download,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  {
    title: 'Lightning Fast',
    description:
      'Parallel AI processing means comprehensive plans in minutes, not days. Ship faster without cutting corners.',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  {
    title: 'Enterprise Security',
    description:
      'Row-level security, encrypted credentials, and SOC 2 ready infrastructure. Your IP stays protected.',
    icon: Lock,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
  },
  {
    title: 'Team Collaboration',
    description:
      'Share projects across your organization. Manage roles, review plans together, and align on architecture.',
    icon: Users,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
}

export function FeatureCards() {
  return (
    <section className="w-full py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            Everything You Need
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-textPrimary mb-4">
            Built for Serious Builders
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-textSecondary">
            Every feature is designed to help you move faster from idea to
            execution with confidence.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={cardVariants}
                className="group relative p-6 rounded-xl border border-border bg-background hover:bg-surface transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
              >
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${feature.bgColor} mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-textPrimary mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-textSecondary leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
