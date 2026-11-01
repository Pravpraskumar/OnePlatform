import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
import { FoundryClient } from '../products/foundry-client';
import { assertLocalCoreDatabase } from './capture-pro-integration-menu';

config({ path: resolve(__dirname, '../../../../.env') });

async function main() {
  const database = process.env.CORE_DATABASE_URL;
  if (!database) throw new Error();
  assertLocalCoreDatabase(database, process.env.NODE_ENV);
  const client = new FoundryClient(process.env.FOUNDRY_PROJECT_ENDPOINT ?? '', {
    id: process.env.FOUNDRY_AGENT_ID || undefined, name: process.env.FOUNDRY_AGENT_NAME || undefined,
  }, process.env.FOUNDRY_IDENTITY ?? 'azure-cli', process.env.FOUNDRY_MANAGED_IDENTITY_CLIENT_ID || undefined);
  const agent = await client.agent();
  console.log(JSON.stringify({ ready: true, api: 'Classic Foundry Agent Service', agentId: agent.id, agentName: agent.name, toolTypes: agent.tools.map((tool) => typeof tool === 'object' && tool !== null && 'type' in tool ? tool.type : 'unknown') }, null, 2));
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ ready: false, reason: error instanceof ServiceUnavailableException ? error.message : 'Agent verification failed. Check configuration, project access and certificate trust; sensitive details withheld.' }, null, 2));
  process.exitCode = 1;
});