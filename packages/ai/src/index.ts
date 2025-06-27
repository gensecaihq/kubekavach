import { AIConfig, Finding } from '@kubekavach/core';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ollama from 'ollama';

export interface AIProvider {
  generateRemediation(finding: Finding): Promise<string>;
  analyzeFindings(findings: Finding[]): Promise<string>;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(config: AIConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async generateRemediation(finding: Finding): Promise<string> {
    try {
      const prompt = `You are a Kubernetes security expert. Analyze this security finding and provide specific remediation steps:

Rule: ${finding.ruleName}
Severity: ${finding.severity}
Resource: ${finding.resource.kind}/${finding.resource.name}
Namespace: ${finding.resource.namespace || 'default'}
Message: ${finding.message}

Provide:
1. Root cause analysis
2. Step-by-step remediation
3. Prevention measures
4. YAML examples if applicable

Be specific and actionable.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.1,
      });

      return response.choices[0]?.message?.content || 'No remediation available';
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async analyzeFindings(findings: Finding[]): Promise<string> {
    try {
      const summary = findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const prompt = `Analyze these Kubernetes security findings and provide a comprehensive security assessment:

Summary:
${Object.entries(summary).map(([severity, count]) => `- ${severity}: ${count} findings`).join('\n')}

Top Findings:
${findings.slice(0, 5).map(f => `- ${f.ruleName} (${f.severity}): ${f.message}`).join('\n')}

Provide:
1. Overall security posture assessment
2. Priority recommendations
3. Risk analysis
4. Compliance implications`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.1,
      });

      return response.choices[0]?.message?.content || 'No analysis available';
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(config: AIConfig) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async generateRemediation(finding: Finding): Promise<string> {
    try {
      const prompt = `As a Kubernetes security expert, analyze this security finding and provide remediation:

Rule: ${finding.ruleName}
Severity: ${finding.severity}
Resource: ${finding.resource.kind}/${finding.resource.name}
Message: ${finding.message}

Provide specific, actionable remediation steps with YAML examples.`;

      const response = await this.client.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : 'No remediation available';
    } catch (error: any) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async analyzeFindings(findings: Finding[]): Promise<string> {
    try {
      const summary = findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const prompt = `Analyze these Kubernetes security findings:

Summary: ${JSON.stringify(summary)}
Top Findings: ${findings.slice(0, 5).map(f => f.ruleName).join(', ')}

Provide security assessment and recommendations.`;

      const response = await this.client.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : 'No analysis available';
    } catch (error: any) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}

export class GoogleAIProvider implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor(config: AIConfig) {
    if (!config.apiKey) {
      throw new Error('Google AI API key is required');
    }
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async generateRemediation(finding: Finding): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-pro' });
      
      const prompt = `Kubernetes security finding remediation:
Rule: ${finding.ruleName}
Severity: ${finding.severity}
Resource: ${finding.resource.kind}/${finding.resource.name}
Message: ${finding.message}

Provide specific remediation steps.`;

      const result = await model.generateContent(prompt);
      return result.response.text() || 'No remediation available';
    } catch (error: any) {
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }

  async analyzeFindings(findings: Finding[]): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-pro' });
      
      const summary = findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const prompt = `Analyze Kubernetes security findings:
Summary: ${JSON.stringify(summary)}
Provide security assessment.`;

      const result = await model.generateContent(prompt);
      return result.response.text() || 'No analysis available';
    } catch (error: any) {
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }
}

export class OllamaProvider implements AIProvider {
  constructor(private config: AIConfig) {}

  async generateRemediation(finding: Finding): Promise<string> {
    try {
      const prompt = `Kubernetes security finding:
Rule: ${finding.ruleName}
Severity: ${finding.severity}
Resource: ${finding.resource.kind}/${finding.resource.name}
Message: ${finding.message}

Provide remediation steps:`;

      const response = await ollama.chat({
        model: this.config.model || 'llama2',
        messages: [{ role: 'user', content: prompt }],
      });

      return response.message.content || 'No remediation available';
    } catch (error: any) {
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  async analyzeFindings(findings: Finding[]): Promise<string> {
    try {
      const summary = findings.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const prompt = `Analyze security findings: ${JSON.stringify(summary)}`;

      const response = await ollama.chat({
        model: this.config.model || 'llama2',
        messages: [{ role: 'user', content: prompt }],
      });

      return response.message.content || 'No analysis available';
    } catch (error: any) {
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }
}

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'google':
      return new GoogleAIProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

export class AIService {
  private readonly provider: AIProvider;

  constructor(config: AIConfig) {
    this.provider = createAIProvider(config);
  }

  async getRemediation(finding: Finding): Promise<string> {
    return this.provider.generateRemediation(finding);
  }

  async analyzeFindings(findings: Finding[]): Promise<string> {
    return this.provider.analyzeFindings(findings);
  }
}