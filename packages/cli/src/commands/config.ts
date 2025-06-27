
import { Command, Flags } from '@oclif/core';
import { loadConfig, saveConfig, KubeKavachConfigSchema } from '@kubekavach/core';
import * as _ from 'lodash';

export default class Config extends Command {
  static description = 'Manage KubeKavach configuration.';

  static args = [
    { name: 'action', required: true, description: 'Action to perform (get, set)' },
    { name: 'key', description: 'Configuration key (e.g., api.port, ai.apiKey)' },
    { name: 'value', description: 'Configuration value to set' },
  ];

  async run(): Promise<void> {
    const { args } = await this.parse(Config);
    let config = loadConfig();

    switch (args.action) {
      case 'get':
        if (args.key) {
          const value = _.get(config, args.key);
          if (value !== undefined) {
            // Redact sensitive values
            const redactedValue = this.redactSensitiveData(args.key, value);
            this.log(JSON.stringify(redactedValue, null, 2));
          } else {
            this.error(`Configuration key '${args.key}' not found.`);
          }
        } else {
          // Redact sensitive data from full config display
          const redactedConfig = this.redactSensitiveConfig(config);
          this.log(JSON.stringify(redactedConfig, null, 2));
        }
        break;
      case 'set':
        if (!args.key || args.value === undefined) {
          this.error('Usage: kubekavach config set <key> <value>');
        }
        try {
          // Attempt to parse value as JSON, otherwise treat as string
          let parsedValue = args.value;
          try {
            parsedValue = JSON.parse(args.value);
          } catch (e) {
            // Not JSON, keep as string
          }

          _.set(config, args.key, parsedValue);
          // Validate against schema after setting
          config = KubeKavachConfigSchema.parse(config);
          saveConfig(config);
          this.log(`Configuration key '${args.key}' set to '${args.value}'.`);
        } catch (error: any) {
          this.error(`Failed to set configuration: ${error.message}`);
        }
        break;
      default:
        this.error('Invalid action. Use 'get' or 'set'.');
    }
  }

  private redactSensitiveData(key: string, value: any): any {
    const sensitiveKeys = ['apiKey', 'api.apiKey', 'ai.apiKey'];
    
    if (sensitiveKeys.includes(key) || key.toLowerCase().includes('apikey') || key.toLowerCase().includes('secret')) {
      return '***REDACTED***';
    }
    
    return value;
  }

  private redactSensitiveConfig(config: any): any {
    const redacted = JSON.parse(JSON.stringify(config));
    
    if (redacted.api?.apiKey) {
      redacted.api.apiKey = '***REDACTED***';
    }
    
    if (redacted.ai?.apiKey) {
      redacted.ai.apiKey = '***REDACTED***';
    }

    if (redacted.users) {
      redacted.users = redacted.users.map((user: any) => ({
        ...user,
        apiKey: '***REDACTED***'
      }));
    }
    
    return redacted;
  }
}
