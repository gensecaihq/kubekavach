# KubeKavach Architecture Documentation

## Executive Summary

KubeKavach is a comprehensive Kubernetes security scanner with local pod replay capabilities. The system follows a modular monorepo architecture built on Node.js/TypeScript, providing security scanning, AI-powered remediation, REST API services, web dashboard, and local debugging capabilities.

## System Overview

### Core Concept
KubeKavach addresses two primary use cases:
1. **Security Scanning**: Identify vulnerabilities and misconfigurations in Kubernetes clusters
2. **Local Pod Replay**: Debug production pods locally using Docker containers

### Key Features
- 9 built-in security rules covering critical attack vectors
- Multi-provider AI integration (OpenAI, Anthropic, Google AI, Ollama)
- REST API with role-based access control
- Modern web dashboard built with SvelteKit
- Local pod debugging with Docker integration
- Extensible rule engine architecture

## Architecture Components

### 1. Monorepo Structure

```
kubekavach/
├── packages/
│   ├── core/           # Shared types, utilities, and configurations
│   ├── cli/            # Command-line interface using OCLIF
│   ├── api/            # REST API server using Fastify
│   ├── rules/          # Security rule engine
│   ├── replay/         # Pod replay functionality
│   ├── ai/             # AI provider integrations
│   └── ui/             # Web dashboard using SvelteKit
├── deployment/         # Kubernetes deployment manifests
├── helm/              # Helm charts
└── docs/              # Documentation
```

### 2. Technology Stack

#### Backend Technologies
- **Runtime**: Node.js 18+ with TypeScript 5.3+
- **Package Manager**: PNPM with workspace configuration
- **Build System**: Turbo (monorepo build orchestration) + TSUP (TypeScript bundler)
- **API Framework**: Fastify 4.x with plugins for CORS, Helmet, Swagger
- **CLI Framework**: OCLIF 3.x for command-line interface
- **Kubernetes Client**: @kubernetes/client-node for K8s API interactions
- **Container Runtime**: Dockerode for Docker integration
- **Validation**: Zod for runtime type validation

#### Frontend Technologies
- **Framework**: SvelteKit 2.x with Svelte 4.x
- **Styling**: TailwindCSS 3.x with Autoprefixer
- **Build Tool**: Vite 5.x
- **Charts**: Chart.js 4.x for data visualization
- **Date Handling**: date-fns for date formatting

#### AI Integration
- **OpenAI**: Official OpenAI SDK for GPT models
- **Anthropic**: Anthropic SDK for Claude models
- **Google AI**: Google Generative AI SDK for Gemini
- **Ollama**: Local LLM integration for on-premise deployments

#### Development & DevOps
- **Testing**: Vitest for unit testing
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier with Svelte plugin
- **Git Hooks**: Husky + lint-staged
- **Container**: Multi-stage Docker builds with Alpine Linux
- **Orchestration**: Docker Compose and Kubernetes manifests

### 3. Data Flow Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  User Interface │    │   API Gateway   │    │  Core Services  │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ CLI Tool        │───▶│ Authentication  │───▶│ Security Scanner│
│ Web Dashboard   │    │ Rate Limiting   │    │ Rule Engine     │
│ API Clients     │    │ CORS/Security   │    │ Pod Replay      │
└─────────────────┘    └─────────────────┘    │ AI Integration  │
                                              └─────────────────┘
                                                       │
                                              ┌─────────────────┐
                                              │ External Systems│
                                              ├─────────────────┤
                                              │ Kubernetes API  │
                                              │ Docker Daemon   │
                                              │ AI Providers    │
                                              └─────────────────┘
```

## Package Details

### Core Package (`@kubekavach/core`)

**Purpose**: Shared foundation for all other packages

**Key Components**:
- **Type Definitions**: TypeScript interfaces for all data structures
- **Configuration Management**: Zod schemas for configuration validation
- **Kubernetes Scanner**: Main scanning logic with cluster connectivity
- **Utilities**: Common helper functions and constants
- **Observability**: Logging and monitoring infrastructure

**Key Files**:
- `src/types/`: TypeScript type definitions
- `src/utils/scanner.ts`: Main Kubernetes scanning logic
- `src/utils/config-loader.ts`: Configuration management
- `src/constants.ts`: System constants and defaults

**Dependencies**:
- `@kubernetes/client-node`: Kubernetes API client
- `zod`: Runtime type validation
- `js-yaml`: YAML parsing for configurations
- `fs-extra`: Enhanced file system operations

### CLI Package (`@kubekavach/cli`)

**Purpose**: Command-line interface for all KubeKavach functionality

**Key Components**:
- **Commands**: Individual CLI commands with OCLIF framework
- **Interactive Prompts**: User-friendly configuration and input
- **Output Formatting**: Tables, JSON, and human-readable formats
- **Global Options**: Shared flags and configuration

**Available Commands**:
- `scan`: Security scanning with namespace and rule filtering
- `replay`: Pod replay with local Docker containers
- `config`: Configuration management (get/set operations)
- `api`: API server startup with configuration options
- `rules`: Rule listing and filtering

**Key Files**:
- `src/commands/`: Individual command implementations
- `src/hooks/`: OCLIF hooks for initialization
- `bin/run.js`: CLI entry point

**Dependencies**:
- `@oclif/core`: CLI framework foundation
- `inquirer`: Interactive command-line prompts
- `cli-table3`: Table formatting for output
- `chalk`: Terminal text styling

### API Package (`@kubekavach/api`)

**Purpose**: REST API server with comprehensive security features

**Key Components**:
- **Fastify Server**: High-performance HTTP server
- **Authentication**: API key-based authentication with role-based authorization
- **Security Middleware**: CORS, Helmet, rate limiting
- **Swagger Documentation**: Interactive API documentation
- **Asynchronous Scanning**: Job-based scanning with result polling

**API Endpoints**:
- `GET /health`: Health check endpoint
- `GET /rules`: List available security rules
- `POST /scan`: Initiate security scan
- `GET /scan/results/:jobId`: Retrieve scan results
- `GET /documentation`: Swagger UI

**Key Files**:
- `src/server.ts`: Main server setup and routing
- `src/middleware/`: Custom middleware functions
- `src/schemas/`: Request/response validation schemas

**Dependencies**:
- `fastify`: Web framework
- `@fastify/cors`: CORS support
- `@fastify/helmet`: Security headers
- `@fastify/swagger`: API documentation
- `@fastify/rate-limit`: Rate limiting

### Rules Package (`@kubekavach/rules`)

**Purpose**: Security rule engine with extensible rule definitions

**Key Components**:
- **Rule Engine**: Core validation logic and finding generation
- **Security Rules**: 9 built-in rules covering major attack vectors
- **Rule Categories**: Organized by security domain
- **Severity Levels**: CRITICAL, HIGH, MEDIUM, LOW classifications

**Security Rules**:
- **KKR001**: Privileged Container (CRITICAL)
- **KKR002**: Missing Resource Limits (MEDIUM)
- **KKR003**: Allow Privilege Escalation (HIGH)
- **KKR004**: Host Network Access (HIGH)
- **KKR005**: Host Port Binding (MEDIUM)
- **KKR006**: Read-Only Root Filesystem (MEDIUM)
- **KKR007**: Service Account Token Auto-Mount (MEDIUM)
- **KKR008**: Run as Non-Root User (HIGH)
- **KKR009**: Excessive Capabilities (HIGH)

**Key Files**:
- `src/rules/pod-security.ts`: Pod-level security rules
- `src/rules/network-security.ts`: Network-related rules
- `src/rules/rbac-security.ts`: RBAC and service account rules
- `src/index.ts`: Rule registry and exports

### Replay Package (`@kubekavach/replay`)

**Purpose**: Local pod debugging with Docker container recreation

**Key Components**:
- **Pod Fetching**: Kubernetes API integration to retrieve pod specifications
- **Container Recreation**: Docker API integration for local container execution
- **Environment Mapping**: Security context and environment variable handling
- **Log Streaming**: Real-time log output from replayed containers

**Workflow**:
1. Connect to Kubernetes cluster
2. Fetch target pod specification
3. Transform pod spec to Docker configuration
4. Pull required container images
5. Create and start local containers
6. Stream logs and provide debugging access
7. Clean up containers after use

**Key Files**:
- `src/index.ts`: Main PodReplayer class
- `src/docker-manager.ts`: Docker container management
- `src/pod-transformer.ts`: Pod-to-Docker configuration transformation

**Dependencies**:
- `dockerode`: Docker daemon API client
- `@kubernetes/client-node`: Kubernetes API access

### AI Package (`@kubekavach/ai`)

**Purpose**: Multi-provider AI integration for remediation suggestions

**Key Components**:
- **Provider Abstraction**: Common interface for all AI providers
- **Multi-Provider Support**: OpenAI, Anthropic, Google AI, Ollama
- **Remediation Generation**: Context-aware security fix suggestions
- **Error Handling**: Graceful fallbacks and error recovery

**AI Providers**:
- **OpenAI**: GPT-3.5/GPT-4 integration for cloud-based suggestions
- **Anthropic**: Claude model integration for enhanced reasoning
- **Google AI**: Gemini model support for Google Cloud environments
- **Ollama**: Local LLM support for on-premise deployments

**Key Files**:
- `src/providers/`: Individual AI provider implementations
- `src/index.ts`: Provider factory and common interfaces
- `src/types.ts`: AI-specific type definitions

**Dependencies**:
- `openai`: OpenAI official SDK
- `@anthropic-ai/sdk`: Anthropic Claude SDK
- `@google/generative-ai`: Google AI SDK
- `ollama`: Ollama local LLM client

### UI Package (`@kubekavach/ui`)

**Purpose**: Modern web dashboard for security visualization and management

**Key Components**:
- **SvelteKit Application**: Server-side rendering with client-side hydration
- **Real-time Scanning**: Asynchronous scan initiation and result polling
- **Data Visualization**: Charts and tables for security findings
- **Responsive Design**: Mobile-friendly interface with TailwindCSS

**Features**:
- **Dashboard Overview**: Scan summaries and security metrics
- **Interactive Scanning**: Namespace selection and rule filtering
- **Results Visualization**: Severity distribution charts and finding tables
- **API Integration**: Direct connection to KubeKavach API

**Key Files**:
- `src/routes/+page.svelte`: Main dashboard page
- `src/lib/`: Reusable Svelte components
- `src/app.html`: Application template

**Dependencies**:
- `@sveltejs/kit`: SvelteKit framework
- `svelte`: Svelte component framework
- `tailwindcss`: Utility-first CSS framework
- `chart.js`: Data visualization library

## Security Architecture

### Authentication & Authorization

**API Key Authentication**:
- 32-character cryptographically secure API keys
- Header-based authentication (`X-API-Key`)
- Configurable user management with roles

**Role-Based Access Control**:
- **viewer**: Read-only access to scan results
- **scanner**: Full access including scan initiation
- **admin**: Administrative access (future expansion)

**Security Headers**:
```typescript
{
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'",
  'X-XSS-Protection': '1; mode=block'
}
```

### Configuration Security

**File Permissions**:
- Configuration files: 600 (owner read/write only)
- Directories: 700 (owner access only)
- Automatic permission enforcement

**Secret Management**:
- API keys automatically redacted in logs
- Environment variable support for sensitive data
- Optional integration with external secret managers

### Network Security

**CORS Configuration**:
- Configurable allowed origins
- Strict method and header controls
- Preflight request handling

**Rate Limiting**:
- Configurable requests per time window
- IP-based rate limiting
- Automatic rate limit header inclusion

## Data Models

### Core Types

```typescript
interface Finding {
  ruleId: string;
  ruleName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  resource: {
    kind: string;
    name: string;
    namespace?: string;
  };
  message: string;
  remediation?: string;
}

interface ScanResult {
  id: string;
  timestamp: string;
  cluster: string;
  namespace?: string;
  duration: number;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: Finding[];
}

interface User {
  username: string;
  apiKey: string;
  roles: string[];
}
```

### Configuration Schema

```typescript
interface KubeKavachConfig {
  kubeconfig?: string;
  api?: {
    port: number;
    host: string;
    corsOrigin: string;
    rateLimit: {
      max: number;
      timeWindow: string;
    };
  };
  users: User[];
  ai?: {
    provider: 'openai' | 'anthropic' | 'google' | 'ollama';
    apiKey?: string;
    model: string;
  };
  rules?: {
    enabled: string[];
  };
}
```

## Deployment Architecture

### Container Strategy

**Multi-stage Docker Build**:
1. **Build Stage**: Node.js with full development dependencies
2. **Production Stage**: Alpine Linux with minimal runtime dependencies
3. **Security**: Non-root user execution with minimal attack surface

**Image Optimization**:
- Layer caching for dependency installation
- Multi-architecture support (amd64/arm64)
- Security scanning integration

### Kubernetes Deployment

**Deployment Patterns**:
- **Standalone**: Single pod deployment for development
- **High Availability**: Multi-replica deployment with load balancing
- **Microservices**: Separate deployments for API, UI, and scanning components

**Security Considerations**:
- Pod Security Standards enforcement
- Network policies for traffic restriction
- Service account with minimal RBAC permissions
- Secrets management for API keys and configurations

**Helm Chart Features**:
- Configurable resource limits and requests
- Ingress configuration with TLS support
- ConfigMap and Secret management
- Health check and readiness probe configuration

### Development Architecture

**Local Development**:
```bash
# Development workflow
pnpm install          # Install dependencies
pnpm build           # Build all packages
pnpm dev             # Start development servers
pnpm test            # Run test suite
```

**Docker Compose**:
- Multi-service local development environment
- Automatic service discovery and networking
- Volume mounting for hot reload development
- Database and external service mocking

## Integration Patterns

### Kubernetes Integration

**API Access**:
- Official Kubernetes client library usage
- Automatic kubeconfig discovery and loading
- Support for multiple authentication methods
- Graceful handling of API server connectivity issues

**Resource Scanning**:
- Efficient batch processing of Kubernetes resources
- Support for namespace filtering and resource type selection
- Handling of large clusters with pagination
- Resource watching for real-time updates (future feature)

### CI/CD Integration

**Pipeline Integration**:
```yaml
# Example GitHub Actions integration
- name: Security Scan
  run: |
    kubekavach scan --namespace staging --format json > results.json
    # Process results and fail pipeline if critical issues found
```

**Automation Features**:
- JSON output format for programmatic processing
- Exit codes for CI/CD decision making
- Webhook support for result notifications
- Integration with policy engines (OPA, Gatekeeper)

## Performance Considerations

### Scanning Performance

**Optimization Strategies**:
- Concurrent rule evaluation for parallel processing
- Efficient Kubernetes API batching
- Memory-efficient resource processing
- Configurable scan timeouts and retries

**Scalability**:
- Horizontal scaling support for large clusters
- Resource-based scanning limits
- Asynchronous job processing for web interface
- Result caching for repeated scans

### Resource Management

**Memory Usage**:
- Streaming JSON parsing for large API responses
- Garbage collection optimization
- Memory leak prevention in long-running scans
- Configurable memory limits

**Network Efficiency**:
- Connection pooling for Kubernetes API
- Compression support for large payloads
- Intelligent retry mechanisms with backoff
- Timeout configuration for reliability

## Monitoring & Observability

### Logging

**Structured Logging**:
- JSON format with Pino for performance
- Configurable log levels
- Request/response logging with sensitive data redaction
- Error tracking with stack traces

**Log Categories**:
- Authentication events
- Scan operations and results
- API request/response cycles
- System health and performance metrics

### Metrics (Future Enhancement)

**Application Metrics**:
- Scan duration and throughput
- API request rates and error rates
- Rule execution performance
- Resource consumption patterns

**Business Metrics**:
- Security finding trends
- Rule effectiveness analysis
- User engagement patterns
- Cluster coverage statistics

## Future Architecture Enhancements

### Planned Features

**Multi-Cluster Support**:
- Centralized scanning across multiple clusters
- Cluster-specific configuration and rules
- Aggregated reporting and analytics
- Cross-cluster security policy enforcement

**Policy as Code Integration**:
- Open Policy Agent (OPA) integration
- Custom policy definition support
- Policy violation reporting
- Admission controller integration

**Enhanced AI Capabilities**:
- Context-aware remediation suggestions
- Security trend analysis
- Automated fix generation
- Custom rule generation from AI insights

### Scalability Improvements

**Distributed Architecture**:
- Microservices decomposition for large-scale deployments
- Message queue integration for asynchronous processing
- Caching layer for improved performance
- Database integration for persistent storage

**Enterprise Features**:
- Multi-tenancy support
- Advanced RBAC with SSO integration
- Audit logging and compliance reporting
- Custom branding and white-labeling

## Security Considerations

### Threat Model

**Attack Vectors**:
- Unauthorized API access through API key compromise
- Configuration tampering through file system access
- Network-based attacks on API endpoints
- Container escape through privilege escalation

**Mitigation Strategies**:
- Secure API key generation and rotation
- File system permission enforcement
- Network segmentation and firewall rules
- Container security hardening

### Compliance

**Security Standards**:
- CIS Kubernetes Benchmark alignment
- NIST Cybersecurity Framework mapping
- SOC 2 Type II compliance preparation
- GDPR data protection considerations

## Conclusion

KubeKavach demonstrates a well-architected, production-ready system that successfully balances functionality, security, and maintainability. The modular monorepo approach enables independent development and deployment of components while maintaining strong type safety and shared functionality.

The architecture provides excellent extensibility for future enhancements while maintaining backward compatibility and operational simplicity. The comprehensive security model, multi-provider AI integration, and flexible deployment options make KubeKavach suitable for organizations of all sizes.

For technical support and architecture questions, visit: https://kubekavach.gensecai.org