import assert from 'node:assert/strict';
import test from 'node:test';
import { OrganisationsController } from '../src/organisations/organisations.controller';
import { OrganisationsService, parseSignitWebhookInput } from '../src/organisations/organisations.service';

test('passes the Documenso secret and event payload to webhook processing', async () => {
  let received: unknown[] = [];
  const service = {
    processSignitWebhook: (...args: unknown[]) => {
      received = args;
      return Promise.resolve({ success: true });
    },
  } as unknown as OrganisationsService;
  const controller = new OrganisationsController(service);
  const body = { event: 'DOCUMENT_COMPLETED', payload: { id: 'env-1' } };

  await controller.processSignitWebhook('org-1', 'product-1', body, 'documenso-secret', 'legacy-secret');

  assert.deepEqual(received, [
    'org-1',
    'product-1',
    { event: 'DOCUMENT_COMPLETED', payload: { id: 'env-1' }, legacyEnvelopeId: undefined },
    'documenso-secret',
  ]);
});

const signedRecipient = {
  id: 51,
  envelopeId: 'envelope_abcdefhiklmnorst',
  email: 'signer@example.com',
  name: 'John Doe',
  role: 'SIGNER',
  signedAt: '2024-04-22T11:52:05.688Z',
  readStatus: 'OPENED',
  signingStatus: 'SIGNED',
  sendStatus: 'SENT',
};

const completedPayload = {
  id: 10,
  envelopeId: 'envelope_abcdefhiklmnorst',
  status: 'COMPLETED',
  title: 'contract.pdf',
  source: 'DOCUMENT',
  completedAt: '2024-04-22T11:52:05.707Z',
  recipients: [signedRecipient],
};

test('validates and normalizes the completed Signit payload', () => {
  assert.deepEqual(parseSignitWebhookInput({ event: 'DOCUMENT_COMPLETED', payload: completedPayload }), {
    ignored: false,
    event: 'DOCUMENT_COMPLETED',
    envelopeId: 'envelope_abcdefhiklmnorst',
    envelope: {
      title: 'contract.pdf',
      status: 'COMPLETED',
      recipients: [{ email: 'signer@example.com', approvalStatus: 'approved', actionedDate: '2024-04-22T11:52:05.688Z' }],
    },
  });
});

test('validates DOCUMENT_SIGNED while retaining pending recipients', () => {
  const result = parseSignitWebhookInput({
    event: 'DOCUMENT_SIGNED',
    payload: {
      ...completedPayload,
      status: 'IN_PROGRESS',
      completedAt: undefined,
      recipients: [
        signedRecipient,
        { ...signedRecipient, id: 52, email: 'pending@example.com', signingStatus: 'PENDING', signedAt: undefined },
      ],
    },
  });

  assert.equal(result.ignored, false);
  assert.equal(result.envelopeId, 'envelope_abcdefhiklmnorst');
  assert.deepEqual(result.envelope?.recipients.map(({ approvalStatus }) => approvalStatus), ['approved', 'pending']);
});

test('accepts the legacy body contract', () => {
  assert.equal(parseSignitWebhookInput({ legacyEnvelopeId: 'legacy-1' }).envelopeId, 'legacy-1');
});

test('acknowledges unrelated webhook events without an envelope lookup', () => {
  assert.deepEqual(parseSignitWebhookInput({ event: 'DOCUMENT_CREATED', payload: { id: 12345 } }), {
    ignored: true,
    event: 'DOCUMENT_CREATED',
    envelopeId: null,
  });
});

test('rejects unsafe or missing envelope identifiers through an empty parse result', () => {
  assert.throws(() => parseSignitWebhookInput({ event: 'DOCUMENT_COMPLETED', payload: {} }), /document fields are invalid or incomplete/);
  assert.throws(() => parseSignitWebhookInput({ event: 'DOCUMENT_COMPLETED', payload: { ...completedPayload, envelopeId: '' } }), /document fields are invalid or incomplete/);
});

test('rejects mismatched, duplicate, and incomplete recipient data', () => {
  assert.throws(() => parseSignitWebhookInput({
    event: 'DOCUMENT_SIGNED',
    payload: { ...completedPayload, recipients: [{ ...signedRecipient, envelopeId: 'wrong-envelope' }] },
  }), /recipient fields are invalid or incomplete/);
  assert.throws(() => parseSignitWebhookInput({
    event: 'DOCUMENT_SIGNED',
    payload: { ...completedPayload, recipients: [signedRecipient, { ...signedRecipient, id: 52 }] },
  }), /duplicate recipients/);
  assert.throws(() => parseSignitWebhookInput({
    event: 'DOCUMENT_COMPLETED',
    payload: { ...completedPayload, recipients: [{ ...signedRecipient, signingStatus: 'PENDING', signedAt: undefined }] },
  }), /all recipients signed/);
});