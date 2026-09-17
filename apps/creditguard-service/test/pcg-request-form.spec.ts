import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { generatePcgRequestForm, type PcgRequestFormData } from '../src/documents/pcg-request-form';

test('generates a branded request-numbered PDF on one page when content fits', async () => {
  const generated = await generatePcgRequestForm(requestData());
  const pdf = await PDFDocument.load(generated);

  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), 'PCG-2026-00125 - Parent Company Guarantee Request');
  assert.equal(pdf.getAuthor(), 'McDermott CreditGuard');
  assert.equal(generated.subarray(0, 5).toString(), '%PDF-');
  assert.match(generated.toString('latin1'), /\/Subtype \/Image/);
  assert.doesNotMatch(generated.toString('latin1'), /EMAIL REQUEST TO CORPORATE TREASURY/i);
});

test('uses a second page for long supporting information', async () => {
  const data = requestData();
  const longNarrative = 'This request requires detailed commercial, contractual, operational, and delivery context for review. '.repeat(8);
  data.details.backgroundRequirement = longNarrative;
  data.details.projectDescription = longNarrative;
  data.details.optionalComments = longNarrative;
  data.details.deliveryInstructions = longNarrative;

  const generated = await generatePcgRequestForm(data);
  const pdf = await PDFDocument.load(generated);

  assert.equal(pdf.getPageCount(), 2);
});

test('replaces unsupported standard-font characters without failing generation', async () => {
  const data = requestData();
  data.details.optionalComments = 'Approved for delivery ✓';

  const generated = await generatePcgRequestForm(data);
  assert.equal(generated.subarray(0, 5).toString(), '%PDF-');
});

function requestData(): PcgRequestFormData {
  return {
    requestNumber: 'PCG-2026-00125',
    instrumentType: 'Parent Company Guarantee',
    applicant: 'Designer Engineering Limited',
    beneficiary: 'Example Infrastructure Authority',
    amount: 1250000,
    currency: 'USD',
    dueDate: '2026-10-31',
    nextReviewDate: '2027-09-16',
    requestedBy: 'Alex Requestor',
    notes: null,
    details: {
      emailRequestToCorporateTreasury: true,
      parentCompanyOfferingGuarantee: ['Designer Holdings Limited'],
      parentEntityType: 'localEntity',
      dateSubmitted: '2026-09-16',
      requestingEntity: ['Designer Engineering Limited'],
      contractingEntity: ['Designer Contracting LLC'],
      proposalContractReference: 'RFP-2026-784 / Metro extension',
      currentContractStatus: 'Awarded',
      beneficiaryAddress: '100 Finance Avenue, London, EC2 1AA',
      pcgLanguage: 'Beneficiary / Client Required Format',
      maximumLiabilityPercent: '15.00',
      obligationsExtinguishedDate: '2028-12-31',
      backgroundRequirement: 'Guarantee required under the awarded contract.',
      projectDescription: 'Metropolitan rail extension.',
      optionalComments: null,
      deliveryInstructions: 'Send the executed original to the beneficiary.',
      attachments: null,
      legalLanguageConfirmed: true,
    },
  };
}