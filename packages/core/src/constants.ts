export const VERSION = '0.1.0';
export const DEFAULT_NAMESPACE = 'default';
export const SCAN_TIMEOUT = 300000; // 5 minutes
export const AI_TIMEOUT = 30000; // 30 seconds

export const RULE_CATEGORIES = {
  CONTAINER_SECURITY: 'Container Security',
  NETWORK_SECURITY: 'Network Security',
  RBAC: 'RBAC',
  SECRETS_MANAGEMENT: 'Secrets Management',
  RESOURCE_MANAGEMENT: 'Resource Management',
  POD_SECURITY: 'Pod Security',
} as const;

export const SERVICE_PATTERNS = {
  redis: {
    envPatterns: ['REDIS_HOST', 'REDIS_URL', 'REDIS_URI'],
    defaultImage: 'redis:7-alpine',
    defaultPort: 6379,
  },
  postgres: {
    envPatterns: ['DATABASE_URL', 'POSTGRES_HOST', 'PG_HOST', 'POSTGRESQL_HOST'],
    defaultImage: 'postgres:15',
    defaultPort: 5432,
  },
  mysql: {
    envPatterns: ['MYSQL_HOST', 'MYSQL_URL', 'MYSQL_DATABASE'],
    defaultImage: 'mysql:8',
    defaultPort: 3306,
  },
  mongodb: {
    envPatterns: ['MONGO_URL', 'MONGODB_URI', 'MONGO_HOST'],
    defaultImage: 'mongo:6',
    defaultPort: 27017,
  },
  rabbitmq: {
    envPatterns: ['RABBITMQ_HOST', 'AMQP_URL', 'RABBITMQ_URL'],
    defaultImage: 'rabbitmq:3-management',
    defaultPort: 5672,
  },
  kafka: {
    envPatterns: ['KAFKA_BROKERS', 'KAFKA_HOST', 'KAFKA_BOOTSTRAP_SERVERS'],
    defaultImage: 'confluentinc/cp-kafka:latest',
    defaultPort: 9092,
  },
} as const;
