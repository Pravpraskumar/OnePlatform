import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileText,
  Landmark,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

const sourceUrl = 'https://mcdermottinc-my.sharepoint.com/personal/praveen_kuppili_mcdermott_com/Documents/Microsoft%20Copilot%20Chat%20Files/FIN-TRS-PR-01002.00_Standby%20and%20Documentary%20Letters%20of%20Credit%20and%20Bank%20and%20Parent%20Company%20Guarantees_2.00.pdf';

interface WorkflowCategory {
  id: string;
  step: string;
  title: string;
  summary: string;
  owner: string;
  Icon: LucideIcon;
}

const categories: WorkflowCategory[] = [
  { id: 'identify-need', step: '01', title: 'Identify Security Need', summary: 'Confirm the contract, bid, payment, performance, retention, or customs requirement.', owner: 'Business / Project', Icon: ClipboardCheck },
  { id: 'select-instrument', step: '02', title: 'Select Instrument', summary: 'Assess lower-cost options before considering bank-backed instruments.', owner: 'Finance / Treasury', Icon: Scale },
  { id: 'initiate-request', step: '03', title: 'Initiate Request', summary: 'Coordinate contract details, reviewers, supporting documents, and deadlines.', owner: 'BDM / Project', Icon: FileText },
  { id: 'parent-guarantee', step: '04', title: 'Parent Company Guarantee', summary: 'Request, approve, issue, and monitor a PCG using controlled wording.', owner: 'Corporate Treasury', Icon: Building2 },
  { id: 'bank-guarantee', step: '05', title: 'Standby LC / Bank Guarantee', summary: 'Review commercial terms, submit the request, approve text, and issue.', owner: 'Treasury / Bank', Icon: Landmark },
  { id: 'received-guarantees', step: '06', title: 'Guarantees Received', summary: 'Review, register, safeguard, and monitor security received by McDermott.', owner: 'Business Line Finance', Icon: BadgeCheck },
  { id: 'documentary-lc', step: '07', title: 'Documentary LC Controls', summary: 'Control import and export terms, shipment details, values, and expiry dates.', owner: 'Finance / Treasury', Icon: Banknote },
  { id: 'monitor-approve', step: '08', title: 'Monitor & Approve', summary: 'Track active instruments, retain records, close obligations, and govern exceptions.', owner: 'Finance Authority', Icon: ShieldCheck },
];

function CategoryCard({ category }: { category: WorkflowCategory }) {
  const { Icon } = category;
  return (
    <a
      href={`#${category.id}`}
      className="group flex min-h-44 flex-col rounded-md border border-slate-200 bg-white p-4 text-slate-900 transition hover:border-brand/50 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-slate-100 p-2 text-slate-700 group-hover:bg-brand/10 group-hover:text-brand">
          <Icon size={19} />
        </span>
        <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">STEP {category.step}</span>
      </div>
      <h2 className="mt-4 font-semibold text-slate-900">{category.title}</h2>
      <p className="mt-2 flex-1 text-sm leading-5 text-slate-500">{category.summary}</p>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Users size={14} />{category.owner}</span>
        <ArrowRight size={15} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
    </a>
  );
}

function DetailSection({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-slate-200 py-8 first:border-t-0">
      <div className="grid gap-5 lg:grid-cols-[12rem_1fr]">
        <div>
          <span className="text-xs font-semibold uppercase text-brand">Step {number}</span>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="space-y-5 text-sm leading-6 text-slate-600">{children}</div>
      </div>
    </section>
  );
}

const BulletList = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc space-y-1 pl-5 marker:text-slate-400">{children}</ul>
);

export function CreditGuardLanding() {
  return (
    <div className="mx-auto max-w-7xl">
      <section className="rounded-md border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase text-brand">Financial security workflow</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">CreditGuard Process Guide</h1>
          <p className="mt-3 text-base text-slate-500">Select a category to review the controls for guarantees and letters of credit.</p>
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
          <Link to="/app/product/CreditGuard/requests" className="group flex items-center gap-4 rounded-md border border-slate-200 bg-slate-50 px-5 py-4 text-left transition hover:border-brand/50 hover:bg-white hover:shadow-md">
            <span className="rounded-md bg-brand/10 p-2.5 text-brand"><FileText size={20} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">Requests</span><span className="mt-0.5 block text-sm text-slate-500">Open and manage guarantee requests</span></span>
            <ArrowRight size={17} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
          <Link to="/app/product/CreditGuard/reports" className="group flex items-center gap-4 rounded-md border border-slate-200 bg-slate-50 px-5 py-4 text-left transition hover:border-brand/50 hover:bg-white hover:shadow-md">
            <span className="rounded-md bg-brand/10 p-2.5 text-brand"><BarChart3 size={20} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">Reports &amp; Analytics</span><span className="mt-0.5 block text-sm text-slate-500">Review portfolio status and values</span></span>
            <ArrowRight size={17} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>

      <aside className="mt-6 border-l-4 border-brand bg-brand/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={21} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <h2 className="font-semibold text-slate-900">Key principle</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Before requesting a Bank Guarantee or Letter of Credit, first evaluate whether a <strong>Letter of Comfort</strong> or <strong>Parent Company Guarantee</strong> is acceptable. These options are preferred because they offer lower cost and better control.
            </p>
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#464feb] hover:underline">
              Open governing procedure <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </aside>

      <div className="mt-8 bg-white px-6 sm:px-10">
        <DetailSection id="identify-need" number="01" title="Identify Security Need">
          <p>The requirement may arise from:</p>
          <BulletList>
            <li>Bid or Invitation to Tender (ITT).</li>
            <li>Contract negotiations or client requirements.</li>
            <li>Supplier or subcontractor requirements.</li>
            <li>Advance payment, performance, retention, customs clearance, or payment security needs.</li>
          </BulletList>
        </DetailSection>

        <DetailSection id="select-instrument" number="02" title="Select the Preferred Instrument">
          <p>Evaluate the available security instruments in this order:</p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {['Letter of Comfort', 'Parent Company Guarantee (PCG)', 'Standby Letter of Credit', 'Bank Guarantee', 'Documentary / Commercial Letter of Credit'].map((item, index) => (
              <li key={item} className="flex items-center gap-3 border border-slate-200 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p>PCGs and Letters of Comfort are preferred whenever acceptable to the counterparty.</p>
        </DetailSection>

        <DetailSection id="initiate-request" number="03" title="Initiate Request">
          <p>The Business Development Manager or Project Team reviews the contract clauses and sends the contract details to Legal, Business Line Finance, and Corporate Treasury.</p>
          <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-3">
            {['Legal', 'Business Line Finance', 'Corporate Treasury'].map((reviewer) => <div key={reviewer} className="bg-slate-50 px-4 py-3 font-medium text-slate-700">{reviewer}</div>)}
          </div>
          <p>Specify the response deadline, normally <strong>7 business days</strong>.</p>
        </DetailSection>

        <DetailSection id="parent-guarantee" number="04" title="Parent Company Guarantee">
          <div>
            <h3 className="font-semibold text-slate-800">Request phase</h3>
            <BulletList>
              <li>Complete FIN-TRS-FM-01002.01 Request for Parent Company Guarantee Form.</li>
              <li>Submit the request to Corporate Treasury.</li>
              <li>Obtain Treasury and Legal approval when wording differs from standard templates.</li>
            </BulletList>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Approval and administration</h3>
            <BulletList>
              <li>Corporate Treasurer approval is mandatory before commitment.</li>
              <li>Exceptions require Treasurer approval before contract execution.</li>
              <li>Regional Treasury prepares and monitors PCGs.</li>
              <li>Corporate Treasury maintains electronic records of all issued guarantees.</li>
            </BulletList>
          </div>
        </DetailSection>

        <DetailSection id="bank-guarantee" number="05" title="Standby LC / Bank Guarantee">
          <div>
            <h3 className="font-semibold text-slate-800">Commercial review</h3>
            <BulletList>
              <li>Use a defined expiry date and clearly stated drawdown conditions.</li>
              <li>The amount should typically not exceed 10% of contract value.</li>
              <li>Follow International Standby Practices and exclude embargoed countries.</li>
            </BulletList>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Request, text review, and issuance</h3>
            <BulletList>
              <li>Use FIN-TRS-FM-01001.01 Letter of Credit Request Form and include supporting contract documentation.</li>
              <li>Start with McDermott standard wording.</li>
              <li>Corporate Treasury and the issuing bank, where applicable, must approve client-requested changes.</li>
              <li>Corporate Treasury coordinates issuance after final wording is approved.</li>
            </BulletList>
          </div>
        </DetailSection>

        <DetailSection id="received-guarantees" number="06" title="Guarantees Issued to McDermott">
          <div>
            <h3 className="font-semibold text-slate-800">Parent Company Guarantees</h3>
            <p>Seek reciprocity so terms are at least as favorable as those McDermott provides, and prefer standard wording.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Letters of Credit / Bank Guarantees</h3>
            <BulletList>
              <li>Use Treasury-approved wording.</li>
              <li>Business Line Finance obtains originals and logs them in the global database.</li>
              <li>Send originals for safekeeping and monitor validity and compliance.</li>
            </BulletList>
          </div>
        </DetailSection>

        <DetailSection id="documentary-lc" number="07" title="Documentary / Commercial LC Controls">
          <BulletList>
            <li>Import LCs should generally provide a commercial advantage.</li>
            <li>Export transactions should require LCs from clients.</li>
            <li>Define partial shipment provisions, ports, and shipping locations clearly.</li>
            <li>Amend LC values when contract values change.</li>
            <li>Allow sufficient completion and shipping time in expiry dates.</li>
            <li>Forward original LC documents promptly to Treasury.</li>
          </BulletList>
        </DetailSection>

        <DetailSection id="monitor-approve" number="08" title="Monitoring and Approval Requirements">
          <div>
            <h3 className="font-semibold text-slate-800">Monitoring and records</h3>
            <BulletList>
              <li>Business Line Finance tracks active guarantees, logs, databases, and expiry dates.</li>
              <li>Recover and close guarantees when obligations are fulfilled.</li>
              <li>Escalate exceptions to Corporate Treasury.</li>
            </BulletList>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Conditions and approval requirements</h3>
            <BulletList>
              <li>Standby LC and BG approval must follow the Delegation of Authority.</li>
              <li>Duration should generally not exceed <strong>5 years</strong> unless contractually required.</li>
              <li>Qualify on-demand payment provisions wherever possible.</li>
              <li>Corporate Treasurer approval is required for support requested by issuing banks.</li>
              <li>If requirements cannot be met, the highest finance authority must consult the Corporate Treasurer.</li>
            </BulletList>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}