export interface SegmentFaqItem {
  question: string;
  answer: string;
}

export interface SegmentFeaturedDoc {
  tabLabel: string;
  content: string;
}

export interface SegmentHowItWorksStep {
  stage: number;
  title: string;
  description: string;
}

export type SegmentSlug = 'vibecoder' | 'indiehacker' | 'startup' | 'agency';

export const SEGMENT_SLUGS: SegmentSlug[] = [
  'vibecoder',
  'indiehacker',
  'startup',
  'agency',
];

export interface SegmentContent {
  slug: SegmentSlug;
  headline: string;
  oneLiner: string;
  painStatement: string;
  scenario: string;
  exampleInput: string;
  transformHeadline?: string;
  transformSubheadline?: string;
  featuredDocs: [SegmentFeaturedDoc, SegmentFeaturedDoc];
  howItWorksSteps: [
    SegmentHowItWorksStep,
    SegmentHowItWorksStep,
    SegmentHowItWorksStep,
    SegmentHowItWorksStep,
    SegmentHowItWorksStep,
  ];
  faqItems: SegmentFaqItem[];
  ctaRef: SegmentSlug;
  gradient: string;
}
