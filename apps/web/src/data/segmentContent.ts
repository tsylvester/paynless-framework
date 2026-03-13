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
  headline: 'Vibecoders',
  oneLiner: "Stop burning money on 'please fix' — give your AI agent a real plan.",
  painStatement: "You built 80% of your app on Bolt/Lovable/Replit/v0, then hit a wall. The AI agent lost context, started breaking things, and now you're stuck in a loop of paying for fixes that create new bugs. You can clearly state what you want but you're not sure how to explain it to the agent.",
  scenario: "Jamie used Bolt to build a custom to-do list and calorie tracker. It worked great until she tried to convert the webpage into an iOS app and get it to sync to her Apple Watch. She's spent $180 on regenerations and it's worse than it was two days ago. She needs a spec that tells the agent exactly what to build, what to leave alone, and in what order.",
  exampleInput: 'Create an iOS combined to-do list and calorie tracker that reminds me to input my food intake and sends alerts to my Apple Watch for meals and todo items.',
  featuredDocs: [
    { tabLabel: 'Business Case', content: vibecoderBusinessCase },
    { tabLabel: 'Work Plan', content: vibecoderWorkPlan },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Proposal', description: 'Describe what you want in plain language — even one sentence works.' },
    { stage: 2, title: 'Review', description: 'AI critiques the proposal and identifies gaps before you start building.' },
    { stage: 3, title: 'Refinement', description: 'Get architecture and stack decisions that prevent rework later.' },
    { stage: 4, title: 'Planning', description: 'Receive a structured master plan with clear milestones.' },
    { stage: 5, title: 'Implementation', description: 'Get a work plan your AI agent can follow without losing context.' },
  ],
  faqItems: [
    {
      question: "But I've already tried AI tools — they just break things.",
      answer: "Generic AI tools lose context after a few prompts. Paynless generates a structured plan with explicit dependency ordering, so your AI agent knows what to build, what to leave alone, and in what sequence. No more circular breakage.",
    },
    {
      question: 'What if my project is too simple for all this planning?',
      answer: "Even simple projects benefit from clear scope. The output scales to your input — a single sentence gets you a focused plan. A detailed brief gets you comprehensive architecture. Either way, you stop guessing.",
    },
  ],
  ctaRef: 'vibecoder',
  gradient: 'from-blue-500/20 to-cyan-500/20',
};

const indiehackerContent: SegmentContent = {
  slug: 'indiehacker',
  headline: 'Indiehackers & Solo Developers',
  oneLiner: "You know how to code. You just don't know this stack yet.",
  painStatement: "They're competent developers tackling a language, framework, or architecture pattern outside their core expertise. They don't have weeks to study best practices before shipping. They need to make sound architectural decisions in unfamiliar territory without learning everything the hard way.",
  scenario: "Marcus is a senior TypeScript backend dev. His side project is a website that has gotten fairly popular and users want a desktop version so they can have local file system access without uploading documents to his database, but Marcus has never built for desktop before and isn't that confident in his front end skills.",
  exampleInput: 'Add a Windows desktop head to a next.js web app monorepo that uses the existing next.js core and syncs to the production database. It needs a platform layer to switch methods and access the file system and provide access to app functions for documents without uploading them to the database.',
  featuredDocs: [
    { tabLabel: 'Tech Stack', content: indiehackerTechStack },
    { tabLabel: 'System Architecture', content: indiehackerSystemArchitecture },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Proposal', description: 'Describe your project and the unfamiliar territory you need to navigate.' },
    { stage: 2, title: 'Review', description: 'Get a critique that catches the pitfalls experienced devs in that stack already know.' },
    { stage: 3, title: 'Refinement', description: 'Receive stack decisions and architecture from people who have shipped in this space.' },
    { stage: 4, title: 'Planning', description: 'Get a roadmap that accounts for the learning curve and dependencies.' },
    { stage: 5, title: 'Implementation', description: 'Execute confidently with clear technical requirements and guardrails.' },
  ],
  faqItems: [
    {
      question: 'Can I trust AI architecture decisions for production?',
      answer: "The output isn't blind AI generation — it's a dialectic process where proposals are critiqued, refined, and validated across multiple passes. You get architecture that's been stress-tested before you write line one.",
    },
    {
      question: 'What if I already know part of the stack?',
      answer: 'Include what you know in your input. The system adapts — if you specify your backend expertise, it focuses on the areas where you need guidance (like desktop packaging or unfamiliar frameworks).',
    },
  ],
  ctaRef: 'indiehacker',
  gradient: 'from-purple-500/20 to-pink-500/20',
};

const startupContent: SegmentContent = {
  slug: 'startup',
  headline: 'Startups & Small Teams',
  oneLiner: "You have 4 months of runway. You can't afford to plan for 3 weeks — or to not plan at all.",
  painStatement: "They have a waitlist, a short runway, and enormous pressure to ship. They know skipping planning leads to rewrites that burn their remaining time and money. But a traditional planning phase — weeks of architecture review, stakeholder alignment, technical discovery — is a luxury they can't afford. They need the rigor without the timeline.",
  scenario: "A 3-person team raised a small pre-seed round. They have a waitlist of 300 users and 4 months to prove traction or the money runs out. Their CTO knows they should plan the architecture properly, but every day spent planning is a day not shipping. They need a comprehensive technical spec — data model, API design, infrastructure choices, security considerations — generated in an afternoon so they can start building tomorrow.",
  exampleInput: "We're building a platform where hiring managers paste job descriptions and our AI screens resumes, ranks candidates, and generates interview question sets tailored to the role. We need team accounts, a Stripe subscription, and an applicant tracking dashboard. It needs to integrate with job boards and LinkedIn for sourcing. Three of us, launching in 4 months.",
  featuredDocs: [
    { tabLabel: 'Business Case', content: startupBusinessCase },
    { tabLabel: 'Product Requirements', content: startupProductRequirements },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Proposal', description: 'Paste your pitch or product brief — whatever you have works.' },
    { stage: 2, title: 'Review', description: 'Get a critique that surfaces scope gaps and technical risks early.' },
    { stage: 3, title: 'Refinement', description: 'Receive product requirements your whole team can align on.' },
    { stage: 4, title: 'Planning', description: 'Get a master plan with milestones that fit your timeline.' },
    { stage: 5, title: 'Implementation', description: 'Start building tomorrow with clear specs and architecture decisions made.' },
  ],
  faqItems: [
    {
      question: 'Is AI-generated architecture reliable enough to build on?',
      answer: "The dialectic process generates, critiques, and refines across multiple stages. By the time you get the output, it's been through the kind of review cycle that normally takes weeks of team discussion. You're not building on a first draft.",
    },
    {
      question: 'Can my whole team use this?',
      answer: 'Yes — the Business Case and Product Requirements docs are designed to align your entire team. Forward them to co-founders, share with investors, hand them to engineers. Everyone builds from the same spec.',
    },
  ],
  ctaRef: 'startup',
  gradient: 'from-amber-500/20 to-orange-500/20',
};

const agencyContent: SegmentContent = {
  slug: 'agency',
  headline: 'Agencies & Freelancers',
  oneLiner: "Your client won't pay for a discovery phase. Your team pays the price.",
  painStatement: "Their clients see planning as overhead, not value. But when specs are thin, the offshore team (or the freelancer themselves) builds the wrong thing, leading to scope creep, rework, and margin erosion. They can't comp weeks of architecture work to the client, but they also can't afford the cost of building without it.",
  scenario: "A small agency lands a $40K client project — a marketplace app. The client provided a 2-page feature list and expects development to start Monday. The agency's PM knows the feature list has gaps (what about dispute resolution? search ranking? payment escrow?). A traditional discovery phase would cost $8K and the client won't approve it. They need a rigorous technical spec generated from the client's brief so their offshore team in the Philippines has clear instructions, and so the PM can identify scope gaps before they become change orders.",
  exampleInput: "WordPress site with Shopify integration and testimonies and user reviews for a local bakery that integrates with a Toast inventory and POS for real time product availability and automated pricing guidance, and emails clients when their favorite products are freshly made.",
  featuredDocs: [
    { tabLabel: 'Product Requirements', content: agencyProductRequirements },
    { tabLabel: 'Technical Requirements', content: agencyTechnicalRequirements },
  ],
  howItWorksSteps: [
    { stage: 1, title: 'Proposal', description: "Paste the client's brief or feature list — even a rough scope works." },
    { stage: 2, title: 'Review', description: 'Surface scope gaps and technical risks before the client signs off.' },
    { stage: 3, title: 'Refinement', description: 'Get product requirements you can show the client for alignment.' },
    { stage: 4, title: 'Planning', description: 'Receive a master plan with realistic milestones for your team.' },
    { stage: 5, title: 'Implementation', description: 'Hand your dev team clear technical requirements and build instructions.' },
  ],
  faqItems: [
    {
      question: 'Will this look professional enough to show my client?',
      answer: "The output is designed for client-facing use. The Business Case and Product Requirements docs are polished, comprehensive, and demonstrate the kind of rigor that builds trust. Use them for scope sign-off before work begins.",
    },
    {
      question: 'Can I white-label the output?',
      answer: "The documents are yours. Export them, add your branding, present them as your deliverable. There's no Paynless watermark or attribution required.",
    },
  ],
  ctaRef: 'agency',
  gradient: 'from-emerald-500/20 to-teal-500/20',
};

export const segmentContentMap: Record<SegmentSlug, SegmentContent> = {
  vibecoder: vibecoderContent,
  indiehacker: indiehackerContent,
  startup: startupContent,
  agency: agencyContent,
};
