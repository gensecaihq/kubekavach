# KubeKavach Quick Start Guide

This guide will help you get KubeKavach up and running in 5 minutes.

## Prerequisites

- Node.js 18+
- Docker (for pod replay feature)
- kubectl configured with cluster access
- A Kubernetes cluster to scan

## Step 1: Install KubeKavach

```bash
# Clone the repository
git clone https://github.com/gensecaihq/kubekavach.git
cd kubekavach

# Install dependencies
npm install

# Build all packages
npm run build

# Link CLI globally
cd packages/cli
npm link
```

## Step 2: Generate Your First API Key

```bash
# Generate a secure API key
export MY_API_KEY=$(openssl rand -hex 32)
echo "Your API Key: $MY_API_KEY"

# Save it somewhere safe - you'll need it for the UI
```

## Step 3: Create Configuration

```bash
# Create config directory
mkdir -p ~/.kubekavach

# Create minimal configuration
cat > ~/.kubekavach/config.yaml << EOF
# Kubernetes access
kubeconfig: ~/.kube/config

# API server
api:
  port: 3000
  host: localhost

# Users
users:
  - username: quickstart
    apiKey: "$MY_API_KEY"
    roles: ["admin"]
EOF

# Secure the file
chmod 600 ~/.kubekavach/config.yaml
```

## Step 4: Run Your First Scan

```bash
# Quick scan of default namespace
kubekavach scan -n default

# You should see output like:
# Scanning namespace: default
# Using rules: KKR001,KKR002,KKR003,KKR004,KKR005,KKR006,KKR007,KKR008,KKR009
# Scan completed in 2.3s
# 
# Summary:
# Total findings: 5
# Critical: 1
# High: 2
# Medium: 2
# Low: 0
```

## Step 5: Start the Web Dashboard

### Terminal 1: Start API Server
```bash
kubekavach api

# You should see:
# Starting KubeKavach API server...
# Server listening at http://localhost:3000
```

### Terminal 2: Start UI (if running from source)
```bash
cd packages/ui
npm run dev

# Access UI at http://localhost:5173
```

### Using the Dashboard

1. Open http://localhost:5173 in your browser
2. Enter your API key (from Step 2)
3. Click "Start Scan"
4. View real-time results with charts and details

## Step 6: Try Pod Replay (Optional)

If you have Docker installed, try the replay feature:

```bash
# List pods in default namespace
kubectl get pods -n default

# Replay a pod locally
kubekavach replay -n default -p YOUR_POD_NAME

# This will:
# - Pull the pod's container image
# - Recreate the pod's environment locally
# - Start the container with the same configuration
# - Show you the logs
```

## Common Commands

```bash
# List all available security rules
kubekavach rules

# Scan all namespaces
kubekavach scan

# Scan with specific rules only
kubekavach scan --rules KKR001,KKR002

# Export scan results
kubekavach scan -o json > scan-results.json
kubekavach scan -o csv > scan-results.csv

# View current configuration
kubekavach config show

# Update configuration
kubekavach config set ai.provider openai
kubekavach config set ai.apiKey YOUR_OPENAI_KEY
```

## What's Next?

1. **Configure AI Remediation** (optional):
   - Add OpenAI/Anthropic API key to get AI-powered fix suggestions
   - `kubekavach config set ai.apiKey YOUR_AI_KEY`

2. **Set Up Multiple Users**:
   - Create different API keys for different team members
   - Assign appropriate roles (admin, scanner, viewer)

3. **Integrate with CI/CD**:
   - Add KubeKavach scans to your deployment pipeline
   - Use the JSON output format for automated processing

4. **Customize Security Rules**:
   - Enable/disable specific rules based on your needs
   - Adjust severity levels in configuration

## Troubleshooting

### "Unauthorized" error in UI
- Make sure your API key matches exactly
- Check that the API server is running
- Verify the API key is in your config file

### "Cannot connect to Kubernetes"
- Run `kubectl cluster-info` to verify cluster access
- Check your kubeconfig path in the configuration
- Ensure you have the necessary RBAC permissions

### Pod replay not working
- Verify Docker is installed: `docker --version`
- Check Docker daemon is running: `docker ps`
- Ensure you have pull access to the pod's image

## Getting Help

- GitHub Issues: https://github.com/gensecaihq/kubekavach/issues
- Documentation: [API Key Setup](API_KEY_SETUP.md) | [Deployment Guide](../DEPLOYMENT.md)
- Security Rules: Run `kubekavach rules` to see all available rules

## Example Output

Here's what a typical scan result looks like:

```
KubeKavach Security Scan Report
===============================
Cluster: my-cluster
Namespace: production
Duration: 3.2s

Findings:
---------
[CRITICAL] KKR001 - Privileged Container
  Resource: Pod/frontend-app
  Message: Container 'app' is running in privileged mode
  
[HIGH] KKR003 - Allow Privilege Escalation
  Resource: Pod/backend-api
  Message: Container 'api' allows privilege escalation
  
[MEDIUM] KKR002 - Missing Resource Limits
  Resource: Pod/worker-job
  Message: Container 'worker' is missing CPU and memory limits

Summary: 3 issues found (1 critical, 1 high, 1 medium)
```

Start securing your Kubernetes clusters now! 🚀