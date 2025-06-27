# KubeKavach

**Production-grade Kubernetes security scanner with local pod replay capabilities**

KubeKavach is a comprehensive security tool designed to identify vulnerabilities and misconfigurations in Kubernetes clusters. It provides real-time security scanning, local pod debugging capabilities, and AI-powered remediation suggestions.

## 🚀 Features

- **Comprehensive Security Scanning**: 9 built-in security rules covering critical attack vectors
- **Local Pod Replay**: Debug production pods locally using Docker
- **AI-Powered Remediation**: Intelligent suggestions for fixing security issues
- **REST API**: Full-featured API with authentication and authorization
- **Web Dashboard**: Modern UI for visualizing scan results
- **Multi-Provider AI Support**: OpenAI, Anthropic, Google AI, and Ollama
- **Extensible Rule Engine**: Easy to add custom security rules
- **Production Ready**: Comprehensive error handling and logging

## 📋 Security Rules

| Rule ID | Name | Severity | Category |
|---------|------|----------|----------|
| KKR001 | Privileged Container | CRITICAL | Pod Security |
| KKR002 | Missing Resource Limits | MEDIUM | Resource Management |
| KKR003 | Allow Privilege Escalation | HIGH | Pod Security |
| KKR004 | Host Network Access | HIGH | Network Security |
| KKR005 | Host Port Binding | MEDIUM | Network Security |
| KKR006 | Read-Only Root Filesystem | MEDIUM | Container Security |
| KKR007 | Service Account Token Auto-Mount | MEDIUM | RBAC |
| KKR008 | Run as Non-Root User | HIGH | Container Security |
| KKR009 | Excessive Capabilities | HIGH | Container Security |

## 🛠 Installation

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- Docker (for pod replay)
- kubectl (configured with cluster access)

### Quick Install

```bash
git clone https://github.com/gensecaihq/kubekavach.git
cd kubekavach
npm install
npm run build
```

### Global CLI Installation

```bash
npm install -g kubekavach
```

## 🚀 Quick Start

### 1. Configure KubeKavach

```bash
# Set up basic configuration
kubekavach config set api.port 3000
kubekavach config set ai.provider openai
kubekavach config set ai.apiKey $OPENAI_API_KEY

# Add API users for web dashboard
kubekavach config set users '[{"username":"admin","apiKey":"your-secure-api-key","roles":["scanner","viewer"]}]'
```

### 2. Scan Your Cluster

```bash
# Scan entire cluster
kubekavach scan

# Scan specific namespace
kubekavach scan -n production

# Use custom kubeconfig
kubekavach scan --kubeconfig /path/to/config
```

### 3. Start Web Dashboard

```bash
# Start API server
kubekavach api &

# Access dashboard at http://localhost:3000
curl -H "x-api-key: your-secure-api-key" http://localhost:3000/health
```

### 4. Replay Pod Locally

```bash
# Replay a pod for debugging
kubekavach replay -n production -p my-pod

# This will:
# 1. Fetch pod configuration
# 2. Create local Docker container
# 3. Start with same environment
```

## 📊 API Usage

### Start API Server

```bash
kubekavach api
```

### Trigger Security Scan

```bash
curl -X POST \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "production"}' \
  http://localhost:3000/scan
```

### Get Scan Results

```bash
curl -H "x-api-key: your-api-key" \
  http://localhost:3000/scan/results/{job-id}
```

## 🔧 Configuration

KubeKavach stores configuration in `~/.kubekavach/config.yaml` with secure permissions (600).

### Environment Variables

```bash
# API Configuration
export KUBEKAVACH_API_KEY="your-secure-api-key"
export KUBEKAVACH_AI_API_KEY="your-ai-api-key"
export KUBEKAVACH_AI_PROVIDER="openai"
export KUBEKAVACH_KUBECONFIG_PATH="/path/to/kubeconfig"
```

### Configuration File Example

```yaml
api:
  port: 3000
  host: "0.0.0.0"
  corsOrigin: "http://localhost:3000"
  rateLimit:
    max: 1000
    timeWindow: "1 minute"

ai:
  provider: "openai"
  model: "gpt-4"

replay:
  secretHandling: "prompt"

users:
  - username: "admin"
    apiKey: "secure-api-key-here"
    roles: ["scanner", "viewer"]
```

## 🐳 Docker Deployment

```bash
# Build Docker image
docker build -t kubekavach .

# Run with environment variables
docker run -d \
  -p 3000:3000 \
  -e KUBEKAVACH_API_KEY=your-api-key \
  -v ~/.kube:/root/.kube:ro \
  kubekavach
```

## ☸️ Kubernetes Deployment

```bash
# Deploy using Helm
helm install kubekavach ./helm/kubekavach \
  --set api.apiKey=your-secure-api-key \
  --set ai.provider=openai \
  --set ai.apiKey=your-openai-key
```

## 🔐 Security Best Practices

1. **API Keys**: Always use environment variables for sensitive data
2. **RBAC**: Configure minimal required permissions
3. **Network**: Use network policies to restrict access
4. **TLS**: Enable TLS in production environments
5. **Secrets**: Use Kubernetes secrets for sensitive configuration

## 📚 Architecture

KubeKavach follows a modular monorepo architecture:

```
packages/
├── cli/          # Command-line interface
├── core/         # Shared types and utilities
├── rules/        # Security rule engine
├── replay/       # Pod replay functionality
├── api/          # REST API server
├── ui/           # Web dashboard
└── ai/           # AI provider integrations
```

## 🧪 Development

```bash
# Install dependencies
npm install

# Start development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run typecheck
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/gensecaihq/kubekavach/issues)
- **Documentation**: [Full Documentation](./docs/README.md)
- **Security**: See [VULNERABILITY.md](VULNERABILITY.md) for security issues

## 🏆 Enterprise Support

For enterprise support, custom rules, and professional services, contact us at [enterprise@kubekavach.io](mailto:enterprise@kubekavach.io).

---

**KubeKavach** - Securing Kubernetes, one cluster at a time. 🛡️