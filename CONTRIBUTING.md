# Contributing to KubeKavach

Thank you for your interest in contributing to KubeKavach! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Docker
- kubectl
- Git

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/gensecaihq/kubekavach.git
   cd kubekavach
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build All Packages**
   ```bash
   npm run build
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

## 📝 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass

### 3. Commit Changes

```bash
git add .
git commit -m "feat: add new security rule for container capabilities"
```

#### Commit Message Format

We follow the [Conventional Commits](https://conventionalcommits.org/) specification:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### 4. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request through GitHub.

## 🏗️ Project Structure

```
kubekavach/
├── packages/
│   ├── cli/              # Command-line interface
│   ├── core/             # Core types and utilities
│   ├── rules/            # Security rules engine
│   ├── replay/           # Pod replay functionality
│   ├── api/              # REST API server
│   ├── ui/               # Web dashboard
│   └── ai/               # AI integration
├── helm/                 # Helm charts
├── deployment/           # Kubernetes manifests
└── docs/                 # Documentation
```

## 🔧 Development Guidelines

### Code Style

- **TypeScript**: All new code must be written in TypeScript
- **ESLint**: Follow the existing ESLint configuration
- **Prettier**: Code formatting is handled by Prettier
- **Comments**: Add JSDoc comments for public APIs

### Testing

- **Unit Tests**: Required for all new functions and classes
- **Integration Tests**: Required for API endpoints
- **E2E Tests**: Required for CLI commands
- **Test Files**: Place tests next to source files with `.test.ts` extension

### Security Rules

When adding new security rules:

1. **Rule ID**: Use the next available KKR### number
2. **Severity**: Choose appropriate severity (CRITICAL, HIGH, MEDIUM, LOW)
3. **Category**: Use existing categories or propose new ones
4. **Validation**: Include comprehensive test cases
5. **Documentation**: Update the README with rule details

Example rule structure:

```typescript
export const newSecurityRule: Rule = {
  id: 'KKR010',
  name: 'Rule Name',
  description: 'Clear description of what this rule checks',
  severity: Severity.HIGH,
  category: RULE_CATEGORIES.CONTAINER_SECURITY,
  validate(manifest: any): boolean {
    // Rule logic here
  },
  getFinding(manifest: any) {
    // Return finding details
  },
};
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
npm test --workspace=@kubekavach/rules

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/my-module';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

## 📚 Documentation

- **API Documentation**: Update OpenAPI specs for API changes
- **README**: Keep the main README updated with new features
- **JSDoc**: Add comprehensive JSDoc comments
- **Examples**: Include usage examples for new features

## 🔄 Pull Request Process

### Before Submitting

1. **Tests**: Ensure all tests pass
2. **Linting**: Fix all linting errors
3. **Type Checking**: Ensure TypeScript compiles without errors
4. **Documentation**: Update relevant documentation
5. **Changelog**: Consider if your change needs a changelog entry

### PR Checklist

- [ ] Tests pass locally
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Breaking changes clearly documented
- [ ] Security implications considered

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass
```

## 🔒 Security Considerations

- **Secrets**: Never commit API keys or secrets
- **Dependencies**: Keep dependencies updated
- **Vulnerabilities**: Report security issues privately
- **Best Practices**: Follow security best practices

## 🐛 Reporting Issues

### Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, etc.)
- Relevant logs or screenshots

### Feature Requests

Include:
- Clear description of the feature
- Use case and motivation
- Proposed implementation approach
- Examples of similar features

## 📞 Getting Help

- **Issues**: Create a GitHub issue for bugs or features
- **Discussions**: Use GitHub Discussions for questions
- **Security**: Email security@kubekavach.gensecai.org for security issues

## 🏆 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- Annual contributor highlights

## 📄 License

By contributing to KubeKavach, you agree that your contributions will be licensed under the Apache License 2.0.

---

Thank you for contributing to KubeKavach! 🛡️