#!/usr/bin/env bash
set -e

echo "=== Installing Tern AI & Companion ==="

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>=18) is required to run Tern Companion."
  echo "Please install Node.js from https://nodejs.org or using your system package manager."
  exit 1
fi

echo "Installing Tern CLI globally from GitHub..."
npm install -g https://github.com/terngg/tern-ai

if command -v tern >/dev/null 2>&1; then
  echo ""
  echo "✓ Tern AI installed successfully!"
  echo ""
  echo "To pair your machine with Tern AI, run:"
  echo "  tern companion pair <YOUR-PAIRING-CODE>"
  echo ""
  echo "To view status and detected local providers:"
  echo "  tern companion status"
else
  echo ""
  echo "Tern CLI installed. Make sure your npm global bin directory is in your PATH."
  echo "Run: tern companion pair <YOUR-PAIRING-CODE>"
fi
