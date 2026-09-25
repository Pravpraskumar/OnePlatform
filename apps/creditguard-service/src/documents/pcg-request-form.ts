import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export interface PcgRequestFormData {
  requestNumber: string;
  instrumentType: string;
  applicant: string;
  beneficiary: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  nextReviewDate: string | null;
  requestedBy: string;
  notes: string | null;
  details: {
    emailRequestToCorporateTreasury: boolean;
    parentCompanyOfferingGuarantee: string[];
    parentEntityType: string;
    dateSubmitted: string;
    requestingEntity: string[];
    contractingEntity: string[];
    proposalContractReference: string;
    currentContractStatus: string;
    beneficiaryAddress: string | null;
    pcgLanguage: string;
    maximumLiabilityMode: 'number' | 'text';
    maximumLiabilityPercent: string | null;
    obligationsExtinguishedDate: string | null;
    backgroundRequirement: string;
    projectDescription: string;
    optionalComments: string | null;
    deliveryInstructions: string | null;
    attachments: string | null;
    legalLanguageConfirmed: boolean;
  };
}

interface CellOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: unknown;
  fill?: ReturnType<typeof rgb>;
}

interface NarrativeField {
  label: string;
  value: unknown;
}

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 32;
const contentWidth = pageWidth - margin * 2;
const navy = rgb(0.035, 0.12, 0.22);
const blue = rgb(0.08, 0.25, 0.52);
const red = rgb(0.82, 0.08, 0.12);
const paleBlue = rgb(0.94, 0.97, 0.985);
const paleGray = rgb(0.975, 0.98, 0.985);
const divider = rgb(0.68, 0.73, 0.79);
const muted = rgb(0.35, 0.4, 0.46);
const white = rgb(1, 1, 1);

export async function generatePcgRequestForm(data: PcgRequestFormData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(readFileSync(join(__dirname, '..', 'assets', 'mcdermott-logo.png')));
  const pages: PDFPage[] = [];
  let page = addPage(pdf, pages, bold, logo, data);
  let y = 713;

  const drawCell = (options: CellOptions) => drawFormCell(page, regular, bold, options);
  const details = data.details;
  const twoThirds = contentWidth * 0.64;
  const oneThird = contentWidth - twoThirds;

  drawCell({ x: margin, y, width: twoThirds, height: 43, label: 'Parent company offering guarantee', value: details.parentCompanyOfferingGuarantee.join('; ') });
  drawCell({ x: margin + twoThirds, y, width: oneThird, height: 43, label: 'Date submitted', value: formatDate(details.dateSubmitted) });
  y -= 43;
  drawCell({ x: margin, y, width: twoThirds, height: 43, label: 'Name of requesting entity', value: details.requestingEntity.join('; ') });
  drawCell({ x: margin + twoThirds, y, width: oneThird, height: 43, label: 'Date required by', value: formatDate(data.dueDate) });
  y -= 43;
  drawCell({ x: margin, y, width: twoThirds, height: 45, label: 'Name of contracting entity', value: details.contractingEntity.join('; ') });
  drawCell({ x: margin + twoThirds, y, width: oneThird, height: 45, label: 'Proposal / contract reference number and name', value: details.proposalContractReference });
  y -= 45;

  const leftContractColumn = twoThirds / 2;
  const contractRowHeight = 108;
  const contractDetailHeight = contractRowHeight / 3;
  drawCell({ x: margin, y, width: leftContractColumn, height: contractRowHeight, label: 'Current status', value: details.currentContractStatus, fill: paleGray });
  drawCompactCell(page, regular, bold, { x: margin + leftContractColumn, y, width: leftContractColumn, height: contractDetailHeight, label: 'Contract', value: data.applicant, fill: paleGray });
  drawCompactCell(page, regular, bold, { x: margin + leftContractColumn, y: y - contractDetailHeight, width: leftContractColumn, height: contractDetailHeight, label: 'Value in USD', value: `${data.currency} ${formatAmount(data.amount)}`, fill: paleGray });
  drawCompactCell(page, regular, bold, { x: margin + leftContractColumn, y: y - contractDetailHeight * 2, width: leftContractColumn, height: contractDetailHeight, label: details.maximumLiabilityMode === 'number' ? 'Max liability cap (% of contract value)' : 'Max liability cap', value: details.maximumLiabilityPercent ? `${details.maximumLiabilityPercent}${details.maximumLiabilityMode === 'number' ? '%' : ''}` : null, fill: paleGray });
  drawCell({ x: margin + twoThirds, y, width: oneThird, height: contractRowHeight, label: 'Contractual obligations extinguished', value: formatDate(details.obligationsExtinguishedDate), fill: paleGray });
  y -= contractRowHeight;

  drawCell({ x: margin, y, width: contentWidth, height: 55, label: 'Beneficiary of guarantee', value: `${data.beneficiary}\n${display(details.beneficiaryAddress)}` });
  y -= 55;

  const narratives: NarrativeField[] = [
    { label: 'Background on requirement for guarantee', value: details.backgroundRequirement },
    { label: 'Brief description of project / undertaking', value: details.projectDescription },
    { label: 'Optional comments', value: details.optionalComments ?? data.notes },
    { label: 'Delivery instructions', value: details.deliveryInstructions },
  ];
  const half = contentWidth / 2;
  const narrativeHeights = [
    Math.max(requiredCellHeight(regular, narratives[0].value, half - 14), requiredCellHeight(regular, narratives[1].value, half - 14), 56),
    Math.max(requiredCellHeight(regular, narratives[2].value, half - 14), requiredCellHeight(regular, narratives[3].value, half - 14), 48),
  ];
  const administrationHeight = 91;
  const narrativeFitsFirstPage = narrativeHeights[0] + narrativeHeights[1] + administrationHeight <= y - 54;

  if (narrativeFitsFirstPage) {
    drawNarrativeGrid(page, regular, bold, narratives, y, narrativeHeights);
    y -= narrativeHeights[0] + narrativeHeights[1];
    drawAdministration(page, regular, bold, data, y);
  } else {
    page = addPage(pdf, pages, bold, logo, data, 'Supporting information');
    y = 713;
    for (const narrative of narratives) {
      const height = Math.min(142, Math.max(72, requiredCellHeight(regular, narrative.value, contentWidth - 14)));
      drawFormCell(page, regular, bold, { x: margin, y, width: contentWidth, height, label: narrative.label, value: narrative.value });
      y -= height;
    }
    drawAdministration(page, regular, bold, data, y);
  }

  pages.forEach((pdfPage, index) => drawFooter(pdfPage, regular, data.requestNumber, index + 1, pages.length));
  pdf.setTitle(`${data.requestNumber} - Parent Company Guarantee Request`);
  pdf.setSubject(`${data.instrumentType} request for ${data.beneficiary}`);
  pdf.setAuthor('McDermott CreditGuard');
  pdf.setProducer('Designer Platform CreditGuard');
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function drawNarrativeGrid(page: PDFPage, regular: PDFFont, bold: PDFFont, narratives: NarrativeField[], y: number, heights: number[]) {
  const half = contentWidth / 2;
  drawFormCell(page, regular, bold, { x: margin, y, width: half, height: heights[0], ...narratives[0] });
  drawFormCell(page, regular, bold, { x: margin + half, y, width: half, height: heights[0], ...narratives[1] });
  y -= heights[0];
  drawFormCell(page, regular, bold, { x: margin, y, width: half, height: heights[1], ...narratives[2] });
  drawFormCell(page, regular, bold, { x: margin + half, y, width: half, height: heights[1], ...narratives[3] });
}

function drawAdministration(page: PDFPage, regular: PDFFont, bold: PDFFont, data: PcgRequestFormData, y: number) {
  const details = data.details;
  const column = contentWidth / 4;
  drawFormCell(page, regular, bold, { x: margin, y, width: column, height: 48, label: 'PCG language', value: details.pcgLanguage, fill: paleBlue });
  drawFormCell(page, regular, bold, { x: margin + column, y, width: column, height: 48, label: 'Parent entity type', value: details.parentEntityType === 'mil' ? 'McDermott International Limited' : 'Local entity', fill: paleBlue });
  drawFormCell(page, regular, bold, { x: margin + column * 2, y, width: column, height: 48, label: 'Legal language confirmed', value: details.legalLanguageConfirmed ? 'Yes' : 'No', fill: paleBlue });
  drawFormCell(page, regular, bold, { x: margin + column * 3, y, width: contentWidth - column * 3, height: 48, label: 'Next review date', value: formatDate(data.nextReviewDate), fill: paleBlue });
  y -= 48;
  const half = contentWidth / 2;
  drawFormCell(page, regular, bold, { x: margin, y, width: half, height: 43, label: 'Requested by', value: data.requestedBy });
  drawFormCell(page, regular, bold, { x: margin + half, y, width: half, height: 43, label: 'Attachment description', value: details.attachments });
}

function drawFormCell(page: PDFPage, regular: PDFFont, bold: PDFFont, { x, y, width, height, label, value, fill = white }: CellOptions) {
  page.drawRectangle({ x, y: y - height, width, height, color: fill, borderColor: divider, borderWidth: 0.65 });
  const labelSize = 6.8;
  const labelLineHeight = 7.6;
  const labelLines = wrapText(bold, label.toUpperCase(), labelSize, width - 14);
  labelLines.forEach((line, index) => page.drawText(line, { x: x + 7, y: y - 12 - index * labelLineHeight, size: labelSize, font: bold, color: muted }));
  const valueTop = y - 24 - (labelLines.length - 1) * labelLineHeight;
  drawFittedText(page, regular, display(value) || 'Not provided', x + 7, valueTop, width - 14, height - 29 - (labelLines.length - 1) * labelLineHeight);
}

function drawCompactCell(page: PDFPage, regular: PDFFont, bold: PDFFont, { x, y, width, height, label, value, fill = white }: CellOptions) {
  page.drawRectangle({ x, y: y - height, width, height, color: fill, borderColor: divider, borderWidth: 0.65 });
  const labelLines = wrapText(bold, label.toUpperCase(), 5.8, width - 12).slice(0, 2);
  const labelTop = y - 9;
  labelLines.forEach((line, index) => page.drawText(line, { x: x + 6, y: labelTop - index * 6.6, size: 5.8, font: bold, color: muted }));
  const valueTop = labelTop - labelLines.length * 6.6 - 2;
  drawFittedText(page, regular, display(value) || 'Not provided', x + 6, valueTop, width - 12, height - 14 - labelLines.length * 6.6);
}

function addPage(pdf: PDFDocument, pages: PDFPage[], bold: PDFFont, logo: PDFImage, data: PcgRequestFormData, heading = 'Request details') {
  const page = pdf.addPage([pageWidth, pageHeight]);
  pages.push(page);
  page.drawRectangle({ x: 0, y: pageHeight - 92, width: pageWidth, height: 92, color: navy });
  const brandFontSize = 20;
  const logoSize = logo.scaleToFit(Number.POSITIVE_INFINITY, brandFontSize);
  page.drawImage(logo, { x: margin, y: pageHeight - 40, width: logoSize.width, height: logoSize.height });
  page.drawText('McDermott', { x: margin + logoSize.width + 7, y: pageHeight - 36, size: brandFontSize, font: bold, color: white });
  page.drawText('REQUEST FOR PARENT COMPANY GUARANTEE', { x: margin, y: pageHeight - 67, size: 12, font: bold, color: white });
  const requestNumber = safeText(bold, data.requestNumber);
  page.drawText(requestNumber, { x: pageWidth - margin - bold.widthOfTextAtSize(requestNumber, 10), y: pageHeight - 67, size: 10, font: bold, color: white });
  page.drawRectangle({ x: margin, y: 724, width: 4, height: 24, color: red });
  page.drawText(heading, { x: margin + 12, y: 730, size: 14, font: bold, color: navy });
  const instrumentType = safeText(bold, data.instrumentType);
  page.drawText(instrumentType, { x: pageWidth - margin - bold.widthOfTextAtSize(instrumentType, 8), y: 732, size: 8, font: bold, color: blue });
  return page;
}

function drawFooter(page: PDFPage, regular: PDFFont, requestNumber: string, pageNumber: number, pageCount: number) {
  page.drawLine({ start: { x: margin, y: 42 }, end: { x: pageWidth - margin, y: 42 }, thickness: 0.8, color: blue });
  page.drawText(`Generated by CreditGuard | ${requestNumber}`, { x: margin, y: 27, size: 7, font: regular, color: muted });
  page.drawText(`Page ${pageNumber} of ${pageCount}`, { x: pageWidth - margin - 40, y: 27, size: 7, font: regular, color: muted });
}

function requiredCellHeight(font: PDFFont, value: unknown, width: number) {
  return wrapText(font, display(value) || 'Not provided', 8.4, width).length * 10.4 + 31;
}

function drawFittedText(page: PDFPage, font: PDFFont, value: string, x: number, top: number, width: number, height: number) {
  let size = 8.4;
  let lines = wrapText(font, value, size, width);
  while (size > 6.2 && lines.length * (size + 2) > height) {
    size -= 0.4;
    lines = wrapText(font, value, size, width);
  }
  const lineHeight = size + 2;
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = ellipsize(font, lines[maxLines - 1], size, width);
  }
  lines.forEach((line, index) => page.drawText(line, { x, y: top - index * lineHeight, size, font, color: navy }));
}

function wrapText(font: PDFFont, value: string, size: number, width: number) {
  const paragraphs = safeText(font, value).replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
  });
  return lines.length ? lines : ['Not provided'];
}

function ellipsize(font: PDFFont, value: string, size: number, width: number) {
  let result = value;
  while (result && font.widthOfTextAtSize(`${result}...`, size) > width) result = result.slice(0, -1);
  return `${result.trimEnd()}...`;
}

function safeText(font: PDFFont, value: string) {
  return [...value].map((character) => {
    try {
      font.encodeText(character);
      return character;
    } catch {
      return '?';
    }
  }).join('');
}

function display(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]} ${monthName(match[2])} ${match[1]}` : value;
}

function monthName(month: string) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1] ?? month;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
