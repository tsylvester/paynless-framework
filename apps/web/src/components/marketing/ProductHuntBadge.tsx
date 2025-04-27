import React from 'react';
import { useTheme } from '../../hooks/useTheme';

export function ProductHuntBadge() {
  const { colorMode } = useTheme();

  const badgeTheme = colorMode === 'dark' ? 'dark' : 'light';

  const imageUrl = `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=956609&theme=${badgeTheme}&t=${Date.now()}`;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <a 
        href="https://www.producthunt.com/posts/paynless-saas-app-framework?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-paynless&#0045;saas&#0045;app&#0045;framework" 
        target="_blank" 
        rel="noopener noreferrer"
      >
        <img 
          src={imageUrl}
          alt="Paynless SaaS App Framework - React, supabase, stripe, openAI + more SaaS starter | Product Hunt" 
          style={{ width: '250px', height: '54px' }} 
          width="250" 
          height="54" 
        />
      </a>
    </div>
  );
} 