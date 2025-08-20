#!/usr/bin/env node

import { startServer } from './server.js';

// Simple server startup without ESM issues
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});