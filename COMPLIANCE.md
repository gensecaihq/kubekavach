# KubeKavach - Indian Regulatory Compliance

## Overview

KubeKavach is designed to meet Indian cybersecurity regulatory requirements, particularly those mandated by CERT-IN (Indian Computer Emergency Response Team) and MeitY (Ministry of Electronics and Information Technology).

## CERT-IN Compliance

### Incident Reporting (As per CERT-IN Order 2022)

KubeKavach automatically categorizes security findings according to CERT-IN incident categories:

- **Malware**: Detection of malicious containers or images
- **Unauthorized Access**: Privileged containers, host namespace access
- **Configuration Errors**: Missing security contexts, resource limits
- **Vulnerabilities**: Known CVEs in container images
- **Policy Violations**: Non-compliance with security policies
- **Data Breach Risk**: Secrets exposed in environment variables

### Mandatory Reporting

For CRITICAL and HIGH severity findings, KubeKavach can generate CERT-IN compliant incident reports within the mandated 6-hour window.

## MeitY Compliance

### Data Localization

- All scan data can be configured to stay within Indian data centers
- Support for Indian cloud regions (AWS Mumbai, Azure India, GCP Mumbai)
- No data leaves Indian jurisdiction without explicit configuration

### Audit Trail Requirements

KubeKavach maintains comprehensive audit logs including:

- User actions with timestamps
- Resource access patterns
- Security scan executions
- Remediation activities
- Configuration changes

## Configuration

See deployment documentation for detailed compliance setup instructions.
