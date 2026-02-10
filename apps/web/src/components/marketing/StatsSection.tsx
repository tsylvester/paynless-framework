import { motion } from 'framer-motion'

interface Stat {
  value: string
  label: string
  description: string
}

const stats: Stat[] = [
  {
    value: '5',
    label: 'AI Stages',
    description: 'Each document goes through a full dialectic pipeline',
  },
  {
    value: '3+',
    label: 'AI Providers',
    description: 'OpenAI, Anthropic, and Google models working together',
  },
  {
    value: '10x',
    label: 'Faster Planning',
    description: 'From idea to actionable specs in minutes, not weeks',
  },
  {
    value: '100%',
    label: 'Reviewed',
    description: 'Every output is critiqued and refined automatically',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
}

export function StatsSection() {
  return (
    <section className="w-full py-20 bg-surface relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-emerald-500/5" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2">
                {stat.value}
              </div>
              <div className="text-lg font-semibold text-textPrimary mb-1">
                {stat.label}
              </div>
              <div className="text-sm text-textSecondary">
                {stat.description}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
