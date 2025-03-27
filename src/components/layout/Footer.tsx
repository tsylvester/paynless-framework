import React from 'react';
import { Shield } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white mt-auto border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <Shield className="h-5 w-5 text-blue-600 mr-2" />
            <span className="text-gray-600 font-medium">AI Chat Framework © {new Date().getFullYear()}</span>
          </div>
          <div className="flex space-x-6">
            <a href="#" className="text-gray-500 hover:text-gray-700">Privacy Policy</a>
            <a href="#" className="text-gray-500 hover:text-gray-700">Terms of Service</a>
            <a href="#" className="text-gray-500 hover:text-gray-700">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;