# Testing Guide

*Detailed testing documentation is coming soon.*

## Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
cd packages/core
npm test

# Run with coverage
npm run test:coverage
```

## Test Structure

Tests are located in `src/test/` directories within each package:

- `packages/core/src/test/` - Core functionality tests
- `packages/rules/src/test/` - Security rule tests  
- `packages/api/src/test/` - API server tests
- `packages/cli/src/test/` - CLI command tests

## Test Framework

- **Vitest** - Test runner and framework
- **Node.js built-in test runner** - For some components

## Contributing Tests

When adding new features:

1. Write tests for new functionality
2. Ensure existing tests pass
3. Maintain test coverage above 80%

See the [Contributing Guide](../CONTRIBUTING.md) for more details.