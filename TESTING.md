# Testing Documentation for KubeKavach

## Overview

KubeKavach uses **Vitest** as the primary testing framework across all packages. This document provides comprehensive information about the testing setup, patterns, and best practices used in the project.

## Testing Framework & Setup

### Testing Stack
- **Framework**: Vitest (v1.2.0)
- **Mocking**: Built-in Vitest mocking capabilities
- **HTTP Testing**: Fastify inject for API testing
- **TypeScript**: Full TypeScript support in tests
- **Test Runner**: Turbo for orchestrated test execution

### Test Structure
The project follows a modular testing approach with tests organized per package:

```
kubekavach/
├── packages/
│   ├── cli/src/test/
│   │   ├── commands/           # Command-specific tests
│   │   ├── e2e/               # End-to-end tests
│   │   └── commands.test.ts   # General command tests
│   ├── core/src/test/
│   │   └── scanner.test.ts    # Core scanner tests
│   ├── rules/src/test/
│   │   └── pod-security.test.ts # Security rules tests
│   ├── api/src/test/
│   │   └── server.test.ts     # API server tests
│   ├── ai/src/test/
│   │   └── providers.test.ts  # AI provider tests
│   └── replay/src/test/
│       └── replayer.test.ts   # Pod replay tests
```

## Running Tests

### All Tests
```bash
# Run all tests across all packages
npm test
# or
pnpm test
# or using turbo directly
turbo test
```

### Package-Specific Tests
```bash
# Run tests for a specific package
cd packages/rules && npm run test
cd packages/api && npm run test
cd packages/cli && npm run test
```

### Watch Mode
```bash
# Run tests in watch mode (for development)
cd packages/rules && npm run test -- --watch
```

### Coverage
```bash
# Run tests with coverage
cd packages/rules && npm run test -- --coverage
```

## Test Patterns & Best Practices

### 1. Test File Naming
- Unit tests: `*.test.ts`
- End-to-end tests: `e2e/*.test.ts`
- Test files should be co-located with source code or in dedicated `test/` directories

### 2. Test Structure Template
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Component/Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('specific functionality', () => {
    it('should behave as expected', () => {
      // Arrange
      const input = 'test-input';
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe('expected-output');
    });
  });
});
```

### 3. Mocking Patterns

#### Module Mocking
```typescript
// Mock external dependencies
vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn().mockImplementation(() => ({
    loadFromDefault: vi.fn(),
    makeApiClient: vi.fn().mockReturnValue({
      listPodForAllNamespaces: vi.fn().mockResolvedValue({
        body: { items: [] }
      })
    })
  }))
}));
```

#### Function Mocking
```typescript
// Mock specific functions
const mockScan = vi.fn().mockResolvedValue({
  summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
  findings: []
});

vi.mock('@kubekavach/core', () => ({
  KubernetesScanner: vi.fn().mockImplementation(() => ({
    scan: mockScan
  }))
}));
```

### 4. Async Testing
```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

it('should handle promise rejections', async () => {
  await expect(failingAsyncFunction())
    .rejects.toThrow('Expected error message');
});
```

### 5. Error Handling Tests
```typescript
it('should handle errors gracefully', async () => {
  // Mock to throw an error
  mockApiCall.mockRejectedValue(new Error('API Error'));
  
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  
  await expect(functionUnderTest())
    .rejects.toThrow('API Error');
    
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});
```

## Package-Specific Testing Details

### CLI Package Tests
**Location**: `packages/cli/src/test/`
**Features Tested**:
- Command execution and argument parsing
- Kubernetes API integration
- Output formatting (JSON, table)
- Error handling and user feedback
- End-to-end CLI workflows

**Key Test Files**:
- `commands.test.ts` - Tests all CLI commands
- `commands/scan.test.ts` - Detailed scan command tests
- `e2e/cli.test.ts` - End-to-end integration tests

**Example Test**:
```typescript
it('should run scan with namespace filter', async () => {
  const scan = new Scan(['--namespace', 'test-ns'], config);
  const logSpy = vi.spyOn(scan, 'log');

  await scan.run();

  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining('Scanning namespace: test-ns')
  );
});
```

### Core Package Tests
**Location**: `packages/core/src/test/`
**Features Tested**:
- Kubernetes scanner functionality
- Configuration loading
- Rule processing
- Error handling
- Performance

**Key Test Files**:
- `scanner.test.ts` - Core scanner functionality

**Example Test**:
```typescript
it('should scan all namespaces when no namespace specified', async () => {
  const result = await scanner.scan();

  expect(result.summary.total).toBe(2);
  expect(result.findings).toHaveLength(2);
});
```

### Rules Package Tests
**Location**: `packages/rules/src/test/`
**Features Tested**:
- Security rule validation logic
- Rule finding generation
- Pod security context checks
- Resource limit validation
- RBAC security rules

**Key Test Files**:
- `pod-security.test.ts` - Security rules validation

**Example Test**:
```typescript
it('should fail for privileged containers', () => {
  const pod = createMockPod({ privileged: true });
  
  expect(privilegedContainerRule.validate(pod)).toBe(false);
  
  const finding = privilegedContainerRule.getFinding(pod);
  expect(finding.severity).toBe('CRITICAL');
});
```

### API Package Tests
**Location**: `packages/api/src/test/`
**Features Tested**:
- REST API endpoints
- Authentication and authorization
- Request/response validation
- Error handling
- CORS and security headers

**Key Test Files**:
- `server.test.ts` - API server functionality

**Example Test**:
```typescript
it('should return health status', async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/health'
  });

  expect(response.statusCode).toBe(200);
  const body = JSON.parse(response.body);
  expect(body.status).toBe('ok');
});
```

### AI Package Tests
**Location**: `packages/ai/src/test/`
**Features Tested**:
- AI provider integrations (OpenAI, Anthropic, Google AI, Ollama)
- Remediation generation
- Error handling for API failures
- Configuration validation

**Key Test Files**:
- `providers.test.ts` - AI provider functionality

**Example Test**:
```typescript
it('should generate remediation for finding', async () => {
  const remediation = await provider.generateRemediation(mockFinding);
  
  expect(remediation).toBe(
    'Set securityContext.privileged to false in your pod specification'
  );
});
```

### Replay Package Tests
**Location**: `packages/replay/src/test/`
**Features Tested**:
- Pod replay functionality
- Docker container management
- Log collection
- Error handling
- Resource cleanup

**Key Test Files**:
- `replayer.test.ts` - Pod replay functionality

**Example Test**:
```typescript
it('should replay a pod successfully', async () => {
  const result = await replayer.replay('test-pod', 'default');

  expect(result.success).toBe(true);
  expect(result.containerId).toBe('test-container-123');
  expect(result.logs).toContain('Container started successfully');
});
```

## Test Configuration

### Vitest Configuration
Tests are configured via package.json scripts in each package:

```json
{
  "scripts": {
    "test": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.2.0"
  }
}
```

### Turbo Configuration
The monorepo uses Turbo for coordinated test execution:

```json
{
  "pipeline": {
    "test": {
      "dependsOn": ["build"],
      "env": ["NODE_ENV"],
      "outputs": ["coverage/**"]
    }
  }
}
```

## Writing New Tests

### 1. Unit Tests
Create unit tests for individual functions or classes:

```typescript
// packages/[package]/src/test/[feature].test.ts
import { describe, it, expect } from 'vitest';
import { functionToTest } from '../path/to/function';

describe('functionToTest', () => {
  it('should return expected result for valid input', () => {
    const result = functionToTest('valid-input');
    expect(result).toBe('expected-output');
  });

  it('should throw error for invalid input', () => {
    expect(() => functionToTest('invalid-input'))
      .toThrow('Expected error message');
  });
});
```

### 2. Integration Tests
Create integration tests for feature interactions:

```typescript
describe('Feature Integration', () => {
  it('should integrate components correctly', async () => {
    // Setup multiple components
    const scanner = new KubernetesScanner();
    const rules = await loadRules();
    
    // Test integration
    const result = await scanner.scan();
    
    // Verify integrated behavior
    expect(result.findings).toBeDefined();
  });
});
```

### 3. E2E Tests
Create end-to-end tests for complete workflows:

```typescript
describe('CLI E2E Tests', () => {
  it('should run complete scan workflow', async () => {
    const { stdout } = await execa(cliPath, ['scan', '--namespace', 'default']);
    
    expect(stdout).toContain('Scan completed');
  });
});
```

## Best Practices for Testing

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` for setup and `afterEach` for cleanup
- Clear mocks between tests

### 2. Descriptive Test Names
- Use descriptive test names that explain the expected behavior
- Follow the pattern: "should [expected behavior] when [condition]"

### 3. Arrange-Act-Assert Pattern
```typescript
it('should validate pod security context', () => {
  // Arrange
  const pod = createMockPod({ privileged: true });
  
  // Act
  const isValid = rule.validate(pod);
  
  // Assert
  expect(isValid).toBe(false);
});
```

### 4. Mock External Dependencies
- Mock all external APIs and services
- Use realistic mock data
- Test error scenarios with mocked failures

### 5. Test Edge Cases
- Test with empty inputs
- Test with invalid inputs
- Test error conditions
- Test boundary conditions

### 6. Performance Testing
```typescript
it('should complete scan within reasonable time', async () => {
  const startTime = Date.now();
  await scanner.scan();
  const duration = Date.now() - startTime;
  
  expect(duration).toBeLessThan(5000); // 5 seconds
});
```

## Test Coverage

### Coverage Goals
- **Unit Tests**: 80%+ line coverage
- **Integration Tests**: Cover critical user workflows
- **E2E Tests**: Cover main CLI commands and API endpoints

### Checking Coverage
```bash
# Run tests with coverage report
cd packages/[package] && npm run test -- --coverage

# Generate HTML coverage report
cd packages/[package] && npm run test -- --coverage --reporter=html
```

## Continuous Integration

Tests are automatically run in CI/CD pipeline:
- All tests must pass before merging
- Coverage reports are generated
- Integration tests run against mock environments

## Debugging Tests

### Running Single Test
```bash
# Run a specific test file
npm run test -- scanner.test.ts

# Run a specific test case
npm run test -- --grep "should scan all namespaces"
```

### Debug Mode
```bash
# Run tests with debug output
npm run test -- --reporter=verbose

# Run tests in Node.js debug mode
node --inspect-brk ./node_modules/.bin/vitest
```

## Common Testing Utilities

### Mock Helpers
```typescript
// Helper to create mock Kubernetes resources
const createMockPod = (overrides = {}) => ({
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: { name: 'test-pod', namespace: 'default' },
  spec: {
    containers: [{
      name: 'app',
      image: 'nginx:latest',
      ...overrides
    }]
  }
});

// Helper to create mock scanner results
const createMockScanResult = (findings = []) => ({
  summary: {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'CRITICAL').length,
    high: findings.filter(f => f.severity === 'HIGH').length,
    medium: findings.filter(f => f.severity === 'MEDIUM').length,
    low: findings.filter(f => f.severity === 'LOW').length
  },
  findings,
  timestamp: new Date().toISOString(),
  cluster: 'test-cluster',
  duration: 100
});
```

## Troubleshooting

### Common Issues

1. **Mock not working**: Ensure mocks are defined before imports
2. **Async test hanging**: Use proper async/await or return promises
3. **Module resolution**: Check import paths and module structure
4. **TypeScript errors**: Ensure test types are properly configured

### Solutions

```typescript
// Fix mock timing issues
vi.mock('./module', () => ({ 
  default: vi.fn() 
}));

// Fix async test timeouts
it('should handle async operation', async () => {
  await asyncOperation();
}, 10000); // Increase timeout

// Fix module path issues
import { someFunction } from '../../../src/utils/helper';
```

This comprehensive testing documentation provides all the information needed to understand, maintain, and extend the test suite for KubeKavach. The testing setup is well-structured with clear patterns and good coverage across all packages.