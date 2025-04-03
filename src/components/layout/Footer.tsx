import { Link } from 'react-router-dom';

export function Footer() {
  const year = new Date().getFullYear();
  
  return (
    <footer className="bg-background">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-textSecondary text-sm">
              &copy; {year} API App. All rights reserved.
            </p>
          </div>
          
          <div className="flex space-x-6">
            <Link to="/privacy" className="text-textSecondary hover:text-textPrimary text-sm">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-textSecondary hover:text-textPrimary text-sm">
              Terms of Service
            </Link>
            <Link to="/contact" className="text-textSecondary hover:text-textPrimary text-sm">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}