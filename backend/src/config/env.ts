export const config = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/ids',
  JWT_SECRET: 'ids-secure-jwt-secret-key-2024',
  PORT: 5001,
  REDIS_URL: 'redis://127.0.0.1:6379',
  // Auto-block policy defaults
  RL_WINDOW_SECONDS: 60,
  RL_THRESHOLD: 100,
  BAN_MINUTES: 60,
  USE_FIREWALL: true,
  USE_NGINX_DENY: false,
  // Nginx integration (optional)
  NGINX_DENY_FILE: '/etc/nginx/ids.deny',
  NGINX_RELOAD_CMD: 'nginx -s reload',
  // Aggregator (optional)
  AGGREGATOR_URL: '',
  AGGREGATOR_TOKEN: ''
}; 
