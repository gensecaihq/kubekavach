
import { Finding, AIProvider, AIConfig } from '@kubekavach/core';

export class AIService {
  private readonly provider: AIProvider;

  constructor(private readonly config: AIConfig) {
    // In a real implementation, you would instantiate the correct provider
    // based on the config.
    this.provider = {
      async getRemediation(finding: Finding): Promise<string> {
        return `Placeholder remediation for ${finding.ruleName}`;
      },
    };
  }

  async getRemediation(finding: Finding): Promise<string> {
    return this.provider.getRemediation(finding);
  }
}
