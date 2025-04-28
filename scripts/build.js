#!/usr/bin/env node

/**
 * Custom build script for the Paynless monorepo
 * This script builds packages in the correct dependency order
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Packages in dependency order
const PACKAGES = [
  'types',
  'utils',
  'api',
  'store',
  'ui-components'
];

// Apps to build
const APPS = [
  'web'
];

// Clean function
function clean() {
  console.log('🧹 Cleaning build directories...');
  
  // Clean packages
  PACKAGES.forEach(pkg => {
    const distPath = path.join('packages', pkg, 'dist');
    if (fs.existsSync(distPath)) {
      console.log(`  Removing ${distPath}`);
      fs.rmSync(distPath, { recursive: true, force: true });
    }
  });
  
  // Clean apps
  APPS.forEach(app => {
    const distPath = path.join('apps', app, 'dist');
    if (fs.existsSync(distPath)) {
      console.log(`  Removing ${distPath}`);
      fs.rmSync(distPath, { recursive: true, force: true });
    }
  });
}

// Build function
function build() {
  console.log('🔨 Building all packages in correct order...');
  
  // Build packages
  PACKAGES.forEach(pkg => {
    console.log(`\n📦 Building @paynless/${pkg}...`);
    try {
      execSync(`npm run build --workspace=@paynless/${pkg}`, { 
        stdio: 'inherit',
        cwd: process.cwd() 
      });
    } catch (error) {
      console.error(`❌ Error building @paynless/${pkg}`);
      process.exit(1);
    }
  });
  
  // Build apps
  APPS.forEach(app => {
    console.log(`\n🚀 Building @paynless/${app}...`);
    try {
      execSync(`npm run build --workspace=@paynless/${app}`, { 
        stdio: 'inherit',
        cwd: process.cwd() 
      });
    } catch (error) {
      console.error(`❌ Error building @paynless/${app}`);
      process.exit(1);
    }
  });
  
  console.log('\n✅ All packages and apps built successfully!');
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('clean')) {
    clean();
  }
  
  if (args.includes('build') || args.length === 0) {
    if (args.includes('clean')) {
      build();
    } else {
      // Only build without cleaning
      build();
    }
  }
}

main(); 