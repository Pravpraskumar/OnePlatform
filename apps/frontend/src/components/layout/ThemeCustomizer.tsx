import { useState } from 'react';
import { Check, Moon, Palette, RotateCcw, Sun, X } from 'lucide-react';
import { DEFAULT_USER_THEME, useTheme, type UserThemePreferences } from '@/state/ThemeProvider';

interface Props {
  open: boolean;
  onClose: () => void;
}

const presets: { id: UserThemePreferences['preset']; name: string; colors: string[] }[] = [
  { id: 'slate', name: 'Slate', colors: ['#0f172a', '#64748b', '#e2e8f0'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0c4a6e', '#0284c7', '#bae6fd'] },
  { id: 'forest', name: 'Forest', colors: ['#14532d', '#16a34a', '#bbf7d0'] },
  { id: 'rose', name: 'Rose', colors: ['#4c0519', '#e11d48', '#fecdd3'] },
];

const radii = [0, 4, 6, 8, 12, 16];

export function ThemeCustomizer({ open, onClose }: Props) {
  const { userTheme, themeLoading, updateUserTheme, resetUserTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isDefault = Object.entries(DEFAULT_USER_THEME).every(
    ([key, value]) => userTheme[key as keyof UserThemePreferences] === value,
  );

  if (!open) return null;

  const save = async (update: Partial<UserThemePreferences>) => {
    setSaving(true);
    setError('');
    try {
      await updateUserTheme({ ...userTheme, ...update });
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setError('');
    try {
      await resetUserTheme();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" aria-label="Close theme customizer" className="fixed inset-0 z-40 cursor-default bg-slate-950/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl" aria-label="Theme customizer">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-100 p-2 text-slate-600"><Palette size={17} /></span>
              <h2 className="font-semibold text-slate-900">Theme Customizer</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">Customize your workspace appearance.</p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={reset} disabled={saving} className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Reset theme" title="Reset theme"><RotateCcw size={16} /></button>
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" aria-label="Close theme customizer" title="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="text-sm font-medium text-slate-700">Mode</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={saving || themeLoading} onClick={() => save({ mode: 'light' })} className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${userTheme.mode === 'light' ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><Sun size={16} />Light</button>
              <button type="button" disabled={saving || themeLoading} onClick={() => save({ mode: 'dark' })} className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${userTheme.mode === 'dark' ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><Moon size={16} />Dark</button>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <h3 className="text-sm font-medium text-slate-700">Theme preset</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button key={preset.id} type="button" disabled={saving || themeLoading} onClick={() => save({ preset: preset.id })} className={`relative rounded-md border p-3 text-left ${userTheme.preset === preset.id ? 'border-brand ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="flex items-center gap-1.5">
                    {preset.colors.map((color) => <span key={color} className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}
                  </span>
                  <span className="mt-2 block text-sm text-slate-700">{preset.name}</span>
                  {userTheme.preset === preset.id && <Check size={15} className="absolute right-2 top-2 text-brand" />}
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <h3 className="text-sm font-medium text-slate-700">Radius</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {radii.map((radius) => (
                <button key={radius} type="button" disabled={saving || themeLoading} onClick={() => save({ radius })} className={`border px-3 py-2 text-sm ${userTheme.radius === radius ? 'border-brand bg-brand/5 text-brand' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`} style={{ borderRadius: radius }}>
                  {radius}px
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <h3 className="text-sm font-medium text-slate-700">Brand color</h3>
            <label className="mt-3 flex items-center gap-3 rounded-md border border-slate-300 p-3">
              <input type="color" value={userTheme.brandColor} disabled={saving || themeLoading} onChange={(event) => void save({ brandColor: event.target.value })} className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" />
              <span className="font-mono text-sm uppercase text-slate-600">{userTheme.brandColor}</span>
            </label>
          </section>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Theme could not be saved. {error}</p>}
          <p className="text-xs text-slate-400">Changes are saved to your account and apply to your workspace only. Header and banner colors remain unchanged.</p>
        </div>

        <div className="border-t border-slate-200 px-5 py-3 text-right text-xs text-slate-400">
          {saving ? 'Saving...' : isDefault ? 'Default theme' : 'Saved to your account'}
        </div>
      </aside>
    </>
  );
}
