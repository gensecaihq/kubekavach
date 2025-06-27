import { Command, Flags } from '@oclif/core';
import { allRules } from '@kubekavach/rules';
import { ux } from '@oclif/core';

export default class Rules extends Command {
  static description = 'List all available security rules';

  static flags = {
    category: Flags.string({ char: 'c', description: 'Filter by category' }),
    severity: Flags.string({ char: 's', description: 'Filter by severity' }),
    json: Flags.boolean({ description: 'Output in JSON format' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Rules);

    try {
      let filteredRules = [...allRules];

      // Apply filters
      if (flags.category) {
        filteredRules = filteredRules.filter(rule => 
          rule.category.toLowerCase().includes(flags.category!.toLowerCase())
        );
      }

      if (flags.severity) {
        filteredRules = filteredRules.filter(rule => 
          rule.severity.toLowerCase() === flags.severity!.toLowerCase()
        );
      }

      if (flags.json) {
        this.log(JSON.stringify(filteredRules.map(rule => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          category: rule.category,
        })), null, 2));
        return;
      }

      this.log(`Found ${filteredRules.length} security rules:\n`);

      ux.table(filteredRules, {
        id: { header: 'ID', minWidth: 8 },
        name: { header: 'Name', minWidth: 25 },
        severity: { header: 'Severity', minWidth: 10 },
        category: { header: 'Category', minWidth: 20 },
        description: { header: 'Description', minWidth: 40 },
      });

    } catch (error: any) {
      this.error(`Failed to list rules: ${error.message}`);
    }
  }
}