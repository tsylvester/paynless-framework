// src/setupTests.ts
// This imports the necessary matchers like .toBeInTheDocument()
// and extends Vitest's expect globally for all tests in this package.

// Import the implementation to extend expect
import '@testing-library/jest-dom';

// Also explicitly reference the types for TypeScript
import type {} from '@types/testing-library__jest-dom'; 