import { Cloud } from 'lucide-react';

export type FieldValue = string | number | boolean | null;
export type FilterKind = { type: 'boolean' } | { type: 'choice'; options: string[] } | { type: 'number' } | { type: 'text' };

export const BLANK = '__blank__';

// Identifies data imported from Salesforce and the Salesforce object it came from.
export function SalesforceSourceBadge({ objectName }: { objectName: string }) {
  return (
    <p data-testid="salesforce-data-source" className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
      <Cloud size={12} aria-hidden="true" />
      Data source: Salesforce
      <span className="font-mono text-[11px] text-sky-600">· {objectName}</span>
    </p>
  );
}
const MAX_CHOICES = 40;
const isBlank = (value: FieldValue | undefined) => value === null || value === undefined || value === '';

export function formatValue(value: FieldValue | undefined) {
  if (isBlank(value)) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

// Yes/no and numeric columns get typed filters; short picklists get dropdowns unless the column is free text.
export function inferFilterKind(columnValues: FieldValue[], freeText: boolean): FilterKind {
  const values = columnValues.filter((value) => !isBlank(value));
  if (values.length > 0 && values.every((value) => typeof value === 'boolean')) return { type: 'boolean' };
  if (values.length > 0 && values.every((value) => typeof value === 'number')) return { type: 'number' };
  const distinct = [...new Set(values.map(String))];
  if (!freeText && distinct.length > 0 && distinct.length <= MAX_CHOICES) {
    return { type: 'choice', options: distinct.sort((a, b) => a.localeCompare(b)) };
  }
  return { type: 'text' };
}

// Number filters accept >, >=, <, <=, = or an a..b range; anything else matches displayed text.
export function matchesFilter(value: FieldValue, filter: string, kind: FilterKind) {
  if (!filter) return true;
  if (filter === BLANK) return isBlank(value);
  if (kind.type === 'boolean') return value === (filter === 'true');
  if (kind.type === 'choice') return !isBlank(value) && String(value) === filter;
  if (kind.type === 'number') {
    const expression = filter.replace(/,/g, '').trim();
    const range = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(expression);
    const comparison = /^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/.exec(expression);
    if (range || comparison) {
      if (typeof value !== 'number') return false;
      if (range) return value >= Number(range[1]) && value <= Number(range[2]);
      const target = Number(comparison![2]);
      switch (comparison![1]) {
        case '>': return value > target;
        case '>=': return value >= target;
        case '<': return value < target;
        case '<=': return value <= target;
        default: return value === target;
      }
    }
  }
  return formatValue(value).toLowerCase().includes(filter.trim().toLowerCase());
}

export function ColumnFilter({ label, kind, value, onChange }: { label: string; kind: FilterKind; value: string; onChange: (value: string) => void }) {
  const className = 'w-full min-w-[8rem] rounded border border-slate-300 bg-white px-2 py-1 text-xs font-normal normal-case text-slate-700';
  if (kind.type === 'boolean' || kind.type === 'choice') {
    return (
      <select aria-label={`Filter ${label}`} value={value} onChange={(event) => onChange(event.target.value)} className={className}>
        <option value="">All</option>
        {kind.type === 'boolean'
          ? <><option value="true">Yes</option><option value="false">No</option></>
          : kind.options.map((option) => <option key={option} value={option}>{option}</option>)}
        <option value={BLANK}>(Blank)</option>
      </select>
    );
  }
  return (
    <input
      aria-label={`Filter ${label}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={kind.type === 'number' ? 'e.g. >1000 or 10..50' : 'Contains'}
      title={kind.type === 'number' ? 'Use >, >=, <, <=, = or a range such as 100..500' : undefined}
      className={className}
    />
  );
}
