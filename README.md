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

## 🔑 API Key Setup

KubeKavach uses API keys for authentication. Here's how to set them up:

### Generate a Secure API Key

```bash
# Option 1: Using OpenSSL (Recommended)
openssl rand -hex 32

# Option 2: Using UUID
uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]'

# Option 3: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Create Configuration

Create `~/.kubekavach/config.yaml` with your generated API key:

```yaml
kubeconfig: ~/.kube/config

api:
  port: 3000
  host: localhost

users:
  - username: admin
    apiKey: "your-generated-api-key-here"  # Replace with your key
    roles: ["admin", "scanner", "viewer"]
```

### Secure Your Configuration

```bash
chmod 600 ~/.kubekavach/config.yaml
```

📖 **[Detailed API Key Setup Guide](docs/API_KEY_SETUP.md)** | 🚀 **[5-Minute Quick Start](docs/QUICKSTART.md)**

## 🚀 Quick Start

### 1. Generate API Keys and Configure KubeKavach

```bash
# Generate a secure API key
API_KEY=$(openssl rand -hex 32)
echo "Your API Key: $API_KEY"

# Create config directory
mkdir -p ~/.kubekavach

# Create configuration file
cat > ~/.kubekavach/config.yaml << EOF
kubeconfig: ~/.kube/config

api:
  port: 3000
  host: localhost

users:
  - username: admin
    apiKey: "$API_KEY"
    roles: ["admin", "scanner", "viewer"]

ai:
  provider: openai
  apiKey: "$OPENAI_API_KEY"  # Optional: for AI remediation
  model: "gpt-4"
EOF

# Secure the config file
chmod 600 ~/.kubekavach/config.yaml
```

📖 **[Detailed API Key Setup Guide](docs/API_KEY_SETUP.md)**

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
kubekavach api

# In another terminal, start the UI (if running from source)
cd packages/ui
npm run dev

# Access dashboard at http://localhost:5173
# Enter your API key from the config file to authenticate
```

**Testing the API**:
```bash
# Test API health
curl http://localhost:3000/health

# Test authenticated endpoint
curl -H "x-api-key: $API_KEY" http://localhost:3000/rules
```

### 4. Replay Pod Locally

```bash
# Replay a pod for debugging
kubekavach replay -n production -p my-pod

# This will:
# 1. Fetch pod configuration
# 2. Pull container images
# 3. Recreate pod environment locally
# 4. Start containers with same config
# 5. Stream logs to console
```

## 🔐 Security & Authentication

### User Roles

KubeKavach supports role-based access control:

- **admin**: Full access to all operations
- **scanner**: Can perform scans and view results
- **viewer**: Read-only access to scan results

### Multiple Users

You can define multiple users in your configuration:

```yaml
users:
  - username: admin
    apiKey: "admin-key-here"
    roles: ["admin"]
    
  - username: ci-scanner
    apiKey: "ci-key-here"
    roles: ["scanner"]
    
  - username: developer
    apiKey: "dev-key-here"
    roles: ["viewer"]
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

### Complete Configuration Example

```yaml
# Kubernetes access
kubeconfig: ~/.kube/config

# API server configuration
api:
  port: 3000
  host: localhost
  corsOrigin: "http://localhost:5173"  # UI development server
  rateLimit:
    max: 1000
    timeWindow: "1 minute"

# User management
users:
  - username: admin
    apiKey: "your-32-character-hex-key"  # Generate with: openssl rand -hex 32
    roles: ["admin", "scanner", "viewer"]
  
  - username: ci-bot
    apiKey: "ci-specific-api-key"
    roles: ["scanner"]

# AI configuration (optional)
ai:
  provider: openai  # Options: openai, anthropic, google, ollama
  apiKey: "your-ai-provider-key"
  model: "gpt-4"

# Security rules
rules:
  enabled:
    - KKR001  # Privileged containers
    - KKR002  # Missing resource limits
    - KKR003  # Privilege escalation
    - KKR004  # Host network access
    - KKR005  # Host port binding
    - KKR006  # Read-only root filesystem
    - KKR007  # Service account tokens
    - KKR008  # Non-root user
    - KKR009  # Excessive capabilities

# Pod replay settings
replay:
  secretHandling: prompt  # Options: prompt, placeholder
```

### Environment Variables

```bash
# API Configuration
export KUBEKAVACH_API_PORT=3000
export KUBEKAVACH_API_HOST=0.0.0.0

# AI Provider (optional)
export KUBEKAVACH_AI_PROVIDER=openai
export KUBEKAVACH_AI_API_KEY=your-ai-key
export KUBEKAVACH_AI_MODEL=gpt-4

# Kubernetes Config
export KUBEKAVACH_KUBECONFIG_PATH=/path/to/kubeconfig
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

## 🛡️ Security Best Practices

### API Key Management

1. **Generate Strong Keys**
   ```bash
   # Always use cryptographically secure methods
   openssl rand -hex 32
   ```

2. **Rotate Keys Regularly**
   ```bash
   # Generate new key quarterly
   NEW_KEY=$(openssl rand -hex 32)
   # Update config and notify users
   ```

3. **Use Different Keys per Environment**
   ```bash
   # Development
   ~/.kubekavach/config.dev.yaml
   
   # Production
   ~/.kubekavach/config.prod.yaml
   ```

4. **Never Commit Keys**
   ```gitignore
   # Add to .gitignore
   *.apikey
   config.yaml
   .kubekavach/
   ```

### Kubernetes Security

1. **RBAC**: Use minimal permissions
   ```yaml
   # Example: Read-only ClusterRole for scanning
   apiVersion: rbac.authorization.k8s.io/v1
   kind: ClusterRole
   metadata:
     name: kubekavach-scanner
   rules:
   - apiGroups: [""]
     resources: ["pods", "services", "configmaps"]
     verbs: ["get", "list"]
   ```

2. **Network Policies**: Restrict API access
3. **TLS**: Always use HTTPS in production
4. **Secrets**: Use secret management tools (Vault, AWS Secrets Manager)

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

## 📚 Documentation

### Getting Started
- [Quick Start Guide](docs/QUICKSTART.md) - Get running in 5 minutes
- [API Key Setup](docs/API_KEY_SETUP.md) - Detailed authentication guide
- [Deployment Guide](DEPLOYMENT.md) - Production deployment options

### Reference
- [CLI Commands](docs/CLI.md) - Complete CLI reference
- [API Documentation](docs/API.md) - REST API endpoints
- [Security Rules](docs/RULES.md) - Rule descriptions and examples

### Development
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Architecture](docs/ARCHITECTURE.md) - System design
- [Testing](docs/TESTING.md) - Test suite documentation

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

For enterprise support, custom rules, and professional services, contact us at [enterprise@kubekavach.gensecai.org](mailto:enterprise@kubekavach.gensecai.org).

---

**KubeKavach** - Securing Kubernetes, one cluster at a time. 🛡️