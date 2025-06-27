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

All API endpoints require authentication via API key passed in the request header:

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

**Authentication**: Required  
**Authorization**: Any role  

**Response**:
```json
{
  "status": "ok"
}
```

**Status Codes**:
- `200`: OK - Service is healthy
- `401`: Unauthorized - Invalid or missing API key

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

**Example Request**:
```bash
curl -X POST "http://localhost:3000/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "namespace": "production",
    "ruleIds": ["pod-security-context", "container-capabilities"]
  }'
```

**Response**:
```json
{
  "jobId": "uuid-v4-job-identifier"
}
```

**Status Codes**:
- `202`: Accepted - Scan job initiated successfully
- `400`: Bad Request - Invalid request body
- `401`: Unauthorized - Invalid or missing API key
- `403`: Forbidden - Insufficient permissions (requires scanner role)
- `429`: Too Many Requests - Rate limit exceeded

---

#### `GET /scan/results/{jobId}`

Retrieves the status and results of a previously initiated security scan.

**Authentication**: Required  
**Authorization**: `viewer` or `scanner` role  

**Path Parameters**:
- `jobId`: UUID of the scan job

**Example Request**:
```bash
curl -X GET "http://localhost:3000/scan/results/12345678-1234-1234-1234-123456789abc" \
  -H "X-API-Key: your-api-key"
```

**Response Structure**:

**For Running Scan**:
```json
{
  "status": "running",
  "result": null
}
```

**For Completed Scan**:
```json
{
  "status": "completed",
  "result": {
    "id": "12345678-1234-1234-1234-123456789abc",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "cluster": "production-cluster",
    "namespace": "production",
    "duration": 15432,
    "summary": {
      "total": 25,
      "critical": 3,
      "high": 8,
      "medium": 10,
      "low": 4
    },
    "findings": [
      {
        "ruleId": "pod-security-context",
        "ruleName": "Pod Security Context",
        "severity": "HIGH",
        "resource": {
          "kind": "Pod",
          "name": "nginx-deployment-abc123",
          "namespace": "production",
          "apiVersion": "v1"
        },
        "message": "Pod is running without security context",
        "details": {},
        "remediation": "Add securityContext to pod specification"
      }
    ],
    "metadata": {
      "resourcesProcessed": 150,
      "resourcesSkipped": 5,
      "rulesApplied": 25
    }
  }
}
```

**For Failed Scan**:
```json
{
  "status": "failed",
  "result": {
    "error": "Connection to Kubernetes cluster failed",
    "duration": 5000,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Status Codes**:
- `200`: OK - Scan results retrieved successfully
- `401`: Unauthorized - Invalid or missing API key
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Scan job not found
- `429`: Too Many Requests - Rate limit exceeded

---

### API Documentation

#### `GET /documentation`

Access to interactive Swagger UI for API documentation.

**Authentication**: Not required for documentation access  
**Response**: HTML page with interactive API documentation

---

## Data Schemas

### ScanResult Schema

```typescript
{
  id: string;                    // UUID of the scan job
  timestamp: string;             // ISO datetime string
  cluster: string;               // Kubernetes cluster name
  namespace?: string;            // Target namespace (if specified)
  duration: number;              // Scan duration in milliseconds
  summary: {
    total: number;               // Total findings count
    critical: number;            // Critical severity findings
    high: number;                // High severity findings
    medium: number;              // Medium severity findings
    low: number;                 // Low severity findings
  };
  findings: Finding[];           // Array of security findings
  metadata?: {
    resourcesProcessed: number;  // Number of resources processed
    resourcesSkipped: number;    // Number of resources skipped
    rulesApplied: number;        // Number of rules applied
  };
}
```

### Finding Schema

```typescript
{
  ruleId: string;                // Unique identifier of the security rule
  ruleName: string;              // Human-readable name of the rule
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  resource: {
    kind: string;                // Kubernetes resource kind (Pod, Deployment, etc.)
    name: string;                // Resource name
    namespace?: string;          // Resource namespace
    apiVersion: string;          // Kubernetes API version
  };
  message: string;               // Description of the security issue
  details?: Record<string, any>; // Additional context (optional)
  remediation?: string;          // Suggested fix (optional)
}
```

## Configuration

### API Configuration

Configure the API server in `~/.kubekavach/config.yaml`:

```yaml
api:
  port: 3000                     # Server port
  host: "0.0.0.0"               # Server host
  corsOrigin: "http://localhost:8080"  # CORS allowed origin
  rateLimit:
    max: 1000                    # Max requests per time window
    timeWindow: "1 minute"       # Rate limit time window

users:
  - username: "admin"
    apiKey: "secure-api-key-here"
    roles: ["scanner", "viewer"]
```

### Environment Variables

Override configuration with environment variables:

- `KUBEKAVACH_API_KEY`: Legacy API key (deprecated, use users array)
- `KUBEKAVACH_AI_API_KEY`: AI provider API key
- `KUBEKAVACH_AI_PROVIDER`: AI provider (openai, anthropic, google, ollama)
- `KUBEKAVACH_KUBECONFIG_PATH`: Path to kubeconfig file

## Security Features

### Security Headers

The API implements comprehensive security headers via Helmet:

- **Content Security Policy**: Restricts resource loading
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Controls browser features

### CORS Configuration

Cross-Origin Resource Sharing is configured with:
- Default allowed origin: `http://localhost:8080`
- Allowed methods: `GET`, `POST`
- Configurable via `corsOrigin` setting

### Rate Limiting

API endpoints are protected with configurable rate limiting:
- Default: 1000 requests per minute
- Configurable per user/IP
- Returns `429 Too Many Requests` when exceeded

### Input Validation

All request inputs are validated using Zod schemas:
- Request body validation
- Parameter validation
- Response schema enforcement

## Error Handling

### Standard Error Response Format

```json
{
  "error": "Error Type",
  "message": "Detailed error description"
}
```

### Common Error Codes

- **400 Bad Request**: Invalid request format or parameters
- **401 Unauthorized**: Missing or invalid API key
- **403 Forbidden**: Insufficient permissions for the requested operation
- **404 Not Found**: Requested resource (scan job) not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server-side processing error

## Monitoring and Observability

### Logging

The API provides structured logging with:
- Request/response logging
- Authentication attempts
- Scan job lifecycle events
- Error tracking with stack traces
- Performance metrics (scan duration, resource counts)

### Metrics (Placeholder)

Future implementation will include:
- Prometheus metrics endpoint (`/metrics`)
- Request counters and latency histograms
- Scan job statistics
- Resource utilization metrics

### Tracing (Placeholder)

OpenTelemetry integration planned for:
- Distributed tracing
- Span correlation across services
- Performance bottleneck identification

## Usage Examples

### Complete Workflow Example

1. **Initiate a scan**:
```bash
curl -X POST "http://localhost:3000/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-scanner-api-key" \
  -d '{
    "namespace": "production"
  }'
```

Response:
```json
{"jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
```

2. **Check scan status**:
```bash
curl -X GET "http://localhost:3000/scan/results/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "X-API-Key: your-viewer-api-key"
```

3. **Process results** when status is "completed"

### Batch Scanning Multiple Namespaces

```bash
# Scan specific namespace
for ns in production staging development; do
  curl -X POST "http://localhost:3000/scan" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-api-key" \
    -d "{\"namespace\": \"$ns\"}"
done
```

### Targeted Rule Scanning

```bash
# Scan with specific security rules
curl -X POST "http://localhost:3000/scan" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "ruleIds": [
      "pod-security-context",
      "container-capabilities",
      "network-policies"
    ]
  }'
```

## Development and Testing

### Local Development

1. Start the development server:
```bash
npm run dev
```

2. Access Swagger documentation:
```
http://localhost:3000/documentation
```

3. Test health endpoint:
```bash
curl -H "X-API-Key: test-key" http://localhost:3000/health
```

### Testing Authentication

```bash
# Test without API key (should fail)
curl -X GET "http://localhost:3000/health"

# Test with invalid API key (should fail)
curl -H "X-API-Key: invalid-key" "http://localhost:3000/health"

# Test with valid API key (should succeed)
curl -H "X-API-Key: valid-api-key" "http://localhost:3000/health"
```

## Limitations and Considerations

1. **In-Memory Storage**: Scan jobs are stored in memory and will be lost on server restart
2. **Single Instance**: No clustering or load balancing support
3. **Resource Limits**: Large clusters may require increased memory allocation
4. **Kubernetes Access**: Requires valid kubeconfig with appropriate cluster permissions
5. **Concurrent Scans**: No built-in limit on concurrent scan jobs

## Future Enhancements

1. **Persistent Storage**: Database integration for scan job persistence
2. **Webhook Support**: Real-time notifications for scan completion
3. **Streaming Results**: Server-sent events for real-time scan progress
4. **Advanced Filtering**: Query parameters for filtering scan results
5. **Scan Scheduling**: Cron-like scheduling for automated scans
6. **Multi-Cluster Support**: Scanning across multiple Kubernetes clusters