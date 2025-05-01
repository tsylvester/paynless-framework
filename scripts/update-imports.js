#!/usr/bin/env node

/**
 * This script updates import paths in the web app to use the monorepo package format
 * Run with: node scripts/update-imports.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Map of import patterns to replace
const importMap = {
  // Paths from apps/web/src to @paynless packages
  "'../store/authStore'": "'@paynless/store'",
  "'../store/subscriptionStore'": "'@paynless/store'",
  "'../../store/authStore'": "'@paynless/store'",
  "'../../store/subscriptionStore'": "'@paynless/store'",
  "'../utils/logger'": "'@paynless/utils'",
  "'../../utils/logger'": "'@paynless/utils'",
  "'../utils/stripe'": "'@paynless/utils'",
  "'../../utils/stripe'": "'@paynless/utils'",
  "'../types/auth.types'": "'@paynless/types'",
  "'../types/subscription.types'": "'@paynless/types'",
  "'../types/api.types'": "'@paynless/types'",
  "'../types/route.types'": "'@paynless/types'",
  "'../types/theme.types'": "'@paynless/types'",
  "'../../types/auth.types'": "'@paynless/types'",
  "'../../types/subscription.types'": "'@paynless/types'",
  "'../../types/api.types'": "'@paynless/types'",
  "'../../types/route.types'": "'@paynless/types'",
  "'../../types/theme.types'": "'@paynless/types'",
  "'../api/apiClient'": "'@paynless/api'",
  "'../../api/apiClient'": "'@paynless/api'",
  "'../api/clients/stripe.api'": "'@paynless/api'",
  "'../../api/clients/stripe.api'": "'@paynless/api'",
  
  // Paths for packages internal imports 
  "'../apiClient'": "'./apiClient'",
  "'../types/": "'@paynless/types",
  "'../../types/": "'@paynless/types",
  "'../utils/": "'@paynless/utils",
  "'../../utils/": "'@paynless/utils",
};

// File extensions to process
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Directory to scan
const APP_DIR = path.resolve('apps/web/src');
const PACKAGES_DIR = path.resolve('packages');

function updateImportsInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    
    // Look for import statements
    const importRegex = /import\s+(?:{[^}]*}\s+from\s+|.*\s+from\s+)(['"].+['"])/g;
    
    content = content.replace(importRegex, (match, importPath) => {
      // Check if this import path should be replaced
      if (importMap[importPath]) {
        hasChanges = true;
        return match.replace(importPath, importMap[importPath]);
      }
      
      // Check for partial matches that need regex
      for (const [pattern, replacement] of Object.entries(importMap)) {
        // Convert simple string pattern to regex-compatible pattern
        const regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[']/g, '.');
        const regex = new RegExp(regexPattern);
        
        if (regex.test(importPath)) {
          hasChanges = true;
          // Replace the matched part with its replacement
          return match.replace(importPath, importPath.replace(regex, replacement));
        }
      }
      
      return match;
    });
    
    if (hasChanges) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated imports in ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

function walkDirectory(dir, callback) {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDirectory(filePath, callback);
    } else if (stat.isFile() && EXTENSIONS.includes(path.extname(filePath))) {
      callback(filePath);
    }
  });
}

let updatedFiles = 0;

console.log('Updating imports in apps/web/src...');
walkDirectory(APP_DIR, (filePath) => {
  if (updateImportsInFile(filePath)) {
    updatedFiles++;
  }
});

console.log('Updating imports in packages...');
walkDirectory(PACKAGES_DIR, (filePath) => {
  if (updateImportsInFile(filePath)) {
    updatedFiles++;
  }
});

console.log(`Finished updating imports in ${updatedFiles} files.`); 