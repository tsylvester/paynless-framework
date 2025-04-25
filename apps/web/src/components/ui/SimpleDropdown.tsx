import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SimpleDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  align?: 'start' | 'end'; // Added for alignment
  // Add other potential props like sideOffset, alignOffset later if needed
}

export const SimpleDropdown: React.FC<SimpleDropdownProps> = ({
  trigger,
  children,
  contentClassName,
  align = 'end', // Default align to end like user/notification menu
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown if clicking outside of it (using backdrop approach)
  // Note: This backdrop approach is simpler than event listeners for this case.
  // It assumes the trigger itself will handle toggling.

  // --- Optional: Click outside using event listener (more robust but complex) ---
  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
  //       setIsOpen(false);
  //     }
  //   };
  //   if (isOpen) {
  //     document.addEventListener('mousedown', handleClickOutside);
  //   } else {
  //     document.removeEventListener('mousedown', handleClickOutside);
  //   }
  //   return () => {
  //     document.removeEventListener('mousedown', handleClickOutside);
  //   };
  // }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Wrap trigger to attach onClick */}
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {/* Conditionally Rendered Content */}
      {isOpen && (
        <>
          {/* Backdrop to handle closing on outside click */}
          <div
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />

          {/* Actual Dropdown Panel */}
          <div
            className={cn(
              "absolute mt-2", // Base positioning
              align === 'end' ? 'right-0' : 'left-0', // Alignment
              "bg-surface rounded-lg shadow-xl border border-border z-50", // Base styling
              "p-1", // Default padding
              contentClassName // Allow overriding/extending styles
            )}
            // Prevent clicks inside the content from closing via backdrop
            onClick={(e) => e.stopPropagation()} 
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}; 