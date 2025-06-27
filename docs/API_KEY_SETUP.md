# KubeKavach API Key Setup Guide

This guide explains how to generate and configure API keys for KubeKavach.

## Understanding API Keys in KubeKavach

KubeKavach uses API keys for:
- **Authentication**: Verifying the identity of API clients
- **Authorization**: Controlling access to different features based on user roles
- **Security**: Protecting the API server from unauthorized access

## Step 1: Generate Secure API Keys

### Option A: Using OpenSSL (Recommended)

```bash
# Generate a 32-byte secure random key
openssl rand -hex 32

# Example output: 
# a4f8c2d5e7b9f0a3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e6f9a2b5
```

### Option B: Using UUID

```bash
# Generate a UUID-based key
uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]'

# Example output:
# 550e8400e29b41d4a716446655440000
```

### Option C: Using Node.js

```bash
# Generate using Node.js crypto
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 2: Create Configuration File

Create the KubeKavach configuration directory and file:

```bash
# Create config directory
mkdir -p ~/.kubekavach

# Create config file
touch ~/.kubekavach/config.yaml

# Set secure permissions (important!)
chmod 600 ~/.kubekavach/config.yaml
```

## Step 3: Configure Users and API Keys

Edit `~/.kubekavach/config.yaml`:

```yaml
# Kubernetes Configuration
kubeconfig: ~/.kube/config

# API Server Configuration
api:
  port: 3000
  host: localhost
  corsOrigin: "http://localhost:5173"  # UI development server
  rateLimit:
    max: 1000
    timeWindow: "1 minute"

# User Configuration
users:
  # Admin user - full access
  - username: admin
    apiKey: "YOUR_GENERATED_API_KEY_HERE"  # Replace with your generated key
    roles: ["admin", "scanner", "viewer"]
  
  # Scanner user - can perform scans
  - username: scanner
    apiKey: "ANOTHER_GENERATED_API_KEY"
    roles: ["scanner", "viewer"]
  
  # Read-only user
  - username: viewer
    apiKey: "THIRD_GENERATED_API_KEY"
    roles: ["viewer"]

# AI Configuration (Optional)
ai:
  provider: openai  # Options: openai, anthropic, google, ollama
  apiKey: "YOUR_AI_PROVIDER_API_KEY"
  model: "gpt-4"

# Security Rules
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
```

## Step 4: Environment Variables (Alternative)

You can also use environment variables instead of a config file:

```bash
# Set API configuration
export KUBEKAVACH_API_PORT=3000
export KUBEKAVACH_API_HOST=localhost

# Set user configuration (JSON format)
export KUBEKAVACH_USERS='[{"username":"admin","apiKey":"your-key","roles":["admin"]}]'

# Set AI configuration
export KUBEKAVACH_AI_PROVIDER=openai
export KUBEKAVACH_AI_API_KEY=your-openai-key
export KUBEKAVACH_AI_MODEL=gpt-4
```

## Step 5: Using API Keys

### With the CLI

```bash
# Start the API server
kubekavach api

# The API server will use the configured users from your config file
```

### With the Web UI

1. Open the web UI at `http://localhost:5173`
2. Enter your API key in the "API Key" field
3. The UI will authenticate using this key for all API requests

### With curl or HTTP clients

```bash
# Health check (no auth required)
curl http://localhost:3000/health

# List security rules (requires auth)
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3000/rules

# Start a scan
curl -X POST \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "default"}' \
  http://localhost:3000/scan
```

## Step 6: Security Best Practices

### 1. Rotate API Keys Regularly

```bash
# Generate new keys periodically
NEW_KEY=$(openssl rand -hex 32)
echo "New API Key: $NEW_KEY"

# Update your config file with the new key
```

### 2. Use Different Keys for Different Environments

```yaml
# Development config (~/.kubekavach/config.dev.yaml)
users:
  - username: dev-admin
    apiKey: "dev-only-key"
    roles: ["admin"]

# Production config (~/.kubekavach/config.prod.yaml)
users:
  - username: prod-scanner
    apiKey: "production-secure-key"
    roles: ["scanner"]
```

### 3. Never Commit API Keys

Add to `.gitignore`:

```
# KubeKavach secrets
.kubekavach/
*.apikey
config.yaml
config.*.yaml
```

### 4. Use Secret Management Tools

For production environments, consider using:
- Kubernetes Secrets
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault

Example with Kubernetes Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kubekavach-api-keys
type: Opaque
data:
  admin-key: <base64-encoded-api-key>
  scanner-key: <base64-encoded-api-key>
```

## Troubleshooting

### API Key Not Working

1. Check the API server logs:
```bash
kubekavach api --log-level debug
```

2. Verify key format:
```bash
# Keys should be alphanumeric strings
echo "YOUR_KEY" | grep -E '^[a-zA-Z0-9]+$'
```

3. Test authentication:
```bash
# Should return 401 without key
curl -i http://localhost:3000/rules

# Should return 200 with valid key
curl -i -H "x-api-key: YOUR_KEY" http://localhost:3000/rules
```

### Permission Denied Errors

Ensure your config file has correct permissions:
```bash
ls -la ~/.kubekavach/config.yaml
# Should show: -rw------- (600)
```

## User Roles Reference

- **admin**: Full access to all operations
- **scanner**: Can perform scans and view results
- **viewer**: Read-only access to results and rules

## Next Steps

1. Start the API server: `kubekavach api`
2. Access the Web UI and use your API key
3. Run your first scan: `kubekavach scan`
4. Configure AI providers for remediation suggestions

For more information, see the [main documentation](../README.md).