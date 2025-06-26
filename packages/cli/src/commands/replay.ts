
import { Command, Flags } from '@oclif/core';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { ReplayEngine } from '@kubekavach/replay';

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
      const pod = await k8sCoreApi.readNamespacedPod(flags.pod, flags.namespace);

      const replayEngine = new ReplayEngine();
      await replayEngine.replay(pod.body);

    } catch (error: any) {
      this.error(`Failed to replay pod: ${error.message}`);
    }
  }
}
