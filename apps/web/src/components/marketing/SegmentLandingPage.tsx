import { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@paynless/store';
import { SegmentContent } from '@paynless/types';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import {
  ArrowRight,
  Lightbulb,
  ShieldCheck,
  Merge,
  FileCode2,
  Trophy,
  ChevronDown,
  ChevronUp,
  Quote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SegmentLandingPageProps {
  content: SegmentContent;
}

const ALL_DOC_TITLES = {
  proposal: ['Business Case', 'Feature Specifications', 'Success Metrics', 'Technical Approach'],
  review: ['Business Case Critique', 'Dependency Map', 'Non-Functional Requirements', 'Risk Register', 'Technical Feasibility'],
  refinement: ['Product Requirements', 'System Architecture', 'Tech Stack'],
  planning: ['Master Plan', 'Milestones', 'Technical Requirements'],
  implementation: ['Work Plan', 'Recommendations', 'Updated Master Plan'],
};

const STAGE_ICONS: LucideIcon[] = [Lightbulb, ShieldCheck, Merge, FileCode2, Trophy];
const STAGE_COLORS = [
  { color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
  { color: 'text-red-500', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  { color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
  { color: 'text-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  { color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export function SegmentLandingPage({ content }: SegmentLandingPageProps) {
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const [activeTab, setActiveTab] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const registerUrl = `/register?ref=${content.ctaRef}`;

  return (
    <div className="w-full">
      {/* Section 1: Hero */}
      <section className={`w-full py-24 bg-gradient-to-br ${content.gradient} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-background/80" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-textPrimary mb-6">
              {content.headline}
            </h1>
            <p className="text-xl md:text-2xl text-textSecondary mb-10 max-w-3xl mx-auto">
              {content.oneLiner}
            </p>
            {user ? (
              <Link
                to="/dashboard"
                className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <Link
                to={registerUrl}
                className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* Section 2: Before/After */}
      <section className="w-full py-20 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-textPrimary mb-4">From Idea to Plan</h2>
            <p className="text-textSecondary max-w-2xl mx-auto">
              Bring whatever you have — from a single sentence to a full brief. The more detail you provide, the sharper the output.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="p-6 rounded-xl bg-background border border-border"
            >
              <p className="text-sm font-medium text-textSecondary mb-2">Your Input</p>
              <p className="text-textPrimary italic">&quot;{content.exampleInput}&quot;</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="p-6 rounded-xl bg-background border border-border"
            >
              <p className="text-sm font-medium text-textSecondary mb-2">What You Get</p>
              <ul className="space-y-2">
                {content.featuredDocs.map((doc) => (
                  <li key={doc.tabLabel} className="flex items-center gap-2 text-textPrimary">
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    {doc.tabLabel}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-textSecondary">
                  <div className="w-2 h-2 rounded-full bg-textSecondary/30 flex-shrink-0" />
                  + 16 more documents
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Section 3: Sound Familiar */}
      <section className="w-full py-20 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h2 className="text-3xl font-bold text-textPrimary">Sound Familiar?</h2>
          </motion.div>
          <motion.blockquote
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative p-8 rounded-xl bg-surface border border-border"
          >
            <Quote className="absolute top-4 left-4 h-8 w-8 text-primary/20" />
            <p className="text-lg text-textSecondary italic pl-8">
              {content.scenario}
            </p>
          </motion.blockquote>
        </div>
      </section>

      {/* Section 4: Doc Reader */}
      <section className="w-full py-20 bg-surface">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h2 className="text-3xl font-bold text-textPrimary mb-4">Here&apos;s What You Get</h2>
            <p className="text-textSecondary">This is real, unedited output generated from the exact prompt example above.</p>
          </motion.div>
          <div className="flex gap-2 mb-4 justify-center">
            {content.featuredDocs.map((doc, index) => (
              <button
                key={doc.tabLabel}
                onClick={() => setActiveTab(index)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === index
                    ? 'bg-primary text-white dark:text-black'
                    : 'bg-background text-textSecondary hover:bg-background/80'
                }`}
              >
                {doc.tabLabel}
              </button>
            ))}
          </div>
          <div
            className={`relative rounded-xl bg-background border border-border overflow-hidden transition-all duration-300 ${
              isExpanded ? '' : 'max-h-[600px]'
            }`}
          >
            <div className={`p-6 ${isExpanded ? '' : 'overflow-y-auto max-h-[550px]'}`}>
              <MarkdownRenderer content={content.featuredDocs[activeTab].content} />
            </div>
            {!isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            )}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Expand Full Document
              </>
            )}
          </button>
        </div>
      </section>

      {/* Section 5: See All 18 */}
      <section className="w-full py-20 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-textPrimary mb-4">See All 18 Documents</h2>
            <p className="text-textSecondary">Every run generates a complete documentation suite</p>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-5 gap-6"
          >
            {Object.entries(ALL_DOC_TITLES).map(([stage, titles]) => (
              <motion.div key={stage} variants={itemVariants} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                  {stage}
                </h3>
                <ul className="space-y-2">
                  {titles.map((title) => (
                    <li key={title} data-testid="doc-title" className="text-sm text-textSecondary">
                      {title}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center mt-12"
          >
            {!user && (
              <Link
                to={registerUrl}
                className="group inline-flex items-center px-6 py-3 text-sm font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300"
              >
                Generate Your Own
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* Section 6: How It Works */}
      <section className="w-full py-20 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-textPrimary mb-4">How It Works</h2>
            <p className="text-textSecondary max-w-2xl mx-auto">
              Our 5-stage process transforms your idea into comprehensive documentation, the same way professional teams do.
              <br />
              <br />
              <span className="text-textSecondary">This is the same method we used to build this app.</span>
            </p>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-5 gap-6"
          >
            {content.howItWorksSteps.map((step, index) => {
              const Icon = STAGE_ICONS[index];
              const colors = STAGE_COLORS[index];
              return (
                <motion.div
                  key={step.stage}
                  variants={itemVariants}
                  className="text-center"
                >
                  <div
                    className={`w-16 h-16 mx-auto rounded-xl ${colors.bgColor} border ${colors.borderColor} flex items-center justify-center mb-4`}
                  >
                    <Icon className={`h-8 w-8 ${colors.color}`} />
                  </div>
                  <h3 className={`text-lg font-bold ${colors.color} mb-2`}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-textSecondary">
                    {step.description}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Section 7: FAQ */}
      <section className="w-full py-20 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-textPrimary">Common Questions</h2>
          </motion.div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-6"
          >
            {content.faqItems.map((item) => (
              <motion.div
                key={item.question}
                variants={itemVariants}
                className="p-6 rounded-xl bg-surface border border-border"
              >
                <h3 className="text-lg font-semibold text-textPrimary mb-2">
                  {item.question}
                </h3>
                <p className="text-textSecondary">
                  {item.answer}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Section 8: Final CTA */}
      <section className={`w-full py-24 bg-gradient-to-br ${content.gradient} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-background/80" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-textPrimary mb-6">
              Ready to Build?
            </h2>
            <p className="text-lg text-textSecondary mb-4 max-w-2xl mx-auto">
              Start free — 1M tokens on signup, 100k tokens free every month. No credit card unless you upgrade.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
              {user ? (
                <Link
                  to="/dashboard"
                  className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
                >
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              ) : (
                <>
                  <Link
                    to={registerUrl}
                    className="group inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-white dark:text-black bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primary/20"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center px-8 py-4 text-base font-semibold rounded-xl text-textPrimary bg-surface border border-border hover:bg-background transition-all duration-300"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
