import { SetMetadata } from '@nestjs/common';
import { HealthCheckFunction, HealthCheckConfig } from '../interfaces/health-check.interface';

export const HEALTH_CHECK_KEY = 'health_check';

/**
 * Decorator to mark a method as a custom health check
 * @param config Health check configuration
 */
export const HealthCheck = (config: Partial<HealthCheckConfig> = {}) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const healthCheckConfig: HealthCheckConfig = {
      name: config.name || propertyKey,
      type: config.type || 'CUSTOM' as any,
      timeout: config.timeout || 10000,
      interval: config.interval || 30000,
      retries: config.retries || 3,
      critical: config.critical !== false, // Default to true
      dependencies: config.dependencies || [],
      ...config,
    };

    // Store the health check configuration
    SetMetadata(HEALTH_CHECK_KEY, {
      ...healthCheckConfig,
      target: target.constructor.name,
      method: propertyKey,
    });

    // Return the original descriptor
    return descriptor;
  };
};

/**
 * Helper to get health check metadata from a class
 */
export const getHealthCheckMetadata = (target: any) => {
  return Reflect.getMetadata(HEALTH_CHECK_KEY, target) || [];
};
