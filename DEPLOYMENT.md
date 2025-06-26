
# KubeKavach Deployment Guide

This guide provides instructions for deploying the KubeKavach API server and UI to a Kubernetes cluster.

## Prerequisites

*   A running Kubernetes cluster.
*   `kubectl` configured to connect to your cluster.
*   `helm` installed.

## Deployment

KubeKavach provides a Helm chart for easy deployment.

1.  Navigate to the `helm/kubekavach` directory:
    ```bash
    cd helm/kubekavach
    ```

2.  Update the `values.yaml` file with your desired configuration. At a minimum, you should set the `api.apiKey` to a secure value.

3.  Install the Helm chart:
    ```bash
    helm install kubekavach .
    ```

This will deploy the KubeKavach API server and UI to your cluster. You can access the UI by port-forwarding the `kubekavach-ui` service:

```bash
kubectl port-forward svc/kubekavach-ui 8080:80
```

You can then access the dashboard at `http://localhost:8080`.
