# KubeKavach Security Rules Documentation

## Overview

This document provides comprehensive documentation for all security rules implemented in the KubeKavach security scanner. Each rule includes detailed descriptions, validation logic, severity levels, categories, and remediation guidance.

## Rule Categories

The security rules are organized into the following categories:

- **Container Security**: Rules focusing on container-level security configurations
- **Network Security**: Rules for network-related security concerns  
- **Pod Security**: Rules for pod-level security configurations
- **RBAC**: Rules for Role-Based Access Control security
- **Resource Management**: Rules for resource allocation and limits

## Severity Levels

Rules are classified using four severity levels:
- **CRITICAL**: Immediate security risk requiring urgent attention
- **HIGH**: Significant security concern that should be addressed promptly
- **MEDIUM**: Moderate security issue that should be resolved
- **LOW**: Minor security concern or best practice recommendation

---

## Security Rules Reference

### KKR001: Privileged Container
- **Severity**: CRITICAL
- **Category**: Pod Security
- **Description**: Detects containers running in privileged mode.

**What it validates**: Checks for containers where `privileged: true` is set in the security context.

**Why it's important**: Privileged containers have unrestricted access to the host system, effectively removing all security boundaries. This poses extreme security risks as containers can access host devices, modify kernel parameters, and potentially compromise the entire node.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    securityContext:
      privileged: true  # This triggers the rule
```

**Remediation**: Remove `privileged: true` from container security contexts. If elevated privileges are needed, use specific capabilities instead:
```yaml
securityContext:
  capabilities:
    add: ["NET_ADMIN"]  # Only add specific required capabilities
    drop: ["ALL"]       # Drop all other capabilities
```

---

### KKR002: Missing Resource Limits
- **Severity**: MEDIUM
- **Category**: Resource Management
- **Description**: Detects containers without CPU or memory limits.

**What it validates**: Checks for containers missing `resources.limits.cpu` or `resources.limits.memory` specifications.

**Why it's important**: Without resource limits, containers can consume unlimited CPU and memory, potentially causing resource starvation for other workloads and system instability. Resource limits ensure fair resource allocation and prevent resource exhaustion attacks.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    # Missing resources.limits triggers the rule
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
```

**Remediation**: Set appropriate resource limits based on application requirements:
```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m      # Maximum CPU the container can use
    memory: 512Mi  # Maximum memory the container can use
```

---

### KKR003: Allow Privilege Escalation
- **Severity**: HIGH
- **Category**: Pod Security  
- **Description**: Detects containers that allow privilege escalation.

**What it validates**: Checks for containers with `allowPrivilegeEscalation: true` in their security context.

**Why it's important**: Privilege escalation allows processes to gain more privileges than their parent process, potentially leading to security breaches where attackers can elevate their access within the container.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    securityContext:
      allowPrivilegeEscalation: true  # This triggers the rule
```

**Remediation**: Explicitly set `allowPrivilegeEscalation: false`:
```yaml
securityContext:
  allowPrivilegeEscalation: false
```

---

### KKR004: Host Network Access
- **Severity**: HIGH
- **Category**: Network Security
- **Description**: Detects pods that use host network namespace.

**What it validates**: Checks for pods with `hostNetwork: true` in their specification.

**Why it's important**: Pods using host networking bypass network isolation and can access host network interfaces directly. This exposes services to the host network and can lead to port conflicts and security vulnerabilities.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  hostNetwork: true  # This triggers the rule
  containers:
  - name: app
    image: nginx
```

**Remediation**: Remove `hostNetwork: true` and use proper Service objects for network connectivity:
```yaml
# Remove hostNetwork from pod spec
# Create a Service instead:
apiVersion: v1
kind: Service
metadata:
  name: app-service
spec:
  selector:
    app: myapp
  ports:
  - port: 80
    targetPort: 8080
```

---

### KKR005: Host Port Binding
- **Severity**: MEDIUM
- **Category**: Network Security
- **Description**: Detects containers that bind to host ports.

**What it validates**: Checks for containers that specify `hostPort` in their port configurations.

**Why it's important**: Host port binding exposes container ports directly on the host, bypassing Kubernetes networking and potentially causing port conflicts. It also makes pods less portable and harder to scale.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    ports:
    - containerPort: 80
      hostPort: 8080  # This triggers the rule
```

**Remediation**: Remove `hostPort` and use Service objects for external connectivity:
```yaml
# Remove hostPort from container spec
ports:
- containerPort: 80

# Create a Service for external access:
apiVersion: v1
kind: Service
metadata:
  name: app-service
spec:
  type: LoadBalancer  # or NodePort
  selector:
    app: myapp
  ports:
  - port: 8080
    targetPort: 80
```

---

### KKR006: Read-Only Root Filesystem
- **Severity**: MEDIUM
- **Category**: Container Security
- **Description**: Detects containers without read-only root filesystem.

**What it validates**: Checks for containers that don't have `readOnlyRootFilesystem: true` in their security context.

**Why it's important**: Writable root filesystems allow attackers to modify system files, install malware, or persist changes within the container. Read-only root filesystems prevent unauthorized modifications and improve security posture.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    # Missing readOnlyRootFilesystem: true triggers the rule
    securityContext:
      runAsNonRoot: true
```

**Remediation**: Set `readOnlyRootFilesystem: true` and use volume mounts for writable directories:
```yaml
securityContext:
  readOnlyRootFilesystem: true
volumeMounts:
- name: tmp-volume
  mountPath: /tmp
- name: var-cache
  mountPath: /var/cache
volumes:
- name: tmp-volume
  emptyDir: {}
- name: var-cache
  emptyDir: {}
```

---

### KKR007: Service Account Token Auto-Mount
- **Severity**: MEDIUM
- **Category**: RBAC
- **Description**: Detects pods that automatically mount service account tokens.

**What it validates**: Checks for pods that don't explicitly set `automountServiceAccountToken: false`.

**Why it's important**: Service account tokens provide API access to the Kubernetes cluster. Auto-mounting these tokens in every pod increases the attack surface unnecessarily. Pods should only have API access when explicitly required.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  # Missing automountServiceAccountToken: false triggers the rule
  containers:
  - name: app
    image: nginx
```

**Remediation**: Explicitly disable service account token auto-mounting unless needed:
```yaml
spec:
  automountServiceAccountToken: false
  containers:
  - name: app
    image: nginx
```

If API access is required, create a dedicated service account with minimal permissions:
```yaml
spec:
  serviceAccountName: limited-access-sa
  automountServiceAccountToken: true  # Only when necessary
```

---

### KKR008: Run as Non-Root User
- **Severity**: HIGH
- **Category**: Container Security
- **Description**: Detects containers that may run as root user.

**What it validates**: Checks for containers that don't have `runAsNonRoot: true` or a specific `runAsUser` set in their security context.

**Why it's important**: Running containers as root increases the attack surface. If a container is compromised, root access provides maximum privileges within the container and potentially on the host system.

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    # Missing runAsNonRoot or runAsUser triggers the rule
    securityContext: {}
```

**Remediation**: Set `runAsNonRoot: true` or specify a non-root user ID:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
```

---

### KKR009: Excessive Capabilities
- **Severity**: HIGH
- **Category**: Container Security
- **Description**: Detects containers with dangerous Linux capabilities.

**What it validates**: Checks for containers that add dangerous capabilities like `SYS_ADMIN`, `NET_ADMIN`, `SYS_TIME`, or `SYS_MODULE`.

**Why it's important**: Linux capabilities provide fine-grained privileges, but some capabilities are extremely powerful and can be used to compromise system security. Dangerous capabilities should be avoided unless absolutely necessary.

**Dangerous capabilities detected**:
- `SYS_ADMIN`: System administration privileges
- `NET_ADMIN`: Network administration
- `SYS_TIME`: System time manipulation
- `SYS_MODULE`: Kernel module operations
- `SYS_PTRACE`: Process tracing
- `SYS_BOOT`: System reboot
- `MAC_ADMIN`: Mandatory access control

**Triggers when**:
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: nginx
    securityContext:
      capabilities:
        add: ["SYS_ADMIN"]  # This triggers the rule
```

**Remediation**: Remove dangerous capabilities and follow the principle of least privilege:
```yaml
securityContext:
  capabilities:
    drop: ["ALL"]           # Drop all capabilities first
    add: ["NET_BIND_SERVICE"]  # Only add specific required capabilities
```

---

## Rule Implementation Structure

Each rule follows a consistent structure:

1. **Rule Definition**: Contains metadata (id, name, description, severity, category)
2. **Validation Function**: Returns `true` if the resource passes the security check, `false` if it violates the rule
3. **Finding Generation**: Creates a detailed finding object when a violation is detected, including:
   - Rule identification
   - Affected resource details
   - Descriptive violation message
   - Remediation guidance (where applicable)

## Best Practices for Rule Compliance

### 1. Security Context Best Practices

```yaml
securityContext:
  # Prevent privilege escalation
  allowPrivilegeEscalation: false
  
  # Run as non-root user
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  
  # Read-only root filesystem
  readOnlyRootFilesystem: true
  
  # Drop all capabilities and add only required ones
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]  # Only if needed
```

### 2. Resource Management

```yaml
resources:
  requests:
    cpu: "100m"      # Minimum CPU required
    memory: "128Mi"   # Minimum memory required
  limits:
    cpu: "500m"      # Maximum CPU allowed
    memory: "512Mi"   # Maximum memory allowed
```

### 3. Network Security

```yaml
# Avoid host networking
spec:
  hostNetwork: false
  
  containers:
  - name: app
    ports:
    - containerPort: 8080
      # Don't use hostPort
```

### 4. Service Account Security

```yaml
spec:
  # Disable token auto-mounting unless needed
  automountServiceAccountToken: false
  
  # Use dedicated service accounts with minimal permissions
  serviceAccountName: app-service-account
```

## Rule Configuration

### Enabling/Disabling Rules

Configure which rules to apply in your KubeKavach configuration:

```yaml
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

### Rule Severity Customization

Future versions will support severity customization:

```yaml
rules:
  enabled:
    - KKR001
  customSeverity:
    KKR002: HIGH  # Override default MEDIUM severity
```

## Scanning Commands

### List Available Rules

```bash
# Show all rules
kubekavach rules

# Filter by severity
kubekavach rules --severity CRITICAL

# Filter by category
kubekavach rules --category "Pod Security"

# JSON output for automation
kubekavach rules --json
```

### Run Scans with Specific Rules

```bash
# Scan with all rules
kubekavach scan

# Scan with specific rules only
kubekavach scan --rules KKR001,KKR003,KKR008

# Scan specific namespace
kubekavach scan --namespace production
```

## Integration Examples

### CI/CD Pipeline

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
    - name: Run Security Scan
      run: |
        # Scan for critical issues only
        kubekavach scan --severity CRITICAL > scan-results.txt
        
        # Fail if critical issues found
        if grep -q "CRITICAL" scan-results.txt; then
          echo "Critical security issues found!"
          cat scan-results.txt
          exit 1
        fi
```

### Policy as Code

```yaml
# security-policy.yaml
apiVersion: policy/v1
kind: SecurityPolicy
metadata:
  name: production-security
spec:
  rules:
    - KKR001  # No privileged containers
    - KKR003  # No privilege escalation
    - KKR008  # Must run as non-root
  enforcement: strict
```

## Troubleshooting

### Common Issues

#### False Positives
Some rules may trigger false positives for legitimate use cases:

1. **System Pods**: Some system components require privileged access
2. **Init Containers**: May need temporary elevated privileges
3. **Legacy Applications**: May not be easily modified

#### Exemptions
Future versions will support rule exemptions:

```yaml
exemptions:
  - rule: KKR001
    resources:
      - kind: Pod
        name: system-privileged-pod
        namespace: kube-system
    reason: "System component requires privileged access"
```

### Getting Help

1. **Rule Details**: Use `kubekavach rules --rule KKR001` for specific rule information
2. **Verbose Output**: Add `--verbose` flag for detailed scan information
3. **Debug Mode**: Set `DEBUG=kubekavach:*` for troubleshooting

## Contributing New Rules

Interested in adding new security rules? See our [Contributing Guide](../CONTRIBUTING.md) for details on:

1. Rule development guidelines
2. Testing requirements
3. Documentation standards
4. Submission process

## Version Information

- **Rules Version**: v1.0
- **Total Rules**: 9
- **Last Updated**: January 2024

For the latest rule updates and additions, visit: https://kubekavach.gensecai.org