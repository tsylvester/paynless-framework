import { Link } from 'react-router-dom';
import { analytics } from '@paynless/analytics-client';

export function Footer() {
  const year = new Date().getFullYear();
  
  const trackFooterLinkClick = (destination: string) => {
    analytics.track('Navigation: Clicked Footer Link', { destination });
  };
  
  return (
    <footer className="bg-background">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-textSecondary text-sm">
                &copy; {year} 
              <Link 
                to="https://paynless.app" 
                className="mx-2 text-textSecondary hover:text-textPrimary text-sm"
                onClick={() => trackFooterLinkClick('https://paynless.app')}
              >
                 Paynless Framework. All rights reserved.
              </Link>
            </p>
          </div>
          
          <div className="flex space-x-6">
            <Link 
              to="/privacy" 
              className="text-textSecondary hover:text-textPrimary text-sm"
              onClick={() => trackFooterLinkClick('/privacy')}
            >
              Privacy Policy
            </Link>
            <Link 
              to="/terms" 
              className="text-textSecondary hover:text-textPrimary text-sm"
              onClick={() => trackFooterLinkClick('/terms')}
            >
              Terms of Service
            </Link>
            <Link 
              to="/contact" 
              className="text-textSecondary hover:text-textPrimary text-sm"
              onClick={() => trackFooterLinkClick('/contact')}
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}