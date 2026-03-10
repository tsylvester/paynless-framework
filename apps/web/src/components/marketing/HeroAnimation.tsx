import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lightbulb,
  ShieldCheck,
  Merge,
  FileCode2,
  Trophy,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Stage Configuration ──────────────────────────────────────────

interface StageConfig {
  icon: LucideIcon
  color: string
  title: string
  subtitle: string
}

const STAGES: StageConfig[] = [
  { icon: Lightbulb, color: '#3B82F6', title: 'Proposal', subtitle: 'Multiple AI models generate diverse approaches' },
  { icon: ShieldCheck, color: '#EF4444', title: 'Review', subtitle: 'AI critics identify weaknesses & edge cases' },
  { icon: Merge, color: '#8B5CF6', title: 'Refinement', subtitle: 'Best ideas merged into a unified plan' },
  { icon: FileCode2, color: '#F59E0B', title: 'Planning', subtitle: 'Structured into actionable specifications' },
  { icon: Trophy, color: '#10B981', title: 'Implementation', subtitle: 'Final review and delivery' },
]

const STAGE_DURATION = 3200
const TOTAL_STAGES = 5

// ─── Reusable Document Card ──────────────────────────────────────

function DocCard({
  className,
  children,
  style,
}: {
  className?: string
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-background shadow-xl overflow-hidden ${className || ''}`}
      style={style}
    >
      {children}
    </div>
  )
}

function TextLine({ width, opacity = 0.25, color }: { width: string; opacity?: number; color?: string }) {
  return (
    <div
      className="h-[8px] rounded-full"
      style={{
        width,
        backgroundColor: color || 'currentColor',
        opacity,
      }}
    />
  )
}

// ─── Stage 1: Hypothesis ─────────────────────────────────────────

function StageHypothesis() {
  const models = [
    { name: 'GPT-4o', color: '#10B981', delay: 0, x: -30, y: -30 },
    { name: 'Claude', color: '#F59E0B', delay: 0.15, x: 0, y: 12 },
    { name: 'Gemini', color: '#3B82F6', delay: 0.3, x: 30, y: -10 },
  ]

  const lineWidths = [
    ['85%', '60%', '75%', '45%', '70%', '55%', '80%'],
    ['70%', '80%', '50%', '65%', '55%', '75%', '60%'],
    ['75%', '55%', '85%', '40%', '72%', '68%', '50%'],
  ]

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {models.map((model, mi) => (
        <motion.div
          key={model.name}
          className="absolute"
          initial={{ opacity: 0, y: 60, x: model.x * 3 }}
          animate={{ opacity: 1, y: model.y, x: model.x * 3.5 }}
          transition={{
            delay: model.delay,
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <DocCard className="w-[200px]">
            {/* Header with model name */}
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: model.color }} />
              <span className="text-sm font-semibold text-textSecondary">{model.name}</span>
            </div>
            {/* Text lines animate in */}
            <div className="px-4 py-4 space-y-[9px] text-textPrimary">
              {lineWidths[mi].map((w, li) => (
                <motion.div
                  key={li}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{
                    delay: model.delay + 0.4 + li * 0.07,
                    duration: 0.3,
                    ease: 'easeOut',
                  }}
                  style={{ transformOrigin: 'left' }}
                >
                  <TextLine width={w} opacity={0.15 + (li % 2) * 0.1} />
                </motion.div>
              ))}
            </div>
          </DocCard>

          {/* Sparkle on appear */}
          <motion.div
            className="absolute -top-2 -right-2"
            initial={{ opacity: 0, scale: 0, rotate: -45 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], rotate: 0 }}
            transition={{ delay: model.delay + 0.3, duration: 0.8 }}
          >
            <Sparkles className="w-5 h-5 text-blue-400" />
          </motion.div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Stage 2: Antithesis ─────────────────────────────────────────

function StageAntithesis() {
  const lineData = [
    { w: '82%', struck: false },
    { w: '65%', struck: true },
    { w: '75%', struck: false },
    { w: '50%', struck: true },
    { w: '70%', struck: false },
    { w: '60%', struck: false },
    { w: '80%', struck: true },
    { w: '45%', struck: false },
    { w: '72%', struck: false },
    { w: '58%', struck: true },
  ]

  const annotations = [
    { y: 42, text: 'Edge case?', delay: 0.6 },
    { y: 100, text: 'Security risk', delay: 0.9 },
    { y: 170, text: 'Needs detail', delay: 1.2 },
  ]

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <DocCard className="w-[320px] relative">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <span className="text-sm font-semibold text-textSecondary">Draft Plan</span>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </motion.div>
          </div>
          <div className="px-5 py-4 space-y-[10px] text-textPrimary relative">
            {lineData.map((line, i) => (
              <div key={i} className="relative">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.2 }}
                >
                  <TextLine width={line.w} opacity={line.struck ? 0.08 : 0.2} />
                </motion.div>
                {/* Red strikethrough */}
                {line.struck && (
                  <motion.div
                    className="absolute top-1/2 left-0 h-[2px] bg-red-500/70 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: line.w }}
                    transition={{
                      delay: 0.5 + i * 0.12,
                      duration: 0.4,
                      ease: 'easeOut',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </DocCard>

        {/* Floating red annotations */}
        {annotations.map((ann) => (
          <motion.div
            key={ann.text}
            className="absolute -right-[130px] flex items-center gap-2"
            style={{ top: ann.y }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: ann.delay, duration: 0.4, ease: 'easeOut' }}
          >
            <div className="w-6 h-[1px] bg-red-400/50" />
            <span className="text-xs font-medium text-red-400 whitespace-nowrap bg-red-500/10 px-2.5 py-1 rounded">
              {ann.text}
            </span>
          </motion.div>
        ))}

        {/* Review pulse effect */}
        <motion.div
          className="absolute -inset-4 rounded-xl border-2 border-red-500/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ delay: 0.5, duration: 1.5, repeat: 1, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
  )
}

// ─── Stage 3: Synthesis ──────────────────────────────────────────

function StageSynthesis() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Source documents fly to center */}
      {[-60, 0, 60].map((startX, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{ opacity: 0.7, x: startX * 2.5, y: (i - 1) * 30, scale: 0.75 }}
          animate={{
            opacity: [0.7, 0.5, 0],
            x: 0,
            y: 0,
            scale: [0.75, 0.6, 0.3],
          }}
          transition={{
            duration: 1,
            delay: i * 0.1,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <DocCard className="w-[150px]">
            <div className="px-3 py-3 space-y-[7px] text-textPrimary">
              <TextLine width="80%" opacity={0.15} />
              <TextLine width="60%" opacity={0.12} />
              <TextLine width="70%" opacity={0.15} />
              <TextLine width="50%" opacity={0.12} />
            </div>
          </DocCard>
        </motion.div>
      ))}

      {/* Merge glow */}
      <motion.div
        className="absolute w-40 h-40 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3), transparent 70%)' }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
        transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
      />

      {/* Merged result document */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <DocCard className="w-[320px] border-purple-500/30">
          <div className="px-5 py-2.5 border-b border-purple-500/20 bg-purple-500/5">
            <div className="flex items-center gap-2">
              <Merge className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-semibold text-purple-500">Merged Plan</span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-[9px]">
            {[
              { w: '85%', highlight: true },
              { w: '65%', highlight: false },
              { w: '78%', highlight: true },
              { w: '50%', highlight: false },
              { w: '72%', highlight: true },
              { w: '60%', highlight: false },
              { w: '80%', highlight: false },
              { w: '55%', highlight: true },
              { w: '70%', highlight: false },
            ].map((line, i) => (
              <motion.div
                key={i}
                className="relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 + i * 0.05, duration: 0.3 }}
              >
                <TextLine
                  width={line.w}
                  opacity={line.highlight ? 0.35 : 0.15}
                  color={line.highlight ? '#8B5CF6' : undefined}
                />
              </motion.div>
            ))}
          </div>
        </DocCard>
      </motion.div>
    </div>
  )
}

// ─── Stage 4: Parenthesis ────────────────────────────────────────

function StageParenthesis() {
  const sections = [
    {
      header: 'Requirements',
      lines: [
        { w: '70%', indent: true },
        { w: '65%', indent: true },
      ],
    },
    {
      header: 'Architecture',
      lines: [
        { w: '75%', indent: true },
        { w: '55%', indent: true },
        { w: '60%', indent: true },
      ],
    },
    {
      header: 'Implementation',
      lines: [
        { w: '68%', indent: true },
        { w: '72%', indent: true },
      ],
    },
  ]

  let lineIndex = 0

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <DocCard className="w-[340px] border-amber-500/30">
          <div className="px-5 py-3 border-b border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-semibold text-amber-500">Structured Spec</span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-4">
            {sections.map((section, si) => (
              <motion.div
                key={section.header}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + si * 0.25, duration: 0.4, ease: 'easeOut' }}
                className="space-y-[8px]"
              >
                {/* Section header */}
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-3.5 rounded-full bg-amber-500/60" />
                  <span className="text-xs font-bold text-textPrimary/70 uppercase tracking-wider">
                    {section.header}
                  </span>
                </div>
                {/* Indented lines */}
                {section.lines.map((line) => {
                  const idx = lineIndex++
                  return (
                    <motion.div
                      key={idx}
                      className="pl-5 flex items-center gap-2"
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{
                        delay: 0.5 + si * 0.25 + idx * 0.06,
                        duration: 0.3,
                        ease: 'easeOut',
                      }}
                      style={{ transformOrigin: 'left' }}
                    >
                      <div className="w-2 h-2 rounded-full bg-amber-500/40 flex-shrink-0" />
                      <TextLine width={line.w} opacity={0.18} />
                    </motion.div>
                  )
                })}
              </motion.div>
            ))}
          </div>
        </DocCard>
      </motion.div>
    </div>
  )
}

// ─── Stage 5: Paralysis ──────────────────────────────────────────

function StageParalysis() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative"
      >
        <DocCard className="w-[340px] border-emerald-500/30 relative overflow-visible">
          <div className="px-5 py-3 border-b border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-500">Final Document</span>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.4, type: 'spring', stiffness: 300 }}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </motion.div>
            </div>
          </div>
          <div className="px-5 py-4 space-y-[10px]">
            {[85, 60, 78, 50, 72, 55, 80, 45, 68, 75].map((w, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.05, duration: 0.2 }}
              >
                <TextLine width={`${w}%`} opacity={0.2} />
              </motion.div>
            ))}
          </div>
        </DocCard>

        {/* Green completion glow */}
        <motion.div
          className="absolute -inset-4 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.05))',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '16px',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.7] }}
          transition={{ delay: 0.6, duration: 1, ease: 'easeOut' }}
        />

        {/* Completion badge */}
        <motion.div
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-5 py-2"
          initial={{ opacity: 0, y: -5, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 1.2, duration: 0.5, type: 'spring', stiffness: 200 }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Ready</span>
        </motion.div>

        {/* Celebration sparkles */}
        {[
          { x: -55, y: -35, delay: 1.0 },
          { x: 50, y: -30, delay: 1.15 },
          { x: -35, y: 30, delay: 1.3 },
          { x: 55, y: 25, delay: 1.1 },
        ].map((s, i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2"
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
              x: s.x,
              y: s.y,
            }}
            transition={{ delay: s.delay, duration: 0.7, ease: 'easeOut' }}
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Stage Components Map ────────────────────────────────────────

const StageComponents = [
  StageHypothesis,
  StageAntithesis,
  StageSynthesis,
  StageParenthesis,
  StageParalysis,
]

// ─── Progress Indicator ──────────────────────────────────────────

function StageProgress({ activeStage }: { activeStage: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((stage, i) => {
        const isActive = i === activeStage
        const isPast = i < activeStage

        return (
          <div key={stage.title} className="flex items-center">
            <motion.div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{
                backgroundColor: isActive ? 'rgba(128,128,128,0.08)' : 'transparent',
              }}
              animate={{
                scale: isActive ? 1 : 0.9,
              }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300"
                style={{
                  backgroundColor: isActive || isPast ? 'rgba(128,128,128,0.12)' : 'transparent',
                  border: `1.5px solid ${isActive || isPast ? 'rgba(128,128,128,0.4)' : 'rgba(128,128,128,0.15)'}`,
                  color: isActive || isPast ? 'rgba(128,128,128,0.7)' : 'rgba(128,128,128,0.25)',
                }}
              >
                {i + 1}
              </div>
              {isActive && (
                <motion.span
                  className="text-[10px] font-semibold pr-1 hidden sm:inline text-textSecondary"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  transition={{ duration: 0.3 }}
                >
                  {stage.title}
                </motion.span>
              )}
            </motion.div>
            {/* Connector line */}
            {i < TOTAL_STAGES - 1 && (
              <div className="w-4 h-[1.5px] mx-0.5">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: isPast ? 'rgba(128,128,128,0.35)' : 'rgba(128,128,128,0.12)',
                  }}
                  initial={false}
                  animate={{
                    scaleX: isPast ? 1 : 0.5,
                    opacity: isPast ? 0.8 : 0.4,
                  }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────

export function HeroAnimation() {
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % TOTAL_STAGES)
    }, STAGE_DURATION)
    return () => clearInterval(timer)
  }, [])

  const ActiveComponent = StageComponents[activeStage]
  const stage = STAGES[activeStage]

  return (
    <div className="relative w-full h-[560px] md:h-[640px] select-none">
      {/* Subtle background glow for active stage */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: `radial-gradient(ellipse at center, ${stage.color}06 0%, transparent 70%)`,
        }}
        key={`glow-${activeStage}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Animation viewport — takes up most of the space */}
      <div className="absolute inset-0 bottom-20 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStage}
            className="w-full h-full relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <ActiveComponent />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom area: progress steps + description */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3">
        {/* Progress bar */}
        <StageProgress activeStage={activeStage} />

        {/* Timer bar */}
        <div className="w-36 h-[2px] bg-border/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-textSecondary/30"
            key={`timer-${activeStage}`}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: STAGE_DURATION / 1000, ease: 'linear' }}
          />
        </div>

        {/* Stage description */}
        <AnimatePresence mode="wait">
          <motion.p
            key={activeStage}
            className="text-sm text-textSecondary/70 text-center"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
          >
            {stage.subtitle}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
