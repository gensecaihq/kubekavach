import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@kubekavach/core/utils/logger';

const execAsync = promisify(exec);

export interface ScanResult {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  details: any[];
  scannedAt: string;
  scanDuration: number;
}

export class ImageScanner {
  private readonly scannerBinary: string = 'trivy';
  
  async checkTrivyInstalled(): Promise<boolean> {
    try {
      await execAsync('which trivy');
      return true;
    } catch {
      logger.warn('Trivy is not installed. Installing...');
      return await this.installTrivy();
    }
  }

  private async installTrivy(): Promise<boolean> {
    try {
      const platform = process.platform;
      
      if (platform === 'darwin') {
        // macOS installation
        try {
          await execAsync('brew install aquasecurity/trivy/trivy');
          return true;
        } catch {
          logger.warn('Homebrew not available, trying direct download');
          await execAsync(`
            curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
          `);
          return true;
        }
      } else if (platform === 'linux') {
        // Linux installation
        await execAsync(`
          curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
        `);
        return true;
      } else {
        logger.error('Unsupported platform for automatic Trivy installation');
        return false;
      }
    } catch (error) {
      logger.error('Failed to install Trivy', error);
      return false;
    }
  }

  async scanImage(image: string, pullIfNeeded: boolean = true): Promise<ScanResult> {
    const startTime = Date.now();
    
    // Ensure Trivy is installed
    const trivyInstalled = await this.checkTrivyInstalled();
    if (!trivyInstalled) {
      throw new Error('Trivy scanner is not available and could not be installed automatically');
    }

    try {
      // Pull image if needed
      if (pullIfNeeded) {
        logger.info(`Pulling image ${image} for scanning...`);
        await execAsync(`docker pull ${image}`);
      }

      // Run Trivy scan with JSON output
      const { stdout } = await execAsync(
        `${this.scannerBinary} image --format json --quiet --severity CRITICAL,HIGH,MEDIUM,LOW,UNKNOWN ${image}`,
        { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer for large scan results
      );

      const scanData = JSON.parse(stdout);
      const scanDuration = Date.now() - startTime;

      // Process vulnerabilities
      const vulnerabilities = this.countVulnerabilities(scanData);
      
      logger.info(`Image scan completed for ${image}`, {
        duration: scanDuration,
        vulnerabilities
      });

      return {
        vulnerabilities,
        details: scanData.Results || [],
        scannedAt: new Date().toISOString(),
        scanDuration
      };
    } catch (error: any) {
      logger.error(`Failed to scan image ${image}`, error);
      
      // Return a degraded result if scan fails
      return {
        vulnerabilities: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          unknown: 0
        },
        details: [],
        scannedAt: new Date().toISOString(),
        scanDuration: Date.now() - startTime
      };
    }
  }

  private countVulnerabilities(scanData: any): ScanResult['vulnerabilities'] {
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    };

    if (!scanData.Results) {
      return counts;
    }

    for (const result of scanData.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          const severity = vuln.Severity?.toLowerCase() || 'unknown';
          if (severity in counts) {
            counts[severity as keyof typeof counts]++;
          }
        }
      }
    }

    return counts;
  }

  async generateSecurityReport(scanResult: ScanResult): Promise<string> {
    const { vulnerabilities, scannedAt, scanDuration } = scanResult;
    
    const report = `
=== IMAGE SECURITY SCAN REPORT ===
Scanned at: ${scannedAt}
Scan duration: ${scanDuration}ms

VULNERABILITY SUMMARY:
- Critical: ${vulnerabilities.critical}
- High: ${vulnerabilities.high}
- Medium: ${vulnerabilities.medium}
- Low: ${vulnerabilities.low}
- Unknown: ${vulnerabilities.unknown}

TOTAL: ${Object.values(vulnerabilities).reduce((a, b) => a + b, 0)} vulnerabilities

RISK ASSESSMENT:
${this.getRiskAssessment(vulnerabilities)}

RECOMMENDATION:
${this.getRecommendation(vulnerabilities)}
`.trim();

    return report;
  }

  private getRiskAssessment(vulnerabilities: ScanResult['vulnerabilities']): string {
    if (vulnerabilities.critical > 0) {
      return '🔴 CRITICAL RISK - Image contains critical vulnerabilities that should be addressed immediately';
    } else if (vulnerabilities.high > 0) {
      return '🟠 HIGH RISK - Image contains high severity vulnerabilities that pose significant risk';
    } else if (vulnerabilities.medium > 0) {
      return '🟡 MEDIUM RISK - Image contains medium severity vulnerabilities that should be reviewed';
    } else if (vulnerabilities.low > 0) {
      return '🟢 LOW RISK - Image contains only low severity vulnerabilities';
    } else {
      return '✅ MINIMAL RISK - No known vulnerabilities detected';
    }
  }

  private getRecommendation(vulnerabilities: ScanResult['vulnerabilities']): string {
    if (vulnerabilities.critical > 0 || vulnerabilities.high > 0) {
      return 'DO NOT deploy this image to production. Update base image and dependencies to patch vulnerabilities.';
    } else if (vulnerabilities.medium > 0) {
      return 'Review and patch medium severity vulnerabilities before production deployment.';
    } else {
      return 'Image is relatively safe for deployment. Continue monitoring for new vulnerabilities.';
    }
  }
}