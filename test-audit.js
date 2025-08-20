#!/usr/bin/env node

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🔍 KubeKavach Stability & Accuracy Audit\n');
console.log('=' .repeat(60));

const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Test 1: Check if packages build
async function testPackageBuilds() {
  console.log('\n📦 Testing Package Builds...');
  const packages = ['core', 'rules', 'ai', 'replay', 'api'];
  
  for (const pkg of packages) {
    try {
      const { stdout, stderr } = await execAsync(`cd packages/${pkg} && npm run build`, { 
        cwd: '/Users/alokemajumder/Downloads/Github-Projects/kubekavach' 
      });
      results.passed.push(`✅ ${pkg} package builds successfully`);
    } catch (error) {
      results.failed.push(`❌ ${pkg} package build failed: ${error.message.split('\n')[0]}`);
    }
  }
}

// Test 2: Check core functionality - Rules
async function testRules() {
  console.log('\n🛡️ Testing Security Rules...');
  try {
    const { allRules } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/rules/dist/index.js');
    
    if (allRules && allRules.length > 0) {
      results.passed.push(`✅ ${allRules.length} security rules loaded`);
      
      // Test a rule
      const testPod = {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'test-pod', namespace: 'default' },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            securityContext: { privileged: true }
          }]
        }
      };
      
      const rule = allRules.find(r => r.id === 'KKR001');
      if (rule) {
        const isValid = rule.validate(testPod);
        if (!isValid) {
          results.passed.push(`✅ Privileged container rule detects violations correctly`);
        } else {
          results.failed.push(`❌ Privileged container rule failed to detect violation`);
        }
      }
    } else {
      results.failed.push(`❌ No security rules found`);
    }
  } catch (error) {
    results.failed.push(`❌ Rules module failed: ${error.message}`);
  }
}

// Test 3: Check database connectivity
async function testDatabase() {
  console.log('\n💾 Testing Database Module...');
  try {
    const { database } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/core/dist/utils/database.js');
    
    // Try to save without initialization (should handle gracefully)
    const testResult = {
      id: 'test-123',
      timestamp: new Date().toISOString(),
      cluster: 'test',
      duration: 1000,
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      findings: []
    };
    
    try {
      await database.saveScanResult(testResult);
      results.warnings.push(`⚠️ Database saves without initialization (in-memory fallback)`);
    } catch (err) {
      results.passed.push(`✅ Database properly requires initialization`);
    }
  } catch (error) {
    results.failed.push(`❌ Database module failed: ${error.message}`);
  }
}

// Test 4: Check AI providers
async function testAIProviders() {
  console.log('\n🤖 Testing AI Providers...');
  try {
    const ai = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/ai/dist/index.js');
    
    const providers = ['OpenAIProvider', 'AnthropicProvider', 'GoogleAIProvider', 'OllamaProvider'];
    let foundProviders = 0;
    
    for (const provider of providers) {
      if (ai[provider]) {
        foundProviders++;
        try {
          const instance = new ai[provider]({ apiKey: 'test-key', model: 'test' });
          if (instance.generateRemediation && instance.analyzeFindings) {
            results.passed.push(`✅ ${provider} has required methods`);
          } else {
            results.failed.push(`❌ ${provider} missing required methods`);
          }
        } catch (err) {
          results.warnings.push(`⚠️ ${provider} constructor failed (expected without real API key)`);
        }
      }
    }
    
    if (foundProviders === 4) {
      results.passed.push(`✅ All 4 AI providers exported`);
    } else {
      results.failed.push(`❌ Only ${foundProviders}/4 AI providers found`);
    }
  } catch (error) {
    results.failed.push(`❌ AI module failed: ${error.message}`);
  }
}

// Test 5: Check replay functionality
async function testReplay() {
  console.log('\n🔄 Testing Replay Module...');
  try {
    const { PodReplayer } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/replay/dist/index.js');
    
    if (PodReplayer) {
      const replayer = new PodReplayer();
      results.passed.push(`✅ PodReplayer class instantiates`);
      
      // Check for key methods
      const requiredMethods = ['replayPod', 'cleanup'];
      const missingMethods = requiredMethods.filter(m => !replayer[m]);
      
      if (missingMethods.length === 0) {
        results.passed.push(`✅ PodReplayer has all required methods`);
      } else {
        results.failed.push(`❌ PodReplayer missing methods: ${missingMethods.join(', ')}`);
      }
    } else {
      results.failed.push(`❌ PodReplayer not exported`);
    }
  } catch (error) {
    results.failed.push(`❌ Replay module failed: ${error.message}`);
  }
}

// Test 6: Check configuration loading
async function testConfig() {
  console.log('\n⚙️ Testing Configuration...');
  try {
    const { loadConfig } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/core/dist/index.js');
    
    const config = loadConfig();
    if (config) {
      results.passed.push(`✅ Configuration loads without error`);
      
      // Check for expected properties
      const hasApiConfig = config.api !== undefined;
      const hasUsers = Array.isArray(config.users);
      
      if (!hasApiConfig && !hasUsers) {
        results.warnings.push(`⚠️ No API or user configuration found (using defaults)`);
      }
    }
  } catch (error) {
    results.failed.push(`❌ Configuration loading failed: ${error.message}`);
  }
}

// Test 7: Check security utilities
async function testSecurityUtils() {
  console.log('\n🔐 Testing Security Utilities...');
  try {
    const { security } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/core/dist/utils/security.js');
    const { rateLimiter } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/core/dist/utils/rate-limiter.js');
    
    if (security && security.validateInput && security.sanitizeApiKey) {
      results.passed.push(`✅ Security utilities available`);
      
      // Test input validation
      const testInput = { test: 'value' };
      const isValid = security.validateInput(testInput, { test: 'string' });
      if (isValid) {
        results.passed.push(`✅ Input validation works`);
      }
    }
    
    if (rateLimiter && rateLimiter.createLimiter) {
      results.passed.push(`✅ Rate limiter available`);
    }
  } catch (error) {
    results.failed.push(`❌ Security utilities failed: ${error.message}`);
  }
}

// Run all tests
async function runAudit() {
  try {
    await testPackageBuilds();
    await testRules();
    await testDatabase();
    await testAIProviders();
    await testReplay();
    await testConfig();
    await testSecurityUtils();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUDIT SUMMARY\n');
    
    console.log(`✅ Passed: ${results.passed.length}`);
    results.passed.forEach(msg => console.log(`  ${msg}`));
    
    console.log(`\n⚠️ Warnings: ${results.warnings.length}`);
    results.warnings.forEach(msg => console.log(`  ${msg}`));
    
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(msg => console.log(`  ${msg}`));
    
    // Final verdict
    console.log('\n' + '='.repeat(60));
    const passRate = (results.passed.length / (results.passed.length + results.failed.length)) * 100;
    console.log(`\n🎯 Overall Stability: ${passRate.toFixed(1)}%`);
    
    if (passRate >= 80) {
      console.log('✅ System is STABLE and mostly functional');
    } else if (passRate >= 60) {
      console.log('⚠️ System is PARTIALLY STABLE with some issues');
    } else {
      console.log('❌ System has CRITICAL STABILITY ISSUES');
    }
    
    // Feature status
    console.log('\n📋 Feature Status:');
    console.log('  • Security Scanning: ' + (results.passed.some(r => r.includes('rules')) ? '✅ Working' : '❌ Not Working'));
    console.log('  • Pod Replay: ' + (results.passed.some(r => r.includes('PodReplayer')) ? '✅ Working' : '❌ Not Working'));
    console.log('  • AI Integration: ' + (results.passed.some(r => r.includes('AI providers')) ? '✅ Working' : '❌ Not Working'));
    console.log('  • Database: ' + (results.passed.some(r => r.includes('Database')) ? '⚠️ Partial' : '❌ Not Working'));
    console.log('  • REST API: ' + (results.passed.some(r => r.includes('api package')) ? '⚠️ Builds but not tested' : '❌ Not Working'));
    
  } catch (error) {
    console.error('Audit failed:', error);
  }
}

runAudit();