import {
  SegmentContent,
  SegmentSlug,
} from '@paynless/types';

import vibecoderBusinessCase from '../../../../example/use-cases/vibecoder/google-gemini-3.1-pro-preview_0_business_case_8d649667.md?raw';
import vibecoderWorkPlan from '../../../../example/use-cases/vibecoder/google-gemini-3.1-pro-preview_0_actionable_checklist_2fa6aef2.md?raw';
import indiehackerTechStack from '../../../../example/use-cases/indiehacker/google-gemini-3.1-pro-preview_0_tech_stack_d06d1631.md?raw';
import indiehackerSystemArchitecture from '../../../../example/use-cases/indiehacker/google-gemini-3.1-pro-preview_0_system_architecture_d06d1631.md?raw';
import startupBusinessCase from '../../../../example/use-cases/startup/google-gemini-3.1-pro-preview_0_business_case_f111e2dd.md?raw';
import startupProductRequirements from '../../../../example/use-cases/startup/google-gemini-3.1-pro-preview_0_product_requirements_c1253617.md?raw';
import agencyProductRequirements from '../../../../example/use-cases/agency/google-gemini-3.1-pro-preview_0_product_requirements_efddd975.md?raw';
import agencyTechnicalRequirements from '../../../../example/use-cases/agency/google-gemini-3.1-pro-preview_0_technical_requirements_74921cb5.md?raw';

const vibecoderContent: SegmentContent = {
  slug: 'vibecoder',
  headline: 'VibeCoders',
  oneLiner: "When you're in the zone, but your AI agent keeps killing the vibe.",
  painStatement: "You're flowing. 3am. Lo-fi beats. Energy drink #4. You're building something magical with Cursor/Bolt/v0. Then suddenly — context lost, features breaking, the AI is suggesting changes that undo yesterday's work. The vibe? Dead. The momentum? Gone. You need your AI to understand not just WHAT you're building, but HOW to keep you in flow state.",
  scenario: "Alex is deep in a coding session, building a music visualization app with Cursor. Everything's clicking until they ask for WebGL optimizations. The AI starts refactoring unrelated audio processing code, breaks the frequency analyzer, and now the whole visualizer is frozen. Four hours of flow state, destroyed. They need a spec that maintains context, preserves working code, and keeps the momentum going.",
  exampleInput: "Build a real-time music visualizer that syncs with Spotify, uses WebGL for 3D graphics, and has beat detection that triggers visual effects. Make it feel like you're inside the music.",
  transformHeadline: 'From Midnight Code to Morning Deploy',
  transformSubheadline: 'Turn your 3am fever dreams into production-ready code that actually ships. No context loss, no broken builds, just pure flow.',
  featuredDocs: [
    { tabLabel: 'Business Case', content: vibecoderBusinessCase },
    { tabLabel: 'Work Plan', content: vibecoderWorkPlan },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Drop Your Vision', description: 'Share your idea while the inspiration is hot — raw thoughts welcome.' },
    { stage: 2, title: 'Vibe Check', description: 'AI validates your concept and catches issues before they kill momentum.' },
    { stage: 3, title: 'Stack & Flow', description: 'Get the perfect tech stack that keeps you coding, not configuring.' },
    { stage: 4, title: 'The Roadmap', description: 'Clear milestones that maintain flow — no context switching required.' },
    { stage: 5, title: 'Ship It', description: 'Implementation plan your AI follows while you stay in the zone.' },
  ],
  faqItems: [
    {
      question: "I code best at 2am with no plan. Why would I slow down for this?",
      answer: "This doesn't slow you down — it accelerates you. Spend 5 minutes getting a plan, then code for hours without your AI breaking your flow. It's like having perfect git commits but for your AI's memory.",
    },
    {
      question: 'What if I want to pivot mid-build?',
      answer: "Vibes change, we get it. Run your pivot through Paynless and get an updated plan that preserves what's working. Your AI stays oriented, your existing code stays intact, your flow continues.",
    },
    {
      question: "Can this handle my weird side project ideas?",
      answer: "The weirder, the better. Building a CLI tool that generates music from your git commits? A VS Code theme that changes based on your typing speed? We've seen it all. Paynless structures the chaos without killing the creativity.",
    },
    {
      question: "I already use Cursor/Windsurf/Aider. Why add another tool?",
      answer: "This isn't replacing your AI editor — it's giving it superpowers. Paynless generates the context and structure that makes Cursor 10x more effective. Think of it as your AI's project manager so you can just vibe and code.",
    },
  ],
  ctaRef: 'vibecoder',
  gradient: 'from-violet-600 via-fuchsia-500 to-cyan-400 dark:from-violet-500 dark:via-fuchsia-400 dark:to-cyan-300',
};

const indiehackerContent: SegmentContent = {
  slug: 'indiehacker',
  headline: 'IndieHackers & Solo Devs',
  oneLiner: "Ship your SaaS before your coffee gets cold.",
  painStatement: "You're a one-person army. Backend? That's you. Frontend? Also you. DevOps? Yep, you again. You've got 47 browser tabs open — Docker docs, React tutorials, AWS pricing calculator. You're learning Stripe integration at 11pm because your first customer just signed up. You don't need another course. You need a battle plan that accounts for what you don't know yet.",
  scenario: "Sarah's a Python backend expert who just got her first 100 users for her productivity SaaS. Now they want mobile apps, real-time sync, and enterprise SSO. She's googling 'React Native vs Flutter' while debugging webhook issues and wondering if she should use Supabase or roll her own auth. Every decision feels like it could doom the project. She needs architecture that won't need a rewrite at 1,000 users.",
  exampleInput: "I have a Django API with 100 paying users. Need to add iOS/Android apps with offline mode, real-time collaboration like Notion, and enterprise features (SSO, audit logs). Currently using PostgreSQL and Redis. Want to keep costs under $500/month until 1000 users.",
  transformHeadline: 'From Side Project to Sustainable Business',
  transformSubheadline: 'Stop drowning in Stack Overflow tabs. Get architecture that scales from your first user to your first million — without the million-dollar dev team.',
  featuredDocs: [
    { tabLabel: 'Tech Stack', content: indiehackerTechStack },
    { tabLabel: 'System Architecture', content: indiehackerSystemArchitecture },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Brain Dump', description: "Tell us what you've built and where you're stuck — no shame in the game." },
    { stage: 2, title: 'Reality Check', description: "Get the truth about what will actually break at scale (and what won't)." },
    { stage: 3, title: 'Stack Selection', description: "Pragmatic tech choices optimized for solo devs, not Fortune 500." },
    { stage: 4, title: 'The Blueprint', description: "Roadmap that respects your time and your existing codebase." },
    { stage: 5, title: 'Launch Mode', description: "Ship with confidence — you know exactly what to build and what to skip." },
  ],
  faqItems: [
    {
      question: "I'm bootstrapping. Can I afford to spend time on architecture?",
      answer: "You can't afford NOT to. That 'quick and dirty' MVP becomes technical debt that kills your velocity right when growth hits. 30 minutes with Paynless saves weeks of refactoring at the worst possible time.",
    },
    {
      question: 'What if I picked the wrong stack initially?',
      answer: "We work with what you've got. The plan shows you how to migrate incrementally, what to keep, what to replace, and most importantly — what to ignore. No need to rewrite everything.",
    },
    {
      question: "How technical does the output get?",
      answer: "As technical as you need. Database schemas, API endpoints, deployment configs, cost projections — everything you'd get from a senior architect, minus the $200/hour rate.",
    },
    {
      question: "Will this work for my weird micro-SaaS idea?",
      answer: "The weirder, the better. Chrome extension that needs a backend? Telegram bot with payments? Spreadsheet plugin gone rogue? We've structured stranger things. Your edge case is our Tuesday.",
    },
  ],
  ctaRef: 'indiehacker',
  gradient: 'from-emerald-500 via-teal-500 to-blue-600 dark:from-emerald-400 dark:via-teal-400 dark:to-blue-500',
};

const startupContent: SegmentContent = {
  slug: 'startup',
  headline: 'Startups & Scale-ups',
  oneLiner: "Move fast and don't break things (your investors are watching).",
  painStatement: "Board meeting in 6 weeks. 300 users on the waitlist sending 'when launch?' emails daily. Your technical co-founder just quit. The junior dev is asking about microservices while you're still on a single Heroku dyno. Every standup starts with 'should we refactor this?' You need to ship v1, but it needs to handle v10's scale. No pressure.",
  scenario: "The founding team at TechCo has 4 months runway, 2 engineers, and a deck that promises 'Uber for B2B procurement.' Their MVP is held together with Firebase, Zapier, and prayer. Yesterday, an enterprise client asked about SOC2 compliance and on-premise deployment. Today, the React app takes 8 seconds to load. They need architecture that ships fast but doesn't embarrass them at Series A due diligence.",
  exampleInput: "B2B marketplace connecting suppliers with procurement teams. MVP in React/Node. Just closed pre-seed, hired 2 engineers. Need to handle enterprise clients (SSO, audit logs, SLAs) but also ship weekly. Stripe for payments, considering Temporal for workflows. How do we build fast but not paint ourselves into a corner?",
  transformHeadline: 'From Pitch Deck to Product-Market Fit',
  transformSubheadline: 'Turn investor promises into shipped features. Get the architecture roadmap that survives both your MVP sprint and your Series A technical audit.',
  featuredDocs: [
    { tabLabel: 'Business Case', content: startupBusinessCase },
    { tabLabel: 'Product Requirements', content: startupProductRequirements },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Pitch Dump', description: "Drop your deck, demo, or drunk napkin sketch — we work with what you've got." },
    { stage: 2, title: 'Sanity Check', description: "Find out what will actually kill your startup (hint: it's not Kubernetes)." },
    { stage: 3, title: 'Focus Mode', description: "Product requirements that balance dreams with deadlines." },
    { stage: 4, title: 'Sprint Zero', description: "The plan that gets you to launch without technical bankruptcy." },
    { stage: 5, title: 'Ship & Scale', description: "Architecture that survives both Product Hunt and actual customers." },
  ],
  faqItems: [
    {
      question: "We're too early for architecture. Shouldn't we just hack it together?",
      answer: "That 'temporary hack' becomes the foundation everything else builds on. Spend an hour now, save months of 'we need to rewrite everything' conversations when you're trying to close Series A.",
    },
    {
      question: 'Our competitor just shipped a feature. Can this help us catch up?',
      answer: "Yes. Input their feature, get a technical spec that shows exactly how to build it better, faster, and without their mistakes. It's competitive intelligence meets implementation guide.",
    },
    {
      question: "What if our pivot makes this planning obsolete?",
      answer: "The architecture is modular by design. When you pivot (not if), you'll know exactly what to keep, what to kill, and what to modify. Plus, you can run the new direction through Paynless for an updated plan.",
    },
    {
      question: "Can this handle our 'AWS credits are expiring' crisis?",
      answer: "Absolutely. The plan includes infrastructure decisions, cost projections, and migration paths. Know exactly what to build on AWS vs what to keep simple. No more burning credits on overengineered solutions.",
    },
  ],
  ctaRef: 'startup',
  gradient: 'from-orange-500 via-rose-500 to-pink-500 dark:from-orange-400 dark:via-rose-400 dark:to-pink-400',
};

const agencyContent: SegmentContent = {
  slug: 'agency',
  headline: 'Agencies & Consultancies',
  oneLiner: 'Win the pitch. Skip the all-nighter.',
  painStatement: "It's Thursday, 4pm. RFP response due Monday. The client wants a 'detailed technical approach' for their digital transformation. Your senior architects are on billable projects. The junior team is googling 'what is event sourcing?' You'll spend the weekend crafting docs that prove you're worth $300/hour while your competitors generated theirs in 30 minutes. The client will pick whoever's diagram looks most impressive.",
  scenario: "StreamlineDigital just got an RFP from a Fortune 500 wanting to 'modernize our customer experience across all digital touchpoints with AI-driven personalization.' The budget is $3M. The timeline is aggressive. The stakeholders include IT (wants Java), Marketing (wants no-code), and a CTO who just read about Web3. They need a proposal that speaks to everyone, commits to nothing specific, but demonstrates deep expertise.",
  exampleInput: "Global retailer wants unified commerce platform. Replace 6 different systems (inventory, POS, e-commerce, mobile, loyalty, analytics). 500 stores, 30M customers, peak 100K concurrent users on Black Friday. Current stack: Oracle, SAP, custom Java. Want cloud-native, microservices, real-time inventory. Budget $5M, 18 months. Need SOX compliance.",
  transformHeadline: 'From RFP Panic to Signed Contract',
  transformSubheadline: 'Generate enterprise-grade technical proposals in minutes, not weekends. Win more deals with documentation that shows you understand their problem better than they do.',
  featuredDocs: [
    { tabLabel: 'Product Requirements', content: agencyProductRequirements },
    { tabLabel: 'Technical Requirements', content: agencyTechnicalRequirements },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Brief Drop', description: 'Paste the RFP, client email, or that confusing Slack thread.' },
    { stage: 2, title: 'Gap Analysis', description: "Uncover what the client forgot to mention (but will definitely ask for later)." },
    { stage: 3, title: 'Solutioning', description: 'Architecture that wins pitches and actually works in production.' },
    { stage: 4, title: 'Packaging', description: 'Deliverables that justify your day rate and make clients feel smart.' },
    { stage: 5, title: 'Win & Build', description: 'From signed contract to delivered system without surprises.' },
  ],
  faqItems: [
    {
      question: "Won't clients know this is AI-generated?",
      answer: "They'll think you have the best architects in the business. The output includes contextual insights, risk assessments, and trade-offs that only come from experience. It reads like your A-team wrote it because it thinks like they do.",
    },
    {
      question: 'Can this handle government RFPs with 200 requirements?',
      answer: "Built for complexity. Paste all 200 requirements, get back a matrix showing how you'll address each one, plus the architecture to deliver it. Turn RFP nightmares into competitive advantages.",
    },
    {
      question: "What about our agency's methodology and templates?",
      answer: "The output adapts to your style. Include your methodology in the input, get documentation that follows your framework. It's your expertise, accelerated.",
    },
    {
      question: "How do we price projects planned by AI?",
      answer: "The plan includes effort estimates, complexity assessments, and risk factors. You'll know exactly what you're committing to before you put a number on it. No more eating fixed-bid overruns.",
    },
  ],
  ctaRef: 'agency',
  gradient: 'from-indigo-600 via-blue-600 to-purple-600 dark:from-indigo-500 dark:via-blue-500 dark:to-purple-500',
};

export const segmentContentMap: Record<SegmentSlug, SegmentContent> = {
  vibecoder: vibecoderContent,
  indiehacker: indiehackerContent,
  startup: startupContent,
  agency: agencyContent,
};
