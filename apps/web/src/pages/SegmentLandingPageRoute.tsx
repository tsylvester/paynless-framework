import { useParams, Navigate } from 'react-router-dom';
import { SegmentSlug, SEGMENT_SLUGS } from '@paynless/types';
import { segmentContentMap } from '../data/segmentContent';
import { SegmentLandingPage } from '../components/marketing/SegmentLandingPage';

function isSegmentSlug(value: string): value is SegmentSlug {
  return SEGMENT_SLUGS.some(slug => slug === value);
}

export function SegmentLandingPageRoute() {
  const { segment } = useParams<{ segment: string }>();

  if (!segment || !isSegmentSlug(segment)) {
    return <Navigate to="/" replace />;
  }

  const content = segmentContentMap[segment];

  return <SegmentLandingPage content={content} />;
}
