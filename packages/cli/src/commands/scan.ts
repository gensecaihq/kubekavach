
import { Command, Flags } from '@oclif/core';
import { allRules } from '@kubekavach/rules';
import { KubeConfig, CoreV1Api, AppsV1Api, BatchV1Api } from '@kubernetes/client-node';
import { Finding, ScanResult, validateKubernetesManifest } from '@kubekavach/core';
import { ux } from '@oclif/core';

interface KubernetesClients {
  core: CoreV1Api;
  apps: AppsV1Api;
  batch: BatchV1Api;
}

export default class Scan extends Command {
  static description = 'Scan a Kubernetes cluster for security vulnerabilities.';

  static flags = {
    namespace: Flags.string({ char: 'n', description: 'Kubernetes namespace to scan' }),
    kubeconfig: Flags.string({ description: 'Path to kubeconfig file' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Scan);

    try {
      const kc = new KubeConfig();
      flags.kubeconfig ? kc.loadFromFile(flags.kubeconfig) : kc.loadFromDefault();

      const clients: KubernetesClients = {
        core: kc.makeApiClient(CoreV1Api),
        apps: kc.makeApiClient(AppsV1Api),
        batch: kc.makeApiClient(BatchV1Api),
      };

      await this.performScan(clients, flags.namespace);

    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        this.error('Could not connect to Kubernetes API server. Is kubeconfig correct and context set?');
      } else if (error.statusCode === 403) {
        this.error('Forbidden: Insufficient permissions to access Kubernetes resources. Check your RBAC.');
      } else if (error.message.includes('kubeconfig')) {
        this.error(`Kubeconfig error: ${error.message}. Please check your kubeconfig file.`);
      } else {
        this.error(`Failed to scan cluster: ${error.message}`);
      }
    }
  }

  async performScan(clients: KubernetesClients, namespace?: string): Promise<void> {
    ux.action.start('Scanning cluster');

    const resources = await this.fetchAllResources(clients.core, clients.apps, clients.batch, namespace);
    const findings = this.runRules(resources);

    ux.action.stop();

    this.displayResults(findings);
  }

  private async fetchAllResources(k8sCoreApi: CoreV1Api, k8sAppsApi: AppsV1Api, k8sBatchApi: BatchV1Api, namespace?: string): Promise<any[]> {
    const resources: any[] = [];

    const pods = namespace ? await k8sCoreApi.listNamespacedPod(namespace) : await k8sCoreApi.listPodForAllNamespaces();
    resources.push(...pods.body.items);

    const deployments = namespace ? await k8sAppsApi.listNamespacedDeployment(namespace) : await k8sAppsApi.listDeploymentForAllNamespaces();
    resources.push(...deployments.body.items);

    const daemonSets = namespace ? await k8sAppsApi.listNamespacedDaemonSet(namespace) : await k8sAppsApi.listDaemonSetForAllNamespaces();
    resources.push(...daemonSets.body.items);

    const statefulSets = namespace ? await k8sAppsApi.listNamespacedStatefulSet(namespace) : await k8sAppsApi.listStatefulSetForAllNamespaces();
    resources.push(...statefulSets.body.items);

    const jobs = namespace ? await k8sBatchApi.listNamespacedJob(namespace) : await k8sBatchApi.listJobForAllNamespaces();
    resources.push(...jobs.body.items);

    return resources;
  }

  private runRules(resources: any[]): Finding[] {
    const findings: Finding[] = [];
    let processedCount = 0;
    let skippedCount = 0;
    
    for (const resource of resources) {
      try {
        // Validate manifest against Kubernetes schema before running rules
        if (!validateKubernetesManifest(resource)) {
          this.warn(`Skipping invalid Kubernetes manifest: ${resource.kind}/${resource.metadata?.name}`);
          skippedCount++;
          continue;
        }

        for (const rule of allRules) {
          try {
            if (!rule.validate(resource)) {
              findings.push(rule.getFinding(resource));
            }
          } catch (error: any) {
            this.warn(`Rule ${rule.id} failed for resource ${resource.kind}/${resource.metadata?.name}: ${error.message}`);
          }
        }
        processedCount++;
      } catch (error: any) {
        this.warn(`Error processing resource: ${error.message}`);
        skippedCount++;
      }
    }
    
    this.log(`Processed ${processedCount} resources, skipped ${skippedCount} resources`);
    return findings;
  }

  private displayResults(findings: Finding[]): void {
    if (findings.length === 0) {
      this.log('No security issues found.');
      return;
    }

    this.log('Security Scan Results:');
    ux.table(findings, {
      ruleName: { header: 'Rule' },
      severity: { header: 'Severity' },
      resource: { get: row => `${row.resource.kind}/${row.resource.name}` },
      message: { header: 'Message' },
    });
  }
}
