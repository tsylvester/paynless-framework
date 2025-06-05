import React from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton'; // Assuming you have a Skeleton component from Shadcn/ui

interface CardSkeletonProps {
  numberOfFields?: number;
  includeHeader?: boolean;
  includeFooter?: boolean;
  headerHeight?: string; // e.g., 'h-8'
  fieldHeight?: string;  // e.g., 'h-4'
  footerHeight?: string; // e.g., 'h-10'
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  numberOfFields = 2, // Adjusted default for profile cards
  includeHeader = true,
  includeFooter = false,
  headerHeight = 'h-6',  // Adjusted default
  fieldHeight = 'h-4',   // Adjusted default
  footerHeight = 'h-10'
}) => {
  return (
    <Card className="w-full flex flex-col">
      {includeHeader && (
        <CardHeader>
          <Skeleton data-testid="skeleton-loader" className={`w-3/4 ${headerHeight} mb-2`} />
          <Skeleton data-testid="skeleton-loader" className={`w-1/2 ${fieldHeight}`} />
        </CardHeader>
      )}
      <CardContent className="space-y-3 pt-6 flex-grow">
        {Array.from({ length: numberOfFields }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton data-testid="skeleton-loader" className={`w-1/3 ${fieldHeight}`} />
            <Skeleton data-testid="skeleton-loader" className={`w-full ${fieldHeight}`} />
          </div>
        ))}
      </CardContent>
      {includeFooter && (
        <CardFooter>
          <Skeleton data-testid="skeleton-loader" className={`w-1/4 ${footerHeight}`} />
        </CardFooter>
      )}
    </Card>
  );
}; 