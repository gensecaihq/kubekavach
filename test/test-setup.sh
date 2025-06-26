#!/bin/bash

set -e

echo "🚀 KubeKavach Test Setup"
echo "======================="

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required but not installed. Run: npm install -g pnpm"; exit 1; }

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build packages
echo "Building packages..."
pnpm build

echo "✅ Setup complete!"
echo ""
echo "To test the CLI:"
echo "  cd packages/cli"
echo "  node ./bin/run.js version"
echo "  node ./bin/run.js help"
