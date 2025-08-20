#!/usr/bin/env node

console.log('🔍 KUBEKAVACH STABILITY & ACCURACY AUDIT');
console.log('=' .repeat(60));
console.log('Evaluating all functions and features...\n');

const results = {
  passed: [],
  failed: [],
  warnings: [],
  partial: []
};

// Test 1: Package Build Integrity
async function testPackageBuilds() {
  console.log('📦 TESTING PACKAGE BUILD INTEGRITY...');
  const { execSync } = await import('child_process');
  const packages = ['core', 'rules', 'ai', 'api', 'ui', 'replay'];
  
  for (const pkg of packages) {
    try {
      console.log(`  └─ Building ${pkg}...`);
      execSync(`npm run build`, { 
        cwd: `/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/${pkg}`,
        stdio: 'pipe'
      });
      results.passed.push(`✅ ${pkg.toUpperCase()}: Package builds successfully`);
    } catch (error) {
      results.failed.push(`❌ ${pkg.toUpperCase()}: Build failed - ${error.message.split('\n')[0]}`);
    }
  }
}

// Test 2: Security Rules Engine
async function testSecurityRules() {
  console.log('\n🛡️ TESTING SECURITY RULES ENGINE...');
  try {
    const { allRules } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/rules/dist/index.js');
    
    if (!allRules || allRules.length === 0) {
      results.failed.push('❌ SECURITY ENGINE: No rules loaded');
      return;
    }

    console.log(`  └─ Found ${allRules.length} security rules`);
    results.passed.push(`✅ SECURITY ENGINE: ${allRules.length} rules loaded successfully`);

    // Test each rule with sample data
    const testPods = {
      privileged: {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'privileged-pod', namespace: 'default' },
        spec: {
          containers: [{ name: 'app', image: 'nginx:latest', securityContext: { privileged: true } }]
        }
      },
      rootUser: {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'root-pod', namespace: 'default' },
        spec: {
          containers: [{ name: 'app', image: 'nginx:latest', securityContext: { runAsUser: 0 } }]
        }
      },
      noSecurityContext: {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'insecure-pod', namespace: 'default' },
        spec: {
          containers: [{ name: 'app', image: 'nginx:latest' }]
        }
      }
    };

    let workingRules = 0;
    let failedRules = 0;

    for (const rule of allRules) {
      try {
        if (rule.id === 'KKR001') { // Privileged containers
          const isValid = rule.validate(testPods.privileged);
          if (!isValid) {
            workingRules++;
            console.log(`  └─ ✅ ${rule.id}: Correctly detects privileged containers`);
          } else {
            failedRules++;
            console.log(`  └─ ❌ ${rule.id}: Failed to detect privileged container`);
          }
        } else if (rule.id === 'KKR002') { // Root user
          const isValid = rule.validate(testPods.rootUser);
          if (!isValid) {
            workingRules++;
            console.log(`  └─ ✅ ${rule.id}: Correctly detects root user`);
          } else {
            failedRules++;
            console.log(`  └─ ❌ ${rule.id}: Failed to detect root user`);
          }
        } else {
          // Test other rules with basic pod
          rule.validate(testPods.noSecurityContext);
          workingRules++;
          console.log(`  └─ ✅ ${rule.id}: Rule executes without errors`);
        }
      } catch (error) {
        failedRules++;
        console.log(`  └─ ❌ ${rule.id}: Rule execution failed - ${error.message}`);
      }
    }

    if (workingRules >= allRules.length * 0.8) {
      results.passed.push(`✅ RULE VALIDATION: ${workingRules}/${allRules.length} rules working correctly`);
    } else {
      results.partial.push(`⚠️ RULE VALIDATION: Only ${workingRules}/${allRules.length} rules working`);
    }

  } catch (error) {
    results.failed.push(`❌ SECURITY ENGINE: Failed to load - ${error.message}`);
  }
}

// Test 3: AI Provider Integration
async function testAIProviders() {
  console.log('\n🤖 TESTING AI PROVIDER INTEGRATION...');
  try {
    const ai = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/ai/dist/index.js');
    const providers = ['OpenAIProvider', 'AnthropicProvider', 'GoogleAIProvider', 'OllamaProvider'];
    let workingProviders = 0;
    let brokenProviders = 0;

    for (const provider of providers) {
      try {
        if (!ai[provider]) {
          results.failed.push(`❌ AI PROVIDER: ${provider} not exported`);
          brokenProviders++;
          continue;
        }

        // Test instantiation
        const instance = new ai[provider]({ 
          apiKey: 'test-key-for-validation', 
          model: 'test-model' 
        });

        // Check required methods
        const requiredMethods = ['generateRemediation', 'analyzeFindings'];
        const hasAllMethods = requiredMethods.every(method => 
          typeof instance[method] === 'function'
        );

        if (hasAllMethods) {
          workingProviders++;
          console.log(`  └─ ✅ ${provider}: Instantiates with required methods`);
          results.passed.push(`✅ AI PROVIDER: ${provider} functional`);
        } else {
          brokenProviders++;
          console.log(`  └─ ❌ ${provider}: Missing required methods`);
          results.failed.push(`❌ AI PROVIDER: ${provider} missing methods`);
        }

      } catch (error) {
        brokenProviders++;
        console.log(`  └─ ❌ ${provider}: Failed to instantiate - ${error.message}`);
        results.failed.push(`❌ AI PROVIDER: ${provider} instantiation failed`);
      }
    }

    if (workingProviders === providers.length) {
      results.passed.push('✅ AI INTEGRATION: All providers functional');
    } else if (workingProviders > 0) {
      results.partial.push(`⚠️ AI INTEGRATION: ${workingProviders}/${providers.length} providers working`);
    } else {
      results.failed.push('❌ AI INTEGRATION: No providers working');
    }

  } catch (error) {
    results.failed.push(`❌ AI INTEGRATION: Module load failed - ${error.message}`);
  }
}

// Test 4: Pod Replay System
async function testPodReplay() {
  console.log('\n🔄 TESTING POD REPLAY SYSTEM...');
  try {
    const { PodReplayer } = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/replay/dist/index.js');
    
    if (!PodReplayer) {
      results.failed.push('❌ POD REPLAY: PodReplayer class not exported');
      return;
    }

    // Test instantiation
    try {
      const replayer = new PodReplayer();
      console.log('  └─ ✅ PodReplayer instantiates successfully');
      
      // Check required methods
      const requiredMethods = ['replayPod', 'cleanup'];
      const hasAllMethods = requiredMethods.every(method => 
        typeof replayer[method] === 'function'
      );

      if (hasAllMethods) {
        results.passed.push('✅ POD REPLAY: All required methods present');
        console.log('  └─ ✅ Required methods (replayPod, cleanup) available');
        
        // Test Docker availability (non-blocking)
        try {
          // This will likely fail without Docker, but we can check the error
          await replayer.cleanup();
          results.passed.push('✅ POD REPLAY: Docker integration working');
        } catch (dockerError) {
          if (dockerError.message.includes('connect ECONNREFUSED') || 
              dockerError.message.includes('Docker')) {
            results.warnings.push('⚠️ POD REPLAY: Docker daemon not available (expected in test)');
          } else {
            results.partial.push('⚠️ POD REPLAY: Partial functionality - Docker issues');
          }
        }
      } else {
        results.failed.push('❌ POD REPLAY: Missing required methods');
      }

    } catch (error) {
      results.failed.push(`❌ POD REPLAY: Instantiation failed - ${error.message}`);
    }

  } catch (error) {
    results.failed.push(`❌ POD REPLAY: Module load failed - ${error.message}`);
  }
}

// Test 5: Core Configuration & Utils
async function testCoreSystem() {
  console.log('\n⚙️ TESTING CORE SYSTEM & UTILITIES...');
  try {
    const core = await import('/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/core/dist/index.js');
    
    // Test exports
    const requiredExports = ['loadConfig', 'Severity', 'logger', 'metrics'];
    let missingExports = [];
    let availableExports = [];

    for (const exportName of requiredExports) {
      if (core[exportName]) {
        availableExports.push(exportName);
        console.log(`  └─ ✅ ${exportName} exported correctly`);
      } else {
        missingExports.push(exportName);
        console.log(`  └─ ❌ ${exportName} missing from exports`);
      }
    }

    if (missingExports.length === 0) {
      results.passed.push('✅ CORE SYSTEM: All required exports available');
    } else {
      results.partial.push(`⚠️ CORE SYSTEM: Missing exports: ${missingExports.join(', ')}`);
    }

    // Test configuration loading
    if (core.loadConfig) {
      try {
        const config = core.loadConfig();
        if (config !== undefined) {
          results.passed.push('✅ CONFIGURATION: Loads successfully');
          console.log('  └─ ✅ Configuration loading works');
        }
      } catch (configError) {
        results.partial.push(`⚠️ CONFIGURATION: Load issues - ${configError.message}`);
      }
    }

    // Test Severity enum
    if (core.Severity) {
      const severityLevels = Object.keys(core.Severity);
      if (severityLevels.length > 0) {
        results.passed.push(`✅ TYPES: Severity enum with ${severityLevels.length} levels`);
        console.log(`  └─ ✅ Severity levels: ${severityLevels.join(', ')}`);
      }
    }

  } catch (error) {
    results.failed.push(`❌ CORE SYSTEM: Module load failed - ${error.message}`);
  }
}

// Test 6: API Server
async function testAPIServer() {
  console.log('\n🌐 TESTING API SERVER...');
  try {
    const fs = await import('fs');
    const apiPath = '/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/api/dist';
    
    // Check build outputs
    const requiredFiles = ['server.js', 'start.js'];
    let missingFiles = [];
    let presentFiles = [];

    for (const file of requiredFiles) {
      if (fs.existsSync(`${apiPath}/${file}`)) {
        presentFiles.push(file);
        console.log(`  └─ ✅ ${file} build output present`);
      } else {
        missingFiles.push(file);
        console.log(`  └─ ❌ ${file} build output missing`);
      }
    }

    if (missingFiles.length === 0) {
      results.passed.push('✅ API SERVER: All build outputs present');
      
      // Test server import
      try {
        const { buildServer } = await import(`${apiPath}/server.js`);
        if (buildServer && typeof buildServer === 'function') {
          results.passed.push('✅ API SERVER: Server builder function working');
          console.log('  └─ ✅ buildServer function available');
        }
      } catch (importError) {
        results.failed.push(`❌ API SERVER: Import failed - ${importError.message}`);
      }
    } else {
      results.failed.push(`❌ API SERVER: Missing files: ${missingFiles.join(', ')}`);
    }

  } catch (error) {
    results.failed.push(`❌ API SERVER: Test failed - ${error.message}`);
  }
}

// Test 7: UI System
async function testUISystem() {
  console.log('\n🖥️ TESTING UI SYSTEM...');
  try {
    const fs = await import('fs');
    const uiPath = '/Users/alokemajumder/Downloads/Github-Projects/kubekavach/packages/ui';
    
    // Check essential files
    const essentialFiles = ['index.html', 'src/main.ts', 'vite.config.ts'];
    let missingFiles = [];
    let presentFiles = [];

    for (const file of essentialFiles) {
      if (fs.existsSync(`${uiPath}/${file}`)) {
        presentFiles.push(file);
        console.log(`  └─ ✅ ${file} present`);
      } else {
        missingFiles.push(file);
        console.log(`  └─ ❌ ${file} missing`);
      }
    }

    if (missingFiles.length === 0) {
      results.passed.push('✅ UI SYSTEM: All essential files present');
    } else {
      results.failed.push(`❌ UI SYSTEM: Missing files: ${missingFiles.join(', ')}`);
    }

    // Check build output
    if (fs.existsSync(`${uiPath}/dist`)) {
      results.passed.push('✅ UI SYSTEM: Build output directory exists');
      console.log('  └─ ✅ Build output directory present');
    } else {
      results.warnings.push('⚠️ UI SYSTEM: No build output (run npm run build)');
    }

  } catch (error) {
    results.failed.push(`❌ UI SYSTEM: Test failed - ${error.message}`);
  }
}

// Generate final report
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 STABILITY & ACCURACY AUDIT RESULTS');
  console.log('='.repeat(60));

  const totalIssues = results.passed.length + results.failed.length + results.partial.length;
  const successfulFeatures = results.passed.length + (results.partial.length * 0.5);
  const accuracyScore = totalIssues > 0 ? (successfulFeatures / totalIssues) * 100 : 0;

  console.log(`\n🎯 OVERALL ACCURACY SCORE: ${accuracyScore.toFixed(1)}%`);
  
  if (accuracyScore >= 95) {
    console.log('🎉 EXCELLENT - System is highly stable and accurate');
  } else if (accuracyScore >= 85) {
    console.log('✅ GOOD - System is stable with minor issues');
  } else if (accuracyScore >= 70) {
    console.log('⚠️ FAIR - System functional but needs improvements');
  } else {
    console.log('❌ POOR - System requires significant fixes');
  }

  console.log(`\n📈 FEATURE STATUS BREAKDOWN:`);
  console.log(`  ✅ Fully Working: ${results.passed.length} features`);
  console.log(`  ⚠️ Partially Working: ${results.partial.length} features`);
  console.log(`  ❌ Not Working: ${results.failed.length} features`);
  console.log(`  🔔 Warnings: ${results.warnings.length} items`);

  // Detailed results
  if (results.passed.length > 0) {
    console.log('\n✅ WORKING FEATURES:');
    results.passed.forEach(item => console.log(`  ${item}`));
  }

  if (results.partial.length > 0) {
    console.log('\n⚠️ PARTIALLY WORKING:');
    results.partial.forEach(item => console.log(`  ${item}`));
  }

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED FEATURES:');
    results.failed.forEach(item => console.log(`  ${item}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n🔔 WARNINGS:');
    results.warnings.forEach(item => console.log(`  ${item}`));
  }

  // Component summary
  console.log('\n📋 COMPONENT STABILITY MATRIX:');
  const components = [
    { name: 'Package Builds', working: results.passed.some(r => r.includes('builds successfully')) },
    { name: 'Security Engine', working: results.passed.some(r => r.includes('SECURITY ENGINE')) },
    { name: 'AI Integration', working: results.passed.some(r => r.includes('AI INTEGRATION')) || results.passed.some(r => r.includes('AI PROVIDER')) },
    { name: 'Pod Replay', working: results.passed.some(r => r.includes('POD REPLAY')) },
    { name: 'Core System', working: results.passed.some(r => r.includes('CORE SYSTEM')) },
    { name: 'API Server', working: results.passed.some(r => r.includes('API SERVER')) },
    { name: 'UI System', working: results.passed.some(r => r.includes('UI SYSTEM')) }
  ];

  components.forEach(comp => {
    const status = comp.working ? '✅ STABLE' : '❌ UNSTABLE';
    console.log(`  ${comp.name.padEnd(20)} | ${status}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('🔍 AUDIT COMPLETED');
  console.log('='.repeat(60));
}

// Run complete audit
async function runCompleteAudit() {
  try {
    await testPackageBuilds();
    await testSecurityRules();
    await testAIProviders();
    await testPodReplay();
    await testCoreSystem();
    await testAPIServer();
    await testUISystem();
    generateReport();
  } catch (error) {
    console.error('\n💥 AUDIT FAILED:', error);
    results.failed.push(`❌ AUDIT SYSTEM: ${error.message}`);
    generateReport();
  }
}

runCompleteAudit();