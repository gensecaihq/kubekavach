<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { format } from 'date-fns';

  Chart.register(...registerables);

  interface Finding {
    ruleId: string;
    ruleName: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    resource: {
      kind: string;
      name: string;
      namespace?: string;
    };
    message: string;
    remediation?: string;
  }

  interface ScanResult {
    id: string;
    timestamp: string;
    cluster: string;
    namespace?: string;
    duration: number;
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    findings: Finding[];
  }

  let isScanning = false;
  let scanResults: ScanResult | null = null;
  let selectedNamespace = '';
  let apiKey = '';
  let error = '';

  const API_BASE = 'http://localhost:3000';

  async function startScan() {
    if (!apiKey) {
      error = 'API Key is required';
      return;
    }

    isScanning = true;
    error = '';

    try {
      const response = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          namespace: selectedNamespace || undefined
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const { jobId } = await response.json();
      
      // Poll for results
      await pollScanResults(jobId);
      
    } catch (err: any) {
      error = `Scan failed: ${err.message}`;
    } finally {
      isScanning = false;
    }
  }

  async function pollScanResults(jobId: string) {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/scan/results/${jobId}`, {
          headers: { 'x-api-key': apiKey }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.status === 'completed') {
          scanResults = data.result;
          createSeverityChart();
          return;
        } else if (data.status === 'failed') {
          throw new Error(data.result?.error || 'Scan failed');
        }

        // Continue polling if still running
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 5000);
        } else {
          throw new Error('Scan timeout');
        }
      } catch (err: any) {
        error = `Polling failed: ${err.message}`;
        isScanning = false;
      }
    };

    await poll();
  }

  function createSeverityChart() {
    if (!scanResults) return;

    const ctx = document.getElementById('severityChart') as HTMLCanvasElement;
    if (!ctx) return;

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Critical', 'High', 'Medium', 'Low'],
        datasets: [{
          data: [
            scanResults.summary.critical,
            scanResults.summary.high,
            scanResults.summary.medium,
            scanResults.summary.low
          ],
          backgroundColor: [
            '#ef4444', // Red for critical
            '#f97316', // Orange for high
            '#eab308', // Yellow for medium
            '#22c55e'  // Green for low
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'CRITICAL': return 'text-red-600 bg-red-50';
      case 'HIGH': return 'text-orange-600 bg-orange-50';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50';
      case 'LOW': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }
</script>

<svelte:head>
  <title>KubeKavach Security Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-6">
        <div class="flex items-center">
          <h1 class="text-3xl font-bold text-gray-900">KubeKavach</h1>
          <span class="ml-3 text-sm text-gray-500">Security Dashboard</span>
        </div>
        <div class="text-sm text-gray-500">
          Kubernetes Security Scanner
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
    <!-- API Key Input -->
    <div class="px-4 py-6 sm:px-0">
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="px-4 py-5 sm:p-6">
          <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">API Configuration</h3>
          <div class="flex space-x-4">
            <div class="flex-1">
              <label for="apiKey" class="block text-sm font-medium text-gray-700">API Key</label>
              <input
                type="password"
                id="apiKey"
                bind:value={apiKey}
                placeholder="Enter your API key"
                class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div class="flex-1">
              <label for="namespace" class="block text-sm font-medium text-gray-700">Namespace (optional)</label>
              <input
                type="text"
                id="namespace"
                bind:value={selectedNamespace}
                placeholder="Leave empty to scan all namespaces"
                class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scan Controls -->
    <div class="px-4 py-6 sm:px-0">
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="px-4 py-5 sm:p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg leading-6 font-medium text-gray-900">Security Scan</h3>
              <p class="mt-1 text-sm text-gray-500">
                Scan your Kubernetes cluster for security vulnerabilities
              </p>
            </div>
            <button
              on:click={startScan}
              disabled={isScanning || !apiKey}
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if isScanning}
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Scanning...
              {:else}
                Start Scan
              {/if}
            </button>
          </div>

          {#if error}
            <div class="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
              <div class="flex">
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800">Error</h3>
                  <div class="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    {#if scanResults}
      <!-- Scan Results -->
      <div class="px-4 py-6 sm:px-0">
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Scan Results</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div class="bg-red-50 p-4 rounded-lg">
                <div class="text-2xl font-bold text-red-600">{scanResults.summary.critical}</div>
                <div class="text-sm text-red-800">Critical</div>
              </div>
              <div class="bg-orange-50 p-4 rounded-lg">
                <div class="text-2xl font-bold text-orange-600">{scanResults.summary.high}</div>
                <div class="text-sm text-orange-800">High</div>
              </div>
              <div class="bg-yellow-50 p-4 rounded-lg">
                <div class="text-2xl font-bold text-yellow-600">{scanResults.summary.medium}</div>
                <div class="text-sm text-yellow-800">Medium</div>
              </div>
              <div class="bg-green-50 p-4 rounded-lg">
                <div class="text-2xl font-bold text-green-600">{scanResults.summary.low}</div>
                <div class="text-sm text-green-800">Low</div>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 class="text-md font-medium text-gray-900 mb-2">Scan Details</h4>
                <dl class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Cluster:</dt>
                    <dd class="text-gray-900">{scanResults.cluster}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Namespace:</dt>
                    <dd class="text-gray-900">{scanResults.namespace || 'All'}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Duration:</dt>
                    <dd class="text-gray-900">{formatDuration(scanResults.duration)}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Timestamp:</dt>
                    <dd class="text-gray-900">{format(new Date(scanResults.timestamp), 'PPpp')}</dd>
                  </div>
                </dl>
              </div>
              
              <div>
                <h4 class="text-md font-medium text-gray-900 mb-2">Severity Distribution</h4>
                <canvas id="severityChart" width="300" height="300"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Findings Table -->
      <div class="px-4 py-6 sm:px-0">
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Security Findings</h3>
            
            {#if scanResults.findings.length === 0}
              <div class="text-center py-8">
                <div class="text-green-600 text-lg font-medium">🎉 No security issues found!</div>
                <div class="text-gray-500 mt-2">Your cluster appears to be secure.</div>
              </div>
            {:else}
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rule</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    {#each scanResults.findings as finding}
                      <tr>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="text-sm font-medium text-gray-900">{finding.ruleName}</div>
                          <div class="text-sm text-gray-500">{finding.ruleId}</div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getSeverityColor(finding.severity)}">
                            {finding.severity}
                          </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="text-sm text-gray-900">{finding.resource.kind}/{finding.resource.name}</div>
                          {#if finding.resource.namespace}
                            <div class="text-sm text-gray-500">ns: {finding.resource.namespace}</div>
                          {/if}
                        </td>
                        <td class="px-6 py-4">
                          <div class="text-sm text-gray-900">{finding.message}</div>
                          {#if finding.remediation}
                            <div class="text-sm text-gray-500 mt-1">{finding.remediation}</div>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>