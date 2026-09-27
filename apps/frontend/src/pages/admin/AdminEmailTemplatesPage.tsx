import { useEffect, useRef, useState } from 'react';
import { Braces, Mail, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';

interface EmailTemplate {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  eventKey: string;
  eventName: string;
  subjectTemplate: string;
  bodyTemplate: string;
  availablePlaceholders: string[];
  updatedAt: string;
}

type ActiveField = 'subject' | 'body';

const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15';

export function AdminEmailTemplatesPage() {
  const api = useApi();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('subject');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const products = [...new Map(templates.map((template) => [template.productCode, template.productName])).entries()];
  const dirty = selected
    ? subjectTemplate !== selected.subjectTemplate || bodyTemplate !== selected.bodyTemplate
    : false;

  useEffect(() => {
    let active = true;
    api.get<EmailTemplate[]>('/notifications/email-templates')
      .then((rows) => {
        if (!active) return;
        setTemplates(rows);
        setSelectedId(rows[0]?.id ?? '');
        setSubjectTemplate(rows[0]?.subjectTemplate ?? '');
        setBodyTemplate(rows[0]?.bodyTemplate ?? '');
      })
      .catch((requestError: Error) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api]);

  const selectTemplate = (template: EmailTemplate) => {
    setSelectedId(template.id);
    setSubjectTemplate(template.subjectTemplate);
    setBodyTemplate(template.bodyTemplate);
    setError('');
  };

  const insertPlaceholder = (name: string) => {
    const token = `{{${name}}}`;
    const element = activeField === 'subject' ? subjectRef.current : bodyRef.current;
    const value = activeField === 'subject' ? subjectTemplate : bodyTemplate;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const updated = `${value.slice(0, start)}${token}${value.slice(end)}`;
    if (activeField === 'subject') setSubjectTemplate(updated);
    else setBodyTemplate(updated);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/notifications/email-templates/${selected.id}`, { subjectTemplate, bodyTemplate });
      setTemplates((rows) => rows.map((row) => row.id === selected.id
        ? { ...row, subjectTemplate: subjectTemplate.trim(), bodyTemplate: bodyTemplate.trim(), updatedAt: new Date().toISOString() }
        : row));
      setSubjectTemplate(subjectTemplate.trim());
      setBodyTemplate(bodyTemplate.trim());
      notify(`${selected.eventName} template saved.`, 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><Mail size={24} />Email Templates</h1>
        <p className="mt-1 text-sm text-slate-500">Configure messages sent by product email events.</p>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-8 text-sm text-slate-500">Loading email templates...</p>}
      {!loading && templates.length === 0 && !error && <p className="mt-8 text-sm text-slate-500">No email events are configured.</p>}

      {selected && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Email events" className="border-r border-slate-200 pr-5">
            {products.map(([productCode, productName]) => (
              <div key={productCode} className="mb-5">
                <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">{productName}</h2>
                <div className="space-y-1">
                  {templates.filter((template) => template.productCode === productCode).map((template) => (
                    <button key={template.id} type="button" onClick={() => selectTemplate(template)} className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium ${selectedId === template.id ? 'bg-brand text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                      {template.eventName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <section aria-labelledby="template-event-heading" className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 id="template-event-heading" className="text-lg font-semibold text-slate-900">{selected.eventName}</h2>
                <p className="mt-1 text-xs text-slate-500">Event key: <span className="font-mono">{selected.eventKey}</span></p>
              </div>
              <Button onClick={() => void save()} disabled={!dirty || saving || !subjectTemplate.trim() || !bodyTemplate.trim()}><Save size={16} />{saving ? 'Saving...' : 'Save template'}</Button>
            </div>

            <div className="mt-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Braces size={16} />Available placeholders</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.availablePlaceholders.map((placeholder) => <button key={placeholder} type="button" onClick={() => insertPlaceholder(placeholder)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 hover:border-brand hover:text-brand" title={`Insert {{${placeholder}}}`} aria-label={`Insert ${placeholder} placeholder`}>{`{{${placeholder}}}`}</button>)}
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block text-sm font-medium text-slate-700">Subject
                <input ref={subjectRef} value={subjectTemplate} onChange={(event) => setSubjectTemplate(event.target.value)} onFocus={() => setActiveField('subject')} maxLength={300} className={`mt-2 ${fieldClass}`} />
              </label>
              <label className="block text-sm font-medium text-slate-700">Body
                <textarea ref={bodyRef} value={bodyTemplate} onChange={(event) => setBodyTemplate(event.target.value)} onFocus={() => setActiveField('body')} maxLength={10000} rows={14} className={`mt-2 resize-y font-mono leading-6 ${fieldClass}`} />
              </label>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}