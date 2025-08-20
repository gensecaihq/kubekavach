#!/usr/bin/env node

import { spawn } from 'child_process';
import fetch from 'node-fetch';

console.log('🌐 Testing KubeKavach API Server\n');
console.log('=' .repeat(60));

// Set environment variables for testing
process.env.KUBEKAVACH_API_KEY = 'test-api-key-123456';

const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Start the server
async function startServer() {
  console.log('Starting API server...');
  
  // Create a simple config file
  const configContent = `
users:
  - username: testuser
    apiKey: test-api-key-123456
    roles: ['admin', 'scanner', 'viewer']
api:
  port: 3333
  host: 127.0.0.1
`;
  
  // Write config
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  
  const configDir = path.join(os.homedir(), '.kubekavach');
  const configPath = path.join(configDir, 'config.yaml');
  
  try {
    await fs.promises.mkdir(configDir, { recursive: true });
    await fs.promises.writeFile(configPath, configContent);
    console.log('✅ Test configuration created');
  } catch (err) {
    console.log('⚠️ Could not create config:', err.message);
  }
  
  return new Promise((resolve) => {
    const server = spawn('node', ['dist/server.js'], {
      cwd: '/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/api',
      env: { ...process.env }
    });
    
    server.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server started') || output.includes('listening')) {
        results.passed.push('✅ Server started successfully');
        resolve(server);
      }
    });
    
    server.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('Dynamic require')) { // Ignore known ESM issues
        console.error('Server error:', error);
      }
    });
    
    // Give it 3 seconds to start
    setTimeout(() => {
      results.warnings.push('⚠️ Server did not report successful start');
      resolve(server);
    }, 3000);
  });
}

// Test endpoints
async function testEndpoints(server) {
  console.log('\n🔍 Testing API Endpoints...\n');
  
  const baseUrl = 'http://127.0.0.1:3333';
  const headers = { 'x-api-key': 'test-api-key-123456' };
  
  // Test 1: Health endpoint (no auth)
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (res.ok) {
      results.passed.push('✅ /health endpoint works');
    } else {
      results.failed.push(`❌ /health returned ${res.status}`);
    }
  } catch (err) {
    results.failed.push(`❌ /health endpoint failed: ${err.message}`);
  }
  
  // Test 2: Rules endpoint (needs auth)
  try {
    const res = await fetch(`${baseUrl}/rules`, { headers });
    if (res.ok) {
      const rules = await res.json();
      if (Array.isArray(rules)) {
        results.passed.push(`✅ /rules endpoint works (${rules.length} rules)`);
      } else {
        results.failed.push('❌ /rules did not return array');
      }
    } else if (res.status === 401) {
      results.failed.push('❌ /rules authentication failed');
    } else {
      results.failed.push(`❌ /rules returned ${res.status}`);
    }
  } catch (err) {
    results.failed.push(`❌ /rules endpoint failed: ${err.message}`);
  }
  
  // Test 3: Scan endpoint
  try {
    const res = await fetch(`${baseUrl}/scan`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ namespace: 'default' })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.jobId || data.id) {
        results.passed.push('✅ /scan endpoint works');
      } else {
        results.warnings.push('⚠️ /scan returned unexpected format');
      }
    } else {
      results.failed.push(`❌ /scan returned ${res.status}`);
    }
  } catch (err) {
    results.failed.push(`❌ /scan endpoint failed: ${err.message}`);
  }
  
  // Test 4: AI status endpoint
  try {
    const res = await fetch(`${baseUrl}/ai/status`, { headers });
    if (res.ok) {
      const status = await res.json();
      results.passed.push(`✅ /ai/status endpoint works (AI ${status.enabled ? 'enabled' : 'disabled'})`);
    } else if (res.status === 404) {
      results.warnings.push('⚠️ AI endpoints not available');
    } else {
      results.failed.push(`❌ /ai/status returned ${res.status}`);
    }
  } catch (err) {
    results.warnings.push(`⚠️ /ai/status endpoint not available`);
  }
  
  // Clean up
  server.kill();
}

// Run tests
async function runAPITest() {
  try {
    const server = await startServer();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for server to be ready
    await testEndpoints(server);
    
    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('📊 API TEST RESULTS\n');
    
    console.log(`✅ Passed: ${results.passed.length}`);
    results.passed.forEach(msg => console.log(`  ${msg}`));
    
    console.log(`\n⚠️ Warnings: ${results.warnings.length}`);
    results.warnings.forEach(msg => console.log(`  ${msg}`));
    
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(msg => console.log(`  ${msg}`));
    
    process.exit(results.failed.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

// Check if fetch is available
import('node-fetch').then(module => {
  global.fetch = module.default;
  runAPITest();
}).catch(() => {
  console.error('❌ node-fetch not installed. Run: npm install -g node-fetch');
  process.exit(1);
});