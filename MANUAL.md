
# KubeKavach User Manual

This manual provides a comprehensive guide to using the KubeKavach command-line interface (CLI).

## Installation

To install the KubeKavach CLI, you will need Node.js (v18 or later) and pnpm (v8 or later).

1.  Clone the repository:
    ```bash
    git clone https://github.com/kubekavach/kubekavach.git
    cd kubekavach
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    ```

3.  Build the packages:
    ```bash
    pnpm build
    ```

4.  Link the CLI for global access:
    ```bash
    pnpm link --global
    ```

## Commands

### `kubekavach scan`

Scans a Kubernetes cluster for security vulnerabilities.

**Usage:**

```bash
kubekavach scan [flags]
```

**Flags:**

*   `-n, --namespace`: The Kubernetes namespace to scan. If not specified, all namespaces will be scanned.
*   `--kubeconfig`: Path to your kubeconfig file. If not specified, the default kubeconfig will be used.

**Security Note:** When configuring Kubernetes access for KubeKavach, adhere to the principle of least privilege. Grant only the necessary permissions for KubeKavach to perform its scanning and replay functions. Avoid using highly privileged credentials (e.g., cluster-admin) unless absolutely required for specific operations.

**Example:**

```bash
kubekavach scan -n my-namespace
```

### `kubekavach replay`

Replays a Kubernetes pod locally for debugging.

**Usage:**

```bash
kubekavach replay [flags]
```

**Flags:**

*   `-n, --namespace`: The Kubernetes namespace of the pod.
*   `-p, --pod`: The name of the pod to replay.
*   `--kubeconfig`: Path to your kubeconfig file.

**Example:**

```bash
kubekavach replay -n my-namespace -p my-pod
```

### `kubekavach config`

Manages the KubeKavach configuration.

**Usage:**

```bash
kubekavach config [subcommand]
```

**Subcommands:**

*   `get`: Get the current configuration.
*   `set <key> <value>`: Set a configuration value.

**Example:**

```bash
kubekavach config set ai.provider openai
```
