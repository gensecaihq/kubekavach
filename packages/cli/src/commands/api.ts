import { Command, Flags } from '@oclif/core';
import { loadConfig } from '@kubekavach/core';

export default class Api extends Command {
  static description = 'Start the KubeKavach API server';

  static flags = {
    port: Flags.integer({ char: 'p', description: 'Port to run the API server on' }),
    host: Flags.string({ char: 'h', description: 'Host to bind the API server to' }),
    config: Flags.string({ char: 'c', description: 'Path to configuration file' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Api);

    try {
      // Load configuration
      const config = loadConfig();

      // Override with command line flags
      if (flags.port) {
        if (!config.api) config.api = {};
        config.api.port = flags.port;
      }

      if (flags.host) {
        if (!config.api) config.api = {};
        config.api.host = flags.host;
      }

      this.log('Starting KubeKavach API server...');

      // Import and start the server
      const { startServer } = await import('@kubekavach/api');
      await startServer();

    } catch (error: any) {
      this.error(`Failed to start API server: ${error.message}`);
    }
  }
}