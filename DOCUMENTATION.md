
# KubeKavach: Detailed Technical Documentation

This document provides a detailed technical overview of KubeKavach, a developer-first Kubernetes security scanner. It is intended for developers, security engineers, and anyone interested in understanding the inner workings of the tool.

### 1. Core Package (`@kubekavach/core`)

The `@kubekavach/core` package is the foundational layer of the KubeKavach ecosystem. It provides shared types, constants, and utilities that are used across all other packages.

#### 1.1. Key Files and Functionality

*   **`src/index.ts`**: This is the main entry point of the package. It exports all the public APIs, including types, utilities, constants, and compliance-related functions.
*   **`src/constants.ts`**: This file defines a set of constants that are used throughout the application. These include:
    *   `VERSION`: The current version of KubeKavach.
    *   `DEFAULT_NAMESPACE`: The default Kubernetes namespace to use.
    *   `SCAN_TIMEOUT`: The timeout for security scans.
    *   `AI_TIMEOUT`: The timeout for AI-powered remediation suggestions.
    *   `RULE_CATEGORIES`: An enumeration of the different categories of security rules.
    *   `SERVICE_PATTERNS`: A collection of regular expression patterns to identify common services (e.g., Redis, PostgreSQL) based on environment variables.
*   **`src/types/scan.ts`**: This file defines the core data structures for security scans. It uses the `zod` library to define a robust schema for scan results. The key types are:
    *   `Severity`: An enumeration of the different severity levels for security findings (CRITICAL, HIGH, MEDIUM, LOW).
    *   `ScanResult`: The main data structure for a scan result. It includes the scan ID, timestamp, cluster information, duration, a summary of the findings, and a detailed list of each finding.
    *   `Finding`: A single security finding. It includes the rule ID, rule name, severity, the affected resource, a descriptive message, and optional details and remediation suggestions.

### 2. Rules Package (`@kubekavach/rules`)

The `@kubekavach/rules` package is responsible for the security rule engine. It defines the logic for checking various Kubernetes configurations and identifying potential security issues.

*   **Rule Definiton**: While the source code for the rules is not available in the provided directory listing, the `package.json` file indicates that this package depends on `@kubekavach/core` and `@kubernetes/client-node`. This suggests that the rules are implemented as TypeScript functions that interact with the Kubernetes API to fetch resource configurations and then evaluate them against a set of security best practices.
*   **Extensibility**: The rule engine is designed to be extensible. Users can add their own custom rules by creating new TypeScript files that export a rule definition object. This object would include the rule ID, name, severity, and the logic for the check.

### 3. Replay Package (`@kubekavach/replay`)

The `@kubekavach/replay` package provides the pod replay functionality. This feature allows developers to debug production issues locally by replicating the exact environment of a running pod.

*   **Functionality**: The replay engine fetches the pod's YAML definition from the cluster, extracts its environment variables, secrets, and configmaps, and then generates a `docker-compose.yml` file. It then builds a new Docker image with the pod's configuration and starts a local container that mimics the pod's environment.
*   **Dependencies**: This package depends on `@kubernetes/client-node` to interact with the Kubernetes API, `dockerode` to manage local Docker containers, and `handlebars` for templating the `docker-compose.yml` file.

### 4. AI Package (`@kubekavach/ai`)

The `@kubekavach/ai` package integrates with large language models (LLMs) to provide intelligent, context-aware suggestions for fixing identified security problems.

*   **Providers**: This package includes dependencies for major AI providers, including `openai`, `@anthropic-ai/sdk`, and `@google/generative-ai`. This allows users to choose their preferred AI provider.
*   **Remediation**: When a security finding is identified, the AI package sends a request to the configured AI provider with the details of the finding. The AI provider then returns a set of remediation suggestions that are displayed to the user.

### 5. API Package (`@kubekavach/api`)

The `@kubekavach/api` package provides a Fastify-based REST API server that powers the web dashboard.

*   **Endpoints**: The API server exposes a set of endpoints that allow the web dashboard to fetch scan results, manage security rules, and track the overall security posture of the cluster.
*   **Dependencies**: This package depends on `@kubekavach/core` and `@kubekavach/rules` to access the core data structures and the rule engine. It also uses `@fastify/cors` for Cross-Origin Resource Sharing, `@fastify/helmet` for security headers, and `@fastify/swagger` for API documentation.

### 6. UI Package (`@kubekavach/ui`)

The `@kubekavach/ui` package provides the web front-end for the KubeKavach dashboard.

*   **Technology**: The dashboard is built with SvelteKit, a modern web framework for building fast and reactive user interfaces. It also uses Tailwind CSS for styling.
*   **Features**: The dashboard provides a user-friendly interface for visualizing scan results, managing security rules, and tracking the security posture of the cluster over time. It uses `chart.js` to create interactive charts and graphs.

### 7. CLI Package (`kubekavach`)

The `kubekavach` package is the main command-line interface (CLI) for KubeKavach.

*   **Framework**: The CLI is built with oclif, a framework for building command-line tools in Node.js.
*   **Commands**: The CLI provides a set of commands for interacting with KubeKavach, including:
    *   `kubekavach scan`: Scans the currently configured Kubernetes cluster for security issues.
    *   `kubekavach replay <pod-name> -n <namespace>`: Replays a pod locally for debugging.
    *   `kubekavach dashboard`: Launches the web dashboard.
    *   `kubekavach config`: Manages the KubeKavach configuration.
    *   `kubekavach compliance`: Provides features for Indian regulatory compliance (CERT-IN, MeitY).

### 8. Security Best Practices

*   **Dependency Scanning**: It is recommended to run `pnpm audit` regularly to identify and fix known vulnerabilities in the project's dependencies.
