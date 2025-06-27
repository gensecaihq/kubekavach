
import { Command, Flags } from '@oclif/core';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { ReplayEngine, ReplayError } from '@kubekavach/replay';

export default class Replay extends Command {
  static description = 'Replay a Kubernetes pod locally for debugging.';

  static flags = {
    namespace: Flags.string({ char: 'n', description: 'Kubernetes namespace of the pod', required: true }),
    pod: Flags.string({ char: 'p', description: 'Name of the pod to replay', required: true }),
    kubeconfig: Flags.string({ description: 'Path to kubeconfig file' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Replay);

    try {
      const kc = new KubeConfig();
      flags.kubeconfig ? kc.loadFromFile(flags.kubeconfig) : kc.loadFromDefault();

      const k8sCoreApi = kc.makeApiClient(CoreV1Api);

      this.log(`Fetching pod ${flags.pod} from namespace ${flags.namespace}...`);
      const podResponse = await k8sCoreApi.readNamespacedPod(flags.pod, flags.namespace);

      const replayEngine = new ReplayEngine();
      await replayEngine.replay(podResponse.body);

    } catch (error: any) {
      if (error instanceof ReplayError) {
        this.error(`Replay Error: ${error.message}${error.cause ? `\nCause: ${error.cause.message}` : ''}`);
      } else if (error.response && error.response.statusCode === 404) {
        this.error(`Pod '${flags.pod}' not found in namespace '${flags.namespace}'.`);
      } else if (error.response && error.response.statusCode === 403) {
        this.error('Forbidden: Insufficient permissions to access Kubernetes pod. Check your RBAC.');
      } else if (error.message.includes('kubeconfig')) {
        this.error(`Kubeconfig error: ${error.message}. Please check your kubeconfig file.`);
      } else {
        this.error(`Failed to replay pod: ${error.message}`);
      }
    }
  }
}
