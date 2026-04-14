import { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@paynless/store';
import { SegmentContent } from '@paynless/types';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

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

const STAGE_GRADIENTS = [
  'from-blue-600 to-cyan-500',
  'from-red-600 to-rose-500', 
  'from-purple-600 to-pink-500',
  'from-amber-600 to-yellow-500',
  'from-emerald-600 to-green-500',
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
    <div className="w-full -mt-12 md:-mt-16 -ml-4 md:-ml-4">
      {/* Section 1: Hero */}
      <section className="w-full min-h-[80vh] flex items-center relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${content.gradient} opacity-90`} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-white/10 to-transparent rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-white/10 to-transparent rounded-full blur-3xl animate-pulse animation-delay-2000" />
        </div>
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center"
          >
            <motion.h1 
              className="text-5xl md:text-7xl lg:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80 mb-8 leading-tight tracking-tight"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {content.headline}
            </motion.h1>
            <motion.p 
              className="text-xl md:text-3xl font-medium text-white/90 mb-12 max-w-4xl mx-auto leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4 }}
            >
              {content.oneLiner}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              {user ? (
                <Link
                  to="/dashboard"
                  className="group inline-flex items-center px-10 py-5 text-lg font-bold rounded-2xl bg-white/95 dark:bg-black/95 text-black dark:text-white hover:bg-white dark:hover:bg-black transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105 transform backdrop-blur-sm"
                >
                  Go to Dashboard
                  <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-2 transition-transform" />
                </Link>
              ) : (
                <Link
                  to={registerUrl}
                  className="group inline-flex items-center px-10 py-5 text-lg font-bold rounded-2xl bg-white/95 dark:bg-black/95 text-black dark:text-white hover:bg-white dark:hover:bg-black transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105 transform backdrop-blur-sm"
                >
                  Get Started Free
                  <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-2 transition-transform" />
                </Link>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Section 2: Before/After */}
      <section className="w-full py-24 bg-gradient-to-b from-background to-surface relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black text-textPrimary mb-6 bg-clip-text text-transparent bg-gradient-to-r from-textPrimary to-primary">
              {content.transformHeadline || 'From Chaos to Clarity'}
            </h2>
            <p className="text-lg text-textSecondary max-w-3xl mx-auto">
              {content.transformSubheadline || 'Transform your scattered ideas into structured, actionable plans that your AI agents can actually follow.'}
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="p-8 rounded-2xl bg-gradient-to-br from-background via-surface to-background border-2 border-primary/20 shadow-xl hover:shadow-2xl transition-shadow duration-300"
            >
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <p className="text-sm font-bold text-primary mb-3 uppercase tracking-wider">Your Raw Input</p>
              <p className="text-lg text-textPrimary italic leading-relaxed">&quot;{content.exampleInput}&quot;</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border-2 border-primary/30 shadow-xl hover:shadow-2xl transition-all duration-300 hover:border-primary/50"
            >
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse mr-2" />
                <div className="w-3 h-3 rounded-full bg-primary/70 animate-pulse animation-delay-200 mr-2" />
                <div className="w-3 h-3 rounded-full bg-primary/40 animate-pulse animation-delay-400" />
              </div>
              <p className="text-sm font-bold text-primary mb-4 uppercase tracking-wider">AI-Generated Output</p>
              <ul className="space-y-3">
                {content.featuredDocs.map((doc) => (
                  <li key={doc.tabLabel} className="flex items-center gap-3 text-textPrimary group">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                    <span className="font-medium">{doc.tabLabel}</span>
                  </li>
                ))}
                <li className="flex items-center gap-3 text-textSecondary font-medium pt-2 border-t border-border">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-textSecondary/30 to-textSecondary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold">+16</span>
                  </div>
                  More strategic documents
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Section 3: Sound Familiar */}
      <section className="w-full py-24 bg-gradient-to-b from-surface to-background relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-black text-textPrimary mb-4">This Is You Right Now</h2>
            <div className="w-24 h-1 bg-gradient-to-r from-primary to-primary/40 mx-auto rounded-full" />
          </motion.div>
          <motion.blockquote
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative p-10 rounded-3xl bg-gradient-to-br from-surface via-background to-surface border-2 border-primary/20 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:border-primary/30"
          >
            <div className="absolute -top-6 left-10">
              <div className="bg-gradient-to-r from-primary to-primary/60 text-white text-6xl font-serif px-4 py-2 rounded-lg shadow-xl">&ldquo;</div>
            </div>
            <p className="text-xl text-textPrimary leading-relaxed font-medium pt-4">
              {content.scenario}
            </p>
            <div className="absolute -bottom-6 right-10">
              <div className="bg-gradient-to-r from-primary/60 to-primary text-white text-6xl font-serif px-4 py-2 rounded-lg shadow-xl rotate-180">&ldquo;</div>
            </div>
          </motion.blockquote>
        </div>
      </section>

      {/* Section 4: Doc Reader */}
      <section className="w-full py-24 bg-gradient-to-b from-background via-surface to-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-black text-textPrimary mb-6 bg-clip-text text-transparent bg-gradient-to-r from-textPrimary to-primary">Real Output. Real Results.</h2>
            <p className="text-lg text-textSecondary font-medium">Actual AI-generated documents from the example above — no edits, no BS.</p>
          </motion.div>
          <div className="flex gap-4 mb-8 justify-center">
            {content.featuredDocs.map((doc, index) => (
              <button
                key={doc.tabLabel}
                onClick={() => setActiveTab(index)}
                className={`px-6 py-3 rounded-2xl font-bold transition-all transform hover:scale-105 ${
                  activeTab === index
                    ? 'bg-gradient-to-r from-primary to-primary/80 text-white shadow-xl scale-105'
                    : 'bg-surface text-textSecondary hover:bg-primary/10 border-2 border-transparent hover:border-primary/30'
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
              const gradient = STAGE_GRADIENTS[index];
              return (
                <motion.div
                  key={step.stage}
                  variants={itemVariants}
                  className="text-center group"
                >
                  <div className="relative mb-6">
                    <div className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br ${gradient} p-1 shadow-xl group-hover:shadow-2xl transition-all duration-300 group-hover:scale-110 transform`}>
                      <div className="w-full h-full rounded-3xl bg-background flex items-center justify-center">
                        <span className={`text-3xl font-black bg-gradient-to-br ${gradient} bg-clip-text text-transparent`}>
                          {step.stage}
                        </span>
                      </div>
                    </div>
                    {index < content.howItWorksSteps.length - 1 && (
                      <div className="hidden md:block absolute top-10 left-[60%] w-full h-px bg-gradient-to-r from-primary/30 to-transparent" />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-textPrimary mb-3">{step.title}</h3>
                  <p className="text-textSecondary leading-relaxed">{step.description}</p>
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
