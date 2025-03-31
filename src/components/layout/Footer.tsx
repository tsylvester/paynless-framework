import React from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  const year = new Date().getFullYear();
  
  return (
    <footer className="bg-white">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-gray-500 text-sm">
              &copy; {year} API App. All rights reserved.
            </p>
          </div>
          
          <div className="flex space-x-6">
            <Link to="/privacy" className="text-gray-500 hover:text-gray-700 text-sm">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-gray-500 hover:text-gray-700 text-sm">
              Terms of Service
            </Link>
            <Link to="/contact" className="text-gray-500 hover:text-gray-700 text-sm">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}