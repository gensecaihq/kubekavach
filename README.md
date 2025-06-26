# KubeKavach

> Developer-first Kubernetes security scanner with instant local pod replay

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20.x-green)](https://nodejs.org/)

## 🚀 Quick Start

```bash
# Install globally
npm install -g kubekavach

# Run your first scan
kubekavach scan

# Replay a problematic pod locally
kubekavach replay pod/frontend-abc123
```

## 🎯 Key Features

- **🔍 Security Scanning**: 10 critical Kubernetes security rules
- **🔄 Pod Replay**: Debug production pods locally in seconds
- **🤖 AI-Powered**: Multi-provider AI explanations (OpenRouter, OpenAI, Claude, etc.)
- **🛠️ Developer-Friendly**: Built for debugging, not just reporting
- **🇮🇳 Indian Compliance**: CERT-IN and MeitY compliant

## 📚 Documentation

Coming Soon !!!!

## 🏗️ Development

This is a monorepo managed with pnpm and Turborepo.

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test
```

## 📦 Packages

- `@kubekavach/cli` - Command-line interface
- `@kubekavach/core` - Core types and utilities
- `@kubekavach/rules` - Security rule engine
- `@kubekavach/replay` - Pod replay engine
- `@kubekavach/ai` - AI provider integrations
- `@kubekavach/api` - REST API server
- `@kubekavach/ui` - Web dashboard

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

Apache 2.0 - see [LICENSE](LICENSE) for details.
