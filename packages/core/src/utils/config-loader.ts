
import { KubeKavachConfig, KubeKavachConfigSchema } from '../types/config';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';

const CONFIG_DIR = path.join(os.homedir(), '.kubekavach');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');

/**
 * Loads the KubeKavach configuration from the default path.
 * If no config file exists, it returns a default configuration.
 * Environment variables are prioritized for sensitive fields.
 *
 * @returns The loaded or default configuration.
 */
export function loadConfig(): KubeKavachConfig {
  let config: KubeKavachConfig = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
      const data = yaml.load(fileContents);
      config = KubeKavachConfigSchema.parse(data);
    } catch (error: any) {
      console.error(`Error loading configuration from ${CONFIG_PATH}:`, error);
      // Continue with default/env config on parsing error
    }
  }

  // Prioritize environment variables for sensitive fields
  if (process.env.KUBEKAVACH_API_KEY) {
    if (!config.api) config.api = {};
    config.api.apiKey = process.env.KUBEKAVACH_API_KEY;
  }
  if (process.env.KUBEKAVACH_AI_API_KEY) {
    if (!config.ai) config.ai = {};
    config.ai.apiKey = process.env.KUBEKAVACH_AI_API_KEY;
  }
  if (process.env.KUBEKAVACH_AI_PROVIDER) {
    if (!config.ai) config.ai = {};
    config.ai.provider = process.env.KUBEKAVACH_AI_PROVIDER as any;
  }
  if (process.env.KUBEKAVACH_KUBECONFIG_PATH) {
    config.kubeconfig = process.env.KUBEKAVACH_KUBECONFIG_PATH;
  }

  return config;
}

/**
 * Saves the KubeKavach configuration to the default path.
 *
 * @param config The configuration object to save.
 */
export function saveConfig(config: KubeKavachConfig): void {
  try {
    fs.ensureDirSync(CONFIG_DIR);
    
    // Set restrictive permissions on config directory
    fs.chmodSync(CONFIG_DIR, 0o700);
    
    const data = yaml.dump(config);
    fs.writeFileSync(CONFIG_PATH, data, 'utf8');
    
    // Set restrictive permissions on config file (owner read/write only)
    fs.chmodSync(CONFIG_PATH, 0o600);
    
    console.log(`Configuration saved to ${CONFIG_PATH} with secure permissions.`);
  } catch (error: any) {
    console.error(`Error saving configuration to ${CONFIG_PATH}:`, error);
  }
}
