# KubeKavach Deployment Guide

This guide covers various deployment options for KubeKavach in production environments.

## 🚀 Quick Deployment

### Docker Compose (Development)

```yaml
version: '3.8'
services:
  kubekavach-api:
    image: kubekavach:latest
    ports:
      - "3000:3000"
    environment:
      - KUBEKAVACH_API_KEY=your-secure-api-key
      - KUBEKAVACH_AI_PROVIDER=openai
      - KUBEKAVACH_AI_API_KEY=your-openai-key
    volumes:
      - ~/.kube:/root/.kube:ro
      - kubekavach-config:/root/.kubekavach
    restart: unless-stopped

volumes:
  kubekavach-config:
```

### Docker Run

```bash
docker run -d \
  --name kubekavach \
  -p 3000:3000 \
  -e KUBEKAVACH_API_KEY=your-secure-api-key \
  -e KUBEKAVACH_AI_PROVIDER=openai \
  -e KUBEKAVACH_AI_API_KEY=your-openai-key \
  -v ~/.kube:/root/.kube:ro \
  -v kubekavach-config:/root/.kubekavach \
  kubekavach:latest
```

## ☸️ Kubernetes Deployment

### Namespace and RBAC

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: kubekavach-system
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kubekavach
  namespace: kubekavach-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubekavach-reader
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "daemonsets", "statefulsets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["batch"]
  resources: ["jobs", "cronjobs"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["networking.k8s.io"]
  resources: ["networkpolicies"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kubekavach-reader-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kubekavach-reader
subjects:
- kind: ServiceAccount
  name: kubekavach
  namespace: kubekavach-system
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kubekavach-config
  namespace: kubekavach-system
data:
  config.yaml: |
    api:
      port: 3000
      host: "0.0.0.0"
      corsOrigin: "https://kubekavach.example.com"
      rateLimit:
        max: 1000
        timeWindow: "1 minute"
    ai:
      provider: "openai"
      model: "gpt-4"
    replay:
      secretHandling: "placeholder"
```

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kubekavach-secrets
  namespace: kubekavach-system
type: Opaque
data:
  api-key: eW91ci1zZWN1cmUtYXBpLWtleQ==  # base64 encoded
  ai-api-key: eW91ci1haS1hcGkta2V5     # base64 encoded
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubekavach-api
  namespace: kubekavach-system
  labels:
    app: kubekavach-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kubekavach-api
  template:
    metadata:
      labels:
        app: kubekavach-api
    spec:
      serviceAccountName: kubekavach
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
      containers:
      - name: kubekavach-api
        image: kubekavach:latest
        ports:
        - containerPort: 3000
          protocol: TCP
        env:
        - name: KUBEKAVACH_API_KEY
          valueFrom:
            secretKeyRef:
              name: kubekavach-secrets
              key: api-key
        - name: KUBEKAVACH_AI_API_KEY
          valueFrom:
            secretKeyRef:
              name: kubekavach-secrets
              key: ai-api-key
        - name: KUBEKAVACH_AI_PROVIDER
          value: "openai"
        volumeMounts:
        - name: config
          mountPath: /app/.kubekavach
          readOnly: true
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
      volumes:
      - name: config
        configMap:
          name: kubekavach-config
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kubekavach-api-service
  namespace: kubekavach-system
spec:
  selector:
    app: kubekavach-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kubekavach-ingress
  namespace: kubekavach-system
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - kubekavach.example.com
    secretName: kubekavach-tls
  rules:
  - host: kubekavach.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: kubekavach-api-service
            port:
              number: 80
```

## 🔧 Helm Deployment

### Install with Helm

```bash
# Install with custom values
helm install kubekavach ./helm/kubekavach \
  --namespace kubekavach-system \
  --create-namespace \
  --set api.apiKey="your-secure-api-key" \
  --set ai.provider="openai" \
  --set ai.apiKey="your-openai-key" \
  --set ingress.enabled=true \
  --set ingress.host="kubekavach.example.com"
```

## 🔐 Security Hardening

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kubekavach-network-policy
  namespace: kubekavach-system
spec:
  podSelector:
    matchLabels:
      app: kubekavach-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443  # HTTPS for AI APIs
    - protocol: TCP
      port: 6443  # Kubernetes API
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 53   # DNS
    - protocol: UDP
      port: 53   # DNS
```

## 📋 Production Checklist

- [ ] **Security**: All secrets properly configured
- [ ] **RBAC**: Minimal required permissions granted
- [ ] **Resources**: CPU/Memory limits set
- [ ] **Monitoring**: Metrics and alerts configured
- [ ] **Backup**: Configuration and data backup scheduled
- [ ] **TLS**: HTTPS enabled for all endpoints
- [ ] **Network**: Network policies configured
- [ ] **Logging**: Centralized logging configured
- [ ] **Updates**: Update strategy defined
- [ ] **Documentation**: Runbooks created

---

For additional support, contact [support@kubekavach.io](mailto:support@kubekavach.io).