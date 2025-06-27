# KubeKavach CLI Documentation

KubeKavach is a developer-first Kubernetes security scanner with local pod replay capabilities. This comprehensive documentation covers all available CLI commands, their options, flags, and usage patterns.

## Table of Contents

- [Installation](#installation)
- [Global Options](#global-options)
- [Commands Overview](#commands-overview)
- [Command Reference](#command-reference)
  - [scan](#scan)
  - [replay](#replay)
  - [config](#config)
  - [api](#api)
  - [rules](#rules)
- [Configuration](#configuration)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)

## Installation

```bash
npm install -g kubekavach
# or
yarn global add kubekavach
```

## Global Options

The following options are available for all commands:

- `--help, -h`: Show help for the command
- `--version`: Show version information

## Commands Overview

| Command | Description |
|---------|-------------|
| `scan` | Scan a Kubernetes cluster for security vulnerabilities |
| `replay` | Replay a Kubernetes pod locally for debugging |
| `config` | Manage KubeKavach configuration |
| `api` | Start the KubeKavach API server |
| `rules` | List all available security rules |

## Command Reference

### scan

Scan a Kubernetes cluster for security vulnerabilities using built-in security rules.

#### Synopsis

```bash
kubekavach scan [FLAGS]
```

#### Description

The scan command connects to your Kubernetes cluster and performs a comprehensive security analysis of your resources including Pods, Deployments, DaemonSets, StatefulSets, and Jobs. It applies various security rules to identify potential vulnerabilities and misconfigurations.

#### Flags

| Flag | Short | Type | Description | Required |
|------|-------|------|-------------|----------|
| `--namespace` | `-n` | string | Kubernetes namespace to scan | No |
| `--kubeconfig` | | string | Path to kubeconfig file | No |

#### Resource Types Scanned

- **Pods**: All pods in the specified namespace or cluster-wide
- **Deployments**: Application deployments
- **DaemonSets**: Node-level daemon services
- **StatefulSets**: Stateful applications
- **Jobs**: Batch processing jobs

#### Output Format

The scan results are displayed in a formatted table showing:
- **Rule**: The name of the security rule that was violated
- **Severity**: CRITICAL, HIGH, MEDIUM, or LOW
- **Resource**: The Kubernetes resource type and name
- **Message**: Detailed description of the security issue

#### Examples

```bash
# Scan entire cluster
kubekavach scan

# Scan specific namespace
kubekavach scan --namespace production

# Scan with custom kubeconfig
kubekavach scan --kubeconfig ~/.kube/custom-config

# Scan specific namespace with custom kubeconfig
kubekavach scan -n kube-system --kubeconfig /path/to/kubeconfig
```

#### Error Handling

The command handles various error scenarios:
- **Connection refused**: Kubernetes API server is unreachable
- **403 Forbidden**: Insufficient RBAC permissions
- **Kubeconfig errors**: Invalid or missing kubeconfig file
- **Invalid resources**: Skips malformed Kubernetes manifests

### replay

Replay a Kubernetes pod locally for debugging purposes.

#### Synopsis

```bash
kubekavach replay [FLAGS]
```

#### Description

The replay command fetches a running pod from your Kubernetes cluster and replays it locally in a controlled environment. This is useful for debugging issues, testing configurations, or understanding pod behavior without affecting the live cluster.

#### Flags

| Flag | Short | Type | Description | Required |
|------|-------|------|-------------|----------|
| `--namespace` | `-n` | string | Kubernetes namespace of the pod | Yes |
| `--pod` | `-p` | string | Name of the pod to replay | Yes |
| `--kubeconfig` | | string | Path to kubeconfig file | No |

#### Examples

```bash
# Replay a pod from default namespace
kubekavach replay --namespace default --pod my-app-pod

# Replay with short flags
kubekavach replay -n production -p web-server-123

# Replay with custom kubeconfig
kubekavach replay -n kube-system -p coredns-abc123 --kubeconfig ~/.kube/staging
```

#### Error Handling

- **404 Not Found**: Pod doesn't exist in the specified namespace
- **403 Forbidden**: Insufficient permissions to access the pod
- **Replay errors**: Issues with local container runtime or pod configuration

### config

Manage KubeKavach configuration settings.

#### Synopsis

```bash
kubekavach config <action> [key] [value]
```

#### Description

The config command allows you to view and modify KubeKavach configuration settings. Configuration values are stored locally and can include API settings, AI integration parameters, and other application preferences.

#### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `action` | Action to perform: `get` or `set` | Yes |
| `key` | Configuration key (dot notation supported) | No (required for specific operations) |
| `value` | Configuration value to set | No (required for `set` action) |

#### Configuration Keys

Common configuration keys include:
- `api.port`: API server port number
- `api.host`: API server host address
- `ai.apiKey`: AI service API key (sensitive)
- `rules.enabled`: List of enabled security rules

#### Examples

```bash
# View entire configuration
kubekavach config get

# Get specific configuration value
kubekavach config get api.port

# Set configuration value
kubekavach config set api.port 4000

# Set nested configuration
kubekavach config set api.host "0.0.0.0"

# Set JSON values
kubekavach config set rules.enabled '["KKR001","KKR002","KKR003"]'
```

#### Security Features

- **Sensitive Data Redaction**: API keys and secrets are automatically redacted in output
- **Schema Validation**: Configuration changes are validated against the schema
- **Error Handling**: Invalid configurations are rejected with helpful error messages

### api

Start the KubeKavach API server.

#### Synopsis

```bash
kubekavach api [FLAGS]
```

#### Description

The api command starts a local HTTP server that provides REST API endpoints for KubeKavach functionality. This allows integration with other tools, web interfaces, or automated systems.

#### Flags

| Flag | Short | Type | Description | Required |
|------|-------|------|-------------|----------|
| `--port` | `-p` | integer | Port to run the API server on | No |
| `--host` | `-h` | string | Host to bind the API server to | No |
| `--config` | `-c` | string | Path to configuration file | No |

#### Examples

```bash
# Start API server with default settings
kubekavach api

# Start on custom port
kubekavach api --port 8080

# Start on all interfaces
kubekavach api --host 0.0.0.0 --port 3000

# Start with custom configuration
kubekavach api --config /etc/kubekavach/config.json
```

#### Configuration Priority

Settings are applied in the following order (highest to lowest priority):
1. Command line flags
2. Configuration file values
3. Default values

### rules

List all available security rules.

#### Synopsis

```bash
kubekavach rules [FLAGS]
```

#### Description

The rules command displays all available security rules that can be applied during cluster scans. Rules can be filtered by category or severity level.

#### Flags

| Flag | Short | Type | Description | Required |
|------|-------|------|-------------|----------|
| `--category` | `-c` | string | Filter by category | No |
| `--severity` | `-s` | string | Filter by severity | No |
| `--json` | | boolean | Output in JSON format | No |

#### Rule Information

Each rule displays:
- **ID**: Unique rule identifier (e.g., KKR001)
- **Name**: Human-readable rule name
- **Severity**: CRITICAL, HIGH, MEDIUM, or LOW
- **Category**: Rule category (e.g., "Pod Security", "Resource Management")
- **Description**: Detailed explanation of what the rule checks

#### Examples

```bash
# List all rules
kubekavach rules

# Filter by category
kubekavach rules --category "Pod Security"

# Filter by severity
kubekavach rules --severity CRITICAL

# Multiple filters
kubekavach rules -c "Resource" -s HIGH

# JSON output for programmatic use
kubekavach rules --json
```

#### Rule Categories

Common rule categories include:
- **Pod Security**: Container security configurations
- **Resource Management**: CPU/memory limits and requests
- **Network Security**: Network policies and service configurations
- **RBAC**: Role-based access control issues
- **Image Security**: Container image vulnerabilities

## Configuration

KubeKavach uses a configuration file to store settings. The configuration is automatically created when first run and can be managed using the `config` command.

### Configuration Schema

```json
{
  "api": {
    "port": 3000,
    "host": "localhost",
    "apiKey": "your-api-key"
  },
  "ai": {
    "apiKey": "your-ai-api-key"
  },
  "rules": {
    "enabled": ["KKR001", "KKR002", "KKR003"]
  },
  "users": [
    {
      "name": "admin",
      "apiKey": "user-api-key"
    }
  ]
}
```

### Environment Variables

Some settings can be overridden using environment variables:
- `KUBECONFIG`: Path to kubeconfig file
- `KUBEKAVACH_CONFIG`: Path to KubeKavach configuration file

## Examples

### Complete Workflow Example

```bash
# 1. Check available rules
kubekavach rules --severity CRITICAL

# 2. Scan your cluster
kubekavach scan --namespace production

# 3. If issues found, replay problematic pod for debugging
kubekavach replay -n production -p suspicious-pod-123

# 4. Start API server for integration
kubekavach api --port 8080

# 5. Configure for your environment
kubekavach config set api.port 8080
kubekavach config set rules.enabled '["KKR001","KKR002"]'
```

### CI/CD Integration

```bash
#!/bin/bash
# CI/CD pipeline security check

# Run security scan
kubekavach scan --namespace staging > scan-results.txt

# Check if any critical issues found
if grep -q "CRITICAL" scan-results.txt; then
    echo "Critical security issues found!"
    cat scan-results.txt
    exit 1
fi

echo "Security scan passed"
```

### Multi-Namespace Scanning

```bash
# Scan multiple namespaces
for ns in production staging development; do
    echo "Scanning namespace: $ns"
    kubekavach scan --namespace $ns
    echo "---"
done
```

## Error Handling

KubeKavach provides detailed error messages and handling for common scenarios:

### Connection Issues

```bash
# Error: Could not connect to Kubernetes API server
# Solution: Check kubeconfig and cluster connectivity
kubectl cluster-info
kubekavach scan --kubeconfig ~/.kube/config
```

### Permission Issues

```bash
# Error: Forbidden: Insufficient permissions
# Solution: Check RBAC permissions
kubectl auth can-i list pods
kubectl auth can-i list deployments
```

### Configuration Issues

```bash
# Error: Invalid configuration key
# Solution: Check available configuration keys
kubekavach config get
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Kubeconfig Not Found

**Problem**: `kubeconfig error: file not found`

**Solution**:
```bash
# Set KUBECONFIG environment variable
export KUBECONFIG=~/.kube/config

# Or specify explicitly
kubekavach scan --kubeconfig ~/.kube/config
```

#### 2. No Resources Found

**Problem**: Scan completes but finds no resources

**Solution**:
```bash
# Check if resources exist in namespace
kubectl get pods -n your-namespace

# Verify cluster connectivity
kubectl cluster-info
```

#### 3. API Server Won't Start

**Problem**: API server fails to start

**Solution**:
```bash
# Check if port is available
netstat -tlnp | grep :3000

# Try different port
kubekavach api --port 8080
```

#### 4. Rules Not Loading

**Problem**: No security rules are applied

**Solution**:
```bash
# Check available rules
kubekavach rules

# Verify rule configuration
kubekavach config get rules.enabled
```

### Debug Mode

For troubleshooting, you can enable verbose logging by setting the `DEBUG` environment variable:

```bash
DEBUG=kubekavach:* kubekavach scan
```

### Support and Issues

If you encounter issues not covered in this documentation:

1. Check the GitHub issues: https://github.com/gensecaihq/kubekavach/issues
2. Review the logs for detailed error messages
3. Ensure you're using the latest version: `kubekavach --version`

## Version Information

This documentation is for KubeKavach CLI version 0.1.0.

For the latest updates and features, visit: https://kubekavach.gensecai.org