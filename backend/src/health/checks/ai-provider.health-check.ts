import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckResult, HealthCheckType, HealthStatus, HealthCheckLevel } from '../interfaces/health-check.interface';

@Injectable()
export class AiProviderHealthCheck {
  private readonly logger = new Logger(AiProviderHealthCheck.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const aiProviderUrl = this.configService.get<string>('AI_PROVIDER_URL');
      const apiKey = this.configService.get<string>('AI_PROVIDER_API_KEY');
      
      if (!aiProviderUrl) {
        throw new Error('AI Provider URL not configured');
      }

      // Test AI provider connectivity
      const response = await this.testAiProviderConnectivity(aiProviderUrl, apiKey);
      const responseTime = Date.now() - startTime;

      this.logger.log(`AI Provider health check passed in ${responseTime}ms`);

      return {
        name: 'AI Provider',
        type: HealthCheckType.AI_PROVIDER,
        status: HealthStatus.UP,
        responseTime,
        timestamp: new Date(),
        level: HealthCheckLevel.INFO,
        details: {
          providerUrl: aiProviderUrl,
          response,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`AI Provider health check failed: ${errorMessage}`);

      return {
        name: 'AI Provider',
        type: HealthCheckType.AI_PROVIDER,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  private async testAiProviderConnectivity(url: string, apiKey?: string): Promise<Record<string, any>> {
    try {
      // This would be customized based on the actual AI provider
      // For OpenAI, Anthropic, etc., the health check endpoint would differ
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Try to hit a simple endpoint or make a minimal API call
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Return basic response info
      return {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('AI Provider request timeout');
        }
        throw error;
      }
      throw new Error(`AI Provider connectivity failed: ${String(error)}`);
    }
  }
}
