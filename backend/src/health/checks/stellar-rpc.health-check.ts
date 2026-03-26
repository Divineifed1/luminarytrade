import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckResult, HealthCheckType, HealthStatus, HealthCheckLevel } from '../interfaces/health-check.interface';

@Injectable()
export class StellarRpcHealthCheck {
  private readonly logger = new Logger(StellarRpcHealthCheck.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const stellarRpcUrl = this.configService.get<string>('STELLAR_RPC_URL', 'https://horizon-testnet.stellar.org');
      
      // Query latest ledger from Stellar RPC
      const ledgerInfo = await this.getLatestLedger(stellarRpcUrl);
      const responseTime = Date.now() - startTime;

      this.logger.log(`Stellar RPC health check passed in ${responseTime}ms`);

      return {
        name: 'Stellar RPC',
        type: HealthCheckType.STELLAR_RPC,
        status: HealthStatus.UP,
        responseTime,
        timestamp: new Date(),
        level: HealthCheckLevel.INFO,
        details: {
          rpcUrl: stellarRpcUrl,
          ledgerInfo,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Stellar RPC health check failed: ${errorMessage}`);

      return {
        name: 'Stellar RPC',
        type: HealthCheckType.STELLAR_RPC,
        status: HealthStatus.DOWN,
        responseTime,
        timestamp: new Date(),
        error: errorMessage,
        level: HealthCheckLevel.CRITICAL,
      };
    }
  }

  private async getLatestLedger(rpcUrl: string): Promise<Record<string, any>> {
    try {
      // In a real implementation, you would use Stellar SDK:
      // const server = new StellarServer(rpcUrl);
      // const ledger = await server.ledgers().limit(1).call();
      // return ledger.records[0];
      
      // For now, simulate a fetch to Stellar RPC
      const response = await fetch(`${rpcUrl}/ledgers?order=desc&limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data._embedded && data._embedded.records && data._embedded.records.length > 0) {
        const ledger = data._embedded.records[0];
        return {
          sequence: ledger.sequence,
          closed_at: ledger.closed_at,
          transaction_count: ledger.transaction_count,
          operation_count: ledger.operation_count,
          base_fee_in_stroops: ledger.base_fee_in_stroops,
        };
      } else {
        throw new Error('No ledger data available');
      }
    } catch (error) {
      throw new Error(`Failed to fetch latest ledger: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
