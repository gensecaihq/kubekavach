
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
 *
 * @returns The loaded or default configuration.
 */
export function loadConfig(): KubeKavachConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {}; // Return default config if file doesn't exist
  }

  try {
    const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
    const data = yaml.load(fileContents);
    return KubeKavachConfigSchema.parse(data);
  } catch (error: any) {
    console.error(`Error loading configuration from ${CONFIG_PATH}:`, error);
    // Return default config on parsing error to prevent crash
    return {};
  }
}

/**
 * Saves the KubeKavach configuration to the default path.
 *
 * @param config The configuration object to save.
 */
export function saveConfig(config: KubeKavachConfig): void {
  try {
    fs.ensureDirSync(CONFIG_DIR);
    const data = yaml.dump(config);
    fs.writeFileSync(CONFIG_PATH, data, 'utf8');
  } catch (error: any) {
    console.error(`Error saving configuration to ${CONFIG_PATH}:`, error);
  }
}
