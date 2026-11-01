require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { ConfigService } = require('@nestjs/config');
const { FoundryChatService } = require('../dist/foundry-chat.service');
const { SalesforceOpportunitiesService } = require('../dist/salesforce/salesforce-opportunities.service');

test('Foundry chat denies a user outside the selected organisation before database or provider work', async () => {
  const orgId = randomUUID();
  const user = { id: randomUUID(), globalRoles: ['Capture-Pro Analyst'], organisations: [] };
  const access = new SalesforceOpportunitiesService({}, new ConfigService());
  const service = new FoundryChatService({}, new ConfigService(), access);
  await assert.rejects(service.list(orgId, user, ''), /membership required/);
  await assert.rejects(service.messages(orgId, randomUUID(), user, ''), /membership required/);
  await assert.rejects(service.create(orgId, user, ''), /membership required/);
});

test('Foundry chat does not accept another users conversation or caller-supplied remote thread', async () => {
  const orgId = randomUUID();
  const user = { id: randomUUID(), globalRoles: ['Capture-Pro Analyst'], organisations: [{ id: orgId, membership: 'Member' }] };
  const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
  const access = { agentChatAccess: async () => ({ orgId, productId: randomUUID() }) };
  const service = new FoundryChatService(db, new ConfigService(), access);
  await assert.rejects(service.messages(orgId, randomUUID(), user, ''), /Conversation not found/);
  await assert.rejects(service.send(orgId, randomUUID(), 'Synthetic question', {}, user, ''), /Conversation not found/);
});