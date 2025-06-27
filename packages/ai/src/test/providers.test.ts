import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider, AnthropicProvider, GoogleAIProvider, OllamaProvider } from '../index';
import { Finding } from '@kubekavach/core';

// Mock the AI SDKs
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Set securityContext.privileged to false in your pod specification'
            }
          }]
        })
      }
    }
  }))
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          text: 'Set securityContext.privileged to false in your pod specification'
        }]
      })
    }
  }))
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue('Set securityContext.privileged to false in your pod specification')
        }
      })
    })
  }))
}));

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue({
      message: {
        content: 'Set securityContext.privileged to false in your pod specification'
      }
    })
  }))
}));

describe('AI Providers', () => {
  const mockFinding: Finding = {
    ruleId: 'KKR001',
    ruleName: 'Privileged Container',
    severity: 'CRITICAL' as const,
    resource: {
      kind: 'Pod',
      name: 'test-pod',
      namespace: 'default'
    },
    message: 'Container is running in privileged mode',
    remediation: 'Set securityContext.privileged to false'
  };

  describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4'
      });
    });

    it('should generate remediation for finding', async () => {
      const remediation = await provider.generateRemediation(mockFinding);

      expect(remediation).toBe('Set securityContext.privileged to false in your pod specification');
    });

    it('should handle API errors gracefully', async () => {
      const OpenAI = await import('openai');
      const mockOpenAI = vi.mocked(OpenAI.default);
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error'))
          }
        }
      }) as any);

      const errorProvider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4'
      });

      await expect(errorProvider.generateRemediation(mockFinding))
        .rejects.toThrow('OpenAI API error: API Error');
    });

    it('should validate configuration', () => {
      expect(() => new OpenAIProvider({ apiKey: '', model: 'gpt-4' }))
        .toThrow('OpenAI API key is required');

      expect(() => new OpenAIProvider({ apiKey: 'test', model: '' }))
        .toThrow('OpenAI model is required');
    });
  });

  describe('AnthropicProvider', () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
      provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-3-sonnet-20240229'
      });
    });

    it('should generate remediation for finding', async () => {
      const remediation = await provider.generateRemediation(mockFinding);

      expect(remediation).toBe('Set securityContext.privileged to false in your pod specification');
    });

    it('should handle API errors gracefully', async () => {
      const Anthropic = await import('@anthropic-ai/sdk');
      const mockAnthropic = vi.mocked(Anthropic.default);
      mockAnthropic.mockImplementation(() => ({
        messages: {
          create: vi.fn().mockRejectedValue(new Error('API Error'))
        }
      }) as any);

      const errorProvider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-3-sonnet-20240229'
      });

      await expect(errorProvider.generateRemediation(mockFinding))
        .rejects.toThrow('Anthropic API error: API Error');
    });

    it('should validate configuration', () => {
      expect(() => new AnthropicProvider({ apiKey: '', model: 'claude-3-sonnet-20240229' }))
        .toThrow('Anthropic API key is required');

      expect(() => new AnthropicProvider({ apiKey: 'test', model: '' }))
        .toThrow('Anthropic model is required');
    });
  });

  describe('GoogleAIProvider', () => {
    let provider: GoogleAIProvider;

    beforeEach(() => {
      provider = new GoogleAIProvider({
        apiKey: 'test-api-key',
        model: 'gemini-pro'
      });
    });

    it('should generate remediation for finding', async () => {
      const remediation = await provider.generateRemediation(mockFinding);

      expect(remediation).toBe('Set securityContext.privileged to false in your pod specification');
    });

    it('should handle API errors gracefully', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockGoogleAI = vi.mocked(GoogleGenerativeAI);
      mockGoogleAI.mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockRejectedValue(new Error('API Error'))
        })
      }) as any);

      const errorProvider = new GoogleAIProvider({
        apiKey: 'test-api-key',
        model: 'gemini-pro'
      });

      await expect(errorProvider.generateRemediation(mockFinding))
        .rejects.toThrow('Google AI API error: API Error');
    });

    it('should validate configuration', () => {
      expect(() => new GoogleAIProvider({ apiKey: '', model: 'gemini-pro' }))
        .toThrow('Google AI API key is required');

      expect(() => new GoogleAIProvider({ apiKey: 'test', model: '' }))
        .toThrow('Google AI model is required');
    });
  });

  describe('OllamaProvider', () => {
    let provider: OllamaProvider;

    beforeEach(() => {
      provider = new OllamaProvider({
        baseUrl: 'http://localhost:11434',
        model: 'llama2'
      });
    });

    it('should generate remediation for finding', async () => {
      const remediation = await provider.generateRemediation(mockFinding);

      expect(remediation).toBe('Set securityContext.privileged to false in your pod specification');
    });

    it('should handle API errors gracefully', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = vi.mocked(Ollama);
      mockOllama.mockImplementation(() => ({
        chat: vi.fn().mockRejectedValue(new Error('Connection refused'))
      }) as any);

      const errorProvider = new OllamaProvider({
        baseUrl: 'http://localhost:11434',
        model: 'llama2'
      });

      await expect(errorProvider.generateRemediation(mockFinding))
        .rejects.toThrow('Ollama API error: Connection refused');
    });

    it('should validate configuration', () => {
      expect(() => new OllamaProvider({ baseUrl: '', model: 'llama2' }))
        .toThrow('Ollama base URL is required');

      expect(() => new OllamaProvider({ baseUrl: 'http://localhost:11434', model: '' }))
        .toThrow('Ollama model is required');
    });

    it('should use default base URL when not provided', () => {
      const defaultProvider = new OllamaProvider({ model: 'llama2' });
      expect(defaultProvider).toBeInstanceOf(OllamaProvider);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4'
      });

      const OpenAI = await import('openai');
      const mockOpenAI = vi.mocked(OpenAI.default);
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Network error'))
          }
        }
      }) as any);

      await expect(provider.generateRemediation(mockFinding))
        .rejects.toThrow('OpenAI API error: Network error');
    });

    it('should handle malformed responses', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4'
      });

      const OpenAI = await import('openai');
      const mockOpenAI = vi.mocked(OpenAI.default);
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: []
            })
          }
        }
      }) as any);

      await expect(provider.generateRemediation(mockFinding))
        .rejects.toThrow('No response from OpenAI');
    });
  });
});