#!/bin/bash

# KubeKavach Deployment Script
# This script deploys KubeKavach to a Kubernetes cluster

set -euo pipefail

# Configuration
NAMESPACE="kubekavach"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONFIG_ENV="${CONFIG_ENV:-production}"
KUBECTL_CMD="${KUBECTL_CMD:-kubectl}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v $KUBECTL_CMD &> /dev/null; then
        error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! $KUBECTL_CMD cluster-info &> /dev/null; then
        error "Unable to connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if running as the right user
    local current_context=$($KUBECTL_CMD config current-context)
    log "Current kubectl context: $current_context"
    
    success "Prerequisites check passed"
}

# Create namespace if it doesn't exist
create_namespace() {
    log "Creating namespace: $NAMESPACE"
    
    if $KUBECTL_CMD get namespace $NAMESPACE &> /dev/null; then
        warn "Namespace $NAMESPACE already exists"
    else
        $KUBECTL_CMD apply -f k8s/namespace.yaml
        success "Namespace $NAMESPACE created"
    fi
}

# Deploy secrets
deploy_secrets() {
    log "Deploying secrets..."
    
    # Check if secrets file exists
    if [[ ! -f "k8s/secrets.yaml" ]]; then
        error "Secrets file not found: k8s/secrets.yaml"
        exit 1
    fi
    
    # Warn about default secrets
    warn "Using default secrets from k8s/secrets.yaml"
    warn "In production, please update with your own secure values"
    
    $KUBECTL_CMD apply -f k8s/secrets.yaml
    success "Secrets deployed"
}

# Deploy ConfigMap
deploy_configmap() {
    log "Deploying ConfigMap..."
    
    $KUBECTL_CMD apply -f k8s/configmap.yaml
    success "ConfigMap deployed"
}

# Deploy API
deploy_api() {
    log "Deploying API service..."
    
    # Update image tag in deployment
    sed -i.bak "s|kubekavach/api:latest|kubekavach/api:$IMAGE_TAG|g" k8s/api-deployment.yaml
    
    $KUBECTL_CMD apply -f k8s/api-deployment.yaml
    
    # Restore original file
    mv k8s/api-deployment.yaml.bak k8s/api-deployment.yaml
    
    success "API service deployed"
}

# Deploy UI
deploy_ui() {
    log "Deploying UI service..."
    
    # Update image tag in deployment
    sed -i.bak "s|kubekavach/ui:latest|kubekavach/ui:$IMAGE_TAG|g" k8s/ui-deployment.yaml
    
    $KUBECTL_CMD apply -f k8s/ui-deployment.yaml
    
    # Restore original file
    mv k8s/ui-deployment.yaml.bak k8s/ui-deployment.yaml
    
    success "UI service deployed"
}

# Deploy services
deploy_services() {
    log "Deploying services..."
    
    $KUBECTL_CMD apply -f k8s/services.yaml
    success "Services deployed"
}

# Deploy ingress
deploy_ingress() {
    log "Deploying ingress..."
    
    if [[ -f "k8s/ingress.yaml" ]]; then
        $KUBECTL_CMD apply -f k8s/ingress.yaml
        success "Ingress deployed"
    else
        warn "Ingress file not found, skipping ingress deployment"
    fi
}

# Wait for deployments to be ready
wait_for_deployments() {
    log "Waiting for deployments to be ready..."
    
    # Wait for API deployment
    log "Waiting for API deployment..."
    if $KUBECTL_CMD rollout status deployment/kubekavach-api -n $NAMESPACE --timeout=300s; then
        success "API deployment is ready"
    else
        error "API deployment failed to become ready"
        return 1
    fi
    
    # Wait for UI deployment
    log "Waiting for UI deployment..."
    if $KUBECTL_CMD rollout status deployment/kubekavach-ui -n $NAMESPACE --timeout=300s; then
        success "UI deployment is ready"
    else
        error "UI deployment failed to become ready"
        return 1
    fi
    
    success "All deployments are ready"
}

# Run health checks
run_health_checks() {
    log "Running health checks..."
    
    # Get API pod
    local api_pod=$($KUBECTL_CMD get pods -n $NAMESPACE -l app=kubekavach-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [[ -z "$api_pod" ]]; then
        error "No API pod found"
        return 1
    fi
    
    log "Found API pod: $api_pod"
    
    # Port forward for health check
    log "Setting up port forward for health check..."
    $KUBECTL_CMD port-forward -n $NAMESPACE pod/$api_pod 8080:8080 &
    local port_forward_pid=$!
    
    # Wait a moment for port forward to establish
    sleep 5
    
    # Check API health
    local health_check_passed=false
    for i in {1..10}; do
        if curl -f http://localhost:8080/health &> /dev/null; then
            success "API health check passed"
            health_check_passed=true
            break
        else
            warn "Health check attempt $i failed, retrying..."
            sleep 2
        fi
    done
    
    # Clean up port forward
    kill $port_forward_pid 2>/dev/null || true
    
    if [[ "$health_check_passed" == "true" ]]; then
        success "Health checks passed"
        return 0
    else
        error "Health checks failed"
        return 1
    fi
}

# Display deployment information
show_deployment_info() {
    log "Deployment information:"
    
    echo
    echo "=== PODS ==="
    $KUBECTL_CMD get pods -n $NAMESPACE
    
    echo
    echo "=== SERVICES ==="
    $KUBECTL_CMD get services -n $NAMESPACE
    
    echo
    echo "=== INGRESS ==="
    $KUBECTL_CMD get ingress -n $NAMESPACE 2>/dev/null || echo "No ingress found"
    
    echo
    echo "=== ENDPOINTS ==="
    local api_service_ip=$($KUBECTL_CMD get service kubekavach-api -n $NAMESPACE -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "N/A")
    local ui_service_ip=$($KUBECTL_CMD get service kubekavach-ui -n $NAMESPACE -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "N/A")
    
    echo "API Service: http://$api_service_ip:8080"
    echo "UI Service: http://$ui_service_ip:80"
    
    # Show ingress URL if available
    local ingress_host=$($KUBECTL_CMD get ingress kubekavach-ingress -n $NAMESPACE -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "")
    if [[ -n "$ingress_host" ]]; then
        echo "Public URL: https://$ingress_host"
    fi
    
    echo
    success "Deployment completed successfully!"
}

# Cleanup function
cleanup() {
    log "Cleaning up..."
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
}

# Trap cleanup on exit
trap cleanup EXIT

# Main deployment function
main() {
    log "Starting KubeKavach deployment..."
    log "Namespace: $NAMESPACE"
    log "Image tag: $IMAGE_TAG"
    log "Config environment: $CONFIG_ENV"
    
    check_prerequisites
    create_namespace
    deploy_secrets
    deploy_configmap
    deploy_api
    deploy_ui
    deploy_services
    deploy_ingress
    
    if wait_for_deployments; then
        if run_health_checks; then
            show_deployment_info
        else
            error "Health checks failed, but deployment may still be functional"
            show_deployment_info
            exit 1
        fi
    else
        error "Deployment failed"
        show_deployment_info
        exit 1
    fi
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Deploy KubeKavach to Kubernetes cluster"
    echo
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -n, --namespace NAME    Kubernetes namespace (default: kubekavach)"
    echo "  -t, --tag TAG          Docker image tag (default: latest)"
    echo "  -e, --env ENV          Config environment (default: production)"
    echo "  -k, --kubectl CMD      kubectl command (default: kubectl)"
    echo
    echo "Environment Variables:"
    echo "  IMAGE_TAG              Docker image tag"
    echo "  CONFIG_ENV             Configuration environment"
    echo "  KUBECTL_CMD            kubectl command to use"
    echo
    echo "Examples:"
    echo "  $0                                    # Deploy with defaults"
    echo "  $0 -t v1.0.0                        # Deploy specific version"
    echo "  $0 -n my-namespace -t latest         # Deploy to custom namespace"
    echo "  IMAGE_TAG=v1.0.0 $0                 # Deploy using environment variable"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -e|--env)
            CONFIG_ENV="$2"
            shift 2
            ;;
        -k|--kubectl)
            KUBECTL_CMD="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main