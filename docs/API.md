# KubeKavach API Documentation

## Overview

The KubeKavach API is a RESTful web service that provides security scanning capabilities for Kubernetes clusters. It offers asynchronous scanning functionality with role-based access control, comprehensive security headers, and structured logging.

**Base URL**: `http://{host}:{port}`  
**Default Host**: `0.0.0.0`  
**Default Port**: `3000`  
**API Version**: `0.1.0`

## Architecture

- **Framework**: Fastify 4.x
- **Authentication**: API Key-based with role-based authorization
- **Validation**: Zod schema validation
- **Documentation**: OpenAPI/Swagger with interactive UI
- **Security**: CORS, Helmet, Rate Limiting
- **Logging**: Structured logging with Pino

## Authentication

### API Key Authentication

All API endpoints (except `/health`) require authentication via API key passed in the request header:

```http
X-API-Key: your-api-key-here
```

### User Roles

The API supports role-based authorization with the following roles:

- **viewer**: Read-only access to scan results
- **scanner**: Full access including initiating scans
- **admin**: Administrative access (future use)

### Configuration

Users are configured in the KubeKavach configuration file (`~/.kubekavach/config.yaml`):

```yaml
users:
  - username: "scanner-user"
    apiKey: "your-secure-api-key"
    roles: ["scanner"]
  - username: "viewer-user"
    apiKey: "another-secure-api-key"
    roles: ["viewer"]
```

## Endpoints

### Health Check

#### `GET /health`

Returns the health status of the API server.

**Authentication**: Not required  
**Authorization**: Public endpoint  

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "0.1.0"
}
```

**Status Codes**:
- `200`: OK - Service is healthy

**Example**:
```bash
curl http://localhost:3000/health
```

---

### Security Rules

#### `GET /rules`

Returns all available security rules that can be applied during scans.

**Authentication**: Required  
**Authorization**: Any role (`viewer`, `scanner`, `admin`)  

**Response**:
```json
[
  {
    "id": "KKR001",
    "name": "Privileged Container",
    "description": "Detects containers running in privileged mode",
    "severity": "CRITICAL",
    "category": "Pod Security"
  },
  {
    "id": "KKR002",
    "name": "Missing Resource Limits",
    "description": "Detects containers without resource limits",
    "severity": "MEDIUM",
    "category": "Resource Management"
  }
]
```

**Status Codes**:
- `200`: OK - Rules retrieved successfully
- `401`: Unauthorized - Invalid or missing API key

**Example**:
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/rules
```

---

### Security Scanning

#### `POST /scan`

Initiates an asynchronous security scan of the Kubernetes cluster.

**Authentication**: Required  
**Authorization**: `scanner` role  

**Request Body**:
```json
{
  "namespace": "string (optional)",
  "ruleIds": ["string"] // optional array of rule IDs
}
```

**Request Schema**:
- `namespace` (optional): Target specific namespace for scanning. If omitted, scans all namespaces
- `ruleIds` (optional): Array of specific rule IDs to apply. If omitted, applies all available rules

**Response**:
```json
{
  "jobId": "uuid-string",
  "status": "running",
  "message": "Scan initiated successfully"
}
```

**Status Codes**:
- `200`: OK - Scan initiated successfully
- `400`: Bad Request - Invalid request body
- `401`: Unauthorized - Invalid or missing API key
- `403`: Forbidden - Insufficient permissions (requires scanner role)
- `429`: Too Many Requests - Rate limit exceeded

**Examples**:

```bash
# Scan entire cluster
curl -X POST "http://localhost:3000/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{}'

# Scan specific namespace
curl -X POST "http://localhost:3000/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"namespace": "production"}'

# Scan with specific rules
curl -X POST "http://localhost:3000/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"namespace": "default", "ruleIds": ["KKR001", "KKR003"]}'
```

---

### Scan Results

#### `GET /scan/results/{jobId}`

Retrieves the results of a previously initiated scan.

**Authentication**: Required  
**Authorization**: Any role (`viewer`, `scanner`, `admin`)  

**Path Parameters**:
- `jobId`: UUID of the scan job returned by the `/scan` endpoint

**Response** (Completed Scan):
```json
{
  "jobId": "uuid-string",
  "status": "completed",
  "result": {
    "id": "scan-uuid",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "cluster": "my-cluster",
    "namespace": "production",
    "duration": 2340,
    "summary": {
      "total": 5,
      "critical": 1,
      "high": 2,
      "medium": 2,
      "low": 0
    },
    "findings": [
      {
        "ruleId": "KKR001",
        "ruleName": "Privileged Container",
        "severity": "CRITICAL",
        "resource": {
          "kind": "Pod",
          "name": "nginx-deployment-abc123",
          "namespace": "production"
        },
        "message": "Container 'nginx' is running in privileged mode",
        "remediation": "Set securityContext.privileged to false"
      }
    ]
  }
}
```

**Response** (Running Scan):
```json
{
  "jobId": "uuid-string",
  "status": "running",
  "message": "Scan in progress"
}
```

**Response** (Failed Scan):
```json
{
  "jobId": "uuid-string",
  "status": "failed",
  "error": "Failed to connect to Kubernetes cluster"
}
```

**Status Codes**:
- `200`: OK - Results retrieved successfully
- `401`: Unauthorized - Invalid or missing API key
- `404`: Not Found - Job ID not found

**Example**:
```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/scan/results/550e8400-e29b-41d4-a716-446655440000
```

---

### Interactive Documentation

#### `GET /documentation`

Access the interactive Swagger UI for exploring the API.

**Authentication**: Not required  
**Authorization**: Public endpoint  

**Example**:
Open `http://localhost:3000/documentation` in your browser.

## Data Schemas

### Finding Schema

```typescript
interface Finding {
  ruleId: string;           // Rule identifier (e.g., "KKR001")
  ruleName: string;         // Human-readable rule name
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  resource: {
    kind: string;           // Kubernetes resource type
    name: string;           // Resource name
    namespace?: string;     // Namespace (if applicable)
  };
  message: string;          // Description of the security issue
  remediation?: string;     // Optional fix guidance
}
```

### ScanResult Schema

```typescript
interface ScanResult {
  id: string;              // Unique scan identifier
  timestamp: string;       // ISO timestamp of scan
  cluster: string;         // Cluster name
  namespace?: string;      // Target namespace (if specified)
  duration: number;        // Scan duration in milliseconds
  summary: {
    total: number;         // Total findings count
    critical: number;      // Critical severity count
    high: number;          // High severity count
    medium: number;        // Medium severity count
    low: number;           // Low severity count
  };
  findings: Finding[];     // Array of security findings
}
```

### User Schema

```typescript
interface User {
  username: string;        // Unique username
  apiKey: string;         // Authentication API key
  roles: string[];        // Authorization roles
}
```

## Error Handling

### Standard Error Response

```json
{
  "error": "Error Type",
  "message": "Detailed error description",
  "statusCode": 400
}
```

### Common Error Codes

- **400 Bad Request**: Malformed request body or invalid parameters
- **401 Unauthorized**: Missing, invalid, or expired API key
- **403 Forbidden**: Valid authentication but insufficient permissions
- **404 Not Found**: Requested resource (scan job) not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Unexpected server error

### Error Examples

**Invalid Request Body**:
```json
{
  "error": "Validation Error",
  "message": "Request body must contain valid JSON",
  "statusCode": 400
}
```

**Missing API Key**:
```json
{
  "error": "Unauthorized",
  "message": "API Key is required",
  "statusCode": 401
}
```

**Insufficient Permissions**:
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions",
  "statusCode": 403
}
```

## Security Features

### Rate Limiting

- **Default Limit**: 1000 requests per minute per IP
- **Configurable**: Adjust via configuration file
- **Headers**: Rate limit information included in response headers

### CORS

- **Configurable Origins**: Set allowed origins via configuration
- **Default**: `http://localhost:3000` (configurable)
- **Methods**: GET, POST
- **Headers**: Standard security headers included

### Security Headers

Automatically applied via Helmet middleware:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy`: Restrictive policy
- `X-XSS-Protection: 1; mode=block`

### Input Validation

- **Zod Schemas**: All inputs validated against strict schemas
- **Sanitization**: Automatic input sanitization
- **Type Safety**: Full TypeScript type checking

## Configuration

### Server Configuration

```yaml
api:
  port: 3000
  host: "0.0.0.0"
  corsOrigin: "http://localhost:5173"
  rateLimit:
    max: 1000
    timeWindow: "1 minute"
```

### User Management

```yaml
users:
  - username: "admin"
    apiKey: "admin-api-key-32-chars-long"
    roles: ["scanner", "viewer"]
  - username: "ci-scanner"
    apiKey: "ci-api-key-32-chars-long"
    roles: ["scanner"]
  - username: "readonly"
    apiKey: "readonly-api-key-32-chars-long"
    roles: ["viewer"]
```

## Usage Examples

### Complete Workflow

```bash
#!/bin/bash

API_KEY="your-api-key"
BASE_URL="http://localhost:3000"

# 1. Check API health
curl -s "$BASE_URL/health"

# 2. List available rules
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/rules"

# 3. Start a scan
SCAN_RESPONSE=$(curl -s -X POST "$BASE_URL/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"namespace": "production"}')

JOB_ID=$(echo $SCAN_RESPONSE | jq -r '.jobId')

# 4. Poll for results
while true; do
  RESULT=$(curl -s -H "X-API-Key: $API_KEY" \
    "$BASE_URL/scan/results/$JOB_ID")
  
  STATUS=$(echo $RESULT | jq -r '.status')
  
  if [ "$STATUS" = "completed" ]; then
    echo "Scan completed!"
    echo $RESULT | jq '.result.summary'
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Scan failed!"
    echo $RESULT | jq '.error'
    break
  else
    echo "Scan in progress..."
    sleep 5
  fi
done
```

### Integration with CI/CD

```yaml
# GitHub Actions example
name: Security Scan
on: [push]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
    - name: Start KubeKavach Scan
      run: |
        SCAN_RESPONSE=$(curl -X POST "${{ secrets.KUBEKAVACH_URL }}/scan" \
          -H "Content-Type: application/json" \
          -H "X-API-Key: ${{ secrets.KUBEKAVACH_API_KEY }}" \
          -d '{"namespace": "production"}')
        
        JOB_ID=$(echo $SCAN_RESPONSE | jq -r '.jobId')
        echo "JOB_ID=$JOB_ID" >> $GITHUB_ENV
    
    - name: Wait for Results
      run: |
        # Polling logic here
        # Fail job if critical issues found
```

## Monitoring and Observability

### Health Monitoring

Regular health checks:
```bash
# Simple health check
curl -f http://localhost:3000/health || exit 1

# Detailed monitoring with metrics
curl -s http://localhost:3000/health | jq '.status'
```

### Logging

- **Structured Logging**: JSON format with Pino
- **Request Logging**: All API requests logged
- **Error Logging**: Detailed error information
- **Performance Logging**: Request duration and performance metrics

### Metrics

Future versions will include:
- Request rate metrics
- Error rate metrics
- Scan duration metrics
- Queue depth metrics

## Version Information

- **API Version**: 0.1.0
- **OpenAPI Version**: 3.0.0
- **Last Updated**: January 2024

For the latest API updates and features, visit: https://kubekavach.gensecai.org