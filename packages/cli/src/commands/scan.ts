
import { Command, Flags } from '@oclif/core';
import { allRules } from '@kubekavach/rules';
import { KubeConfig, CoreV1Api, AppsV1Api, BatchV1Api, rbacv1 } from '@kubernetes/client-node';
import { Finding, ScanResult } from '@kubekavach/core';
import cli from 'cli-ux';

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

      const k8sCoreApi = kc.makeApiClient(CoreV1Api);
      const k8sAppsApi = kc.makeApiClient(AppsV1Api);
      const k8sBatchApi = kc.makeApiClient(BatchV1Api);

      cli.action.start('Scanning cluster');

      const resources = await this.fetchAllResources(k8sCoreApi, k8sAppsApi, k8sBatchApi, flags.namespace);
      const findings = this.runRules(resources);

      cli.action.stop();

      this.displayResults(findings);

    } catch (error: any) {
      this.error(`Failed to scan cluster: ${error.message}`);
    }
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
    for (const resource of resources) {
      for (const rule of allRules) {
        if (!rule.validate(resource)) {
          findings.push(rule.getFinding(resource));
        }
      }
    }
    return findings;
  }

  private displayResults(findings: Finding[]): void {
    if (findings.length === 0) {
      this.log('No security issues found.');
      return;
    }

    this.log('Security Scan Results:');
    cli.table(findings, {
      ruleName: { header: 'Rule' },
      severity: { header: 'Severity' },
      resource: { get: row => `${row.resource.kind}/${row.resource.name}` },
      message: { header: 'Message' },
    });
  }
}
