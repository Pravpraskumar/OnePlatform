import { useEffect, useRef, useState, ReactNode } from 'react';
import { clsx } from 'clsx';

interface Props {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  side?: 'top' | 'bottom' | 'right';
  triggerClassName?: string;
}

// Minimal accessible dropdown used by the header org/language selectors.
export function Dropdown({
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx('outline-none', triggerClassName)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={clsx(
            'absolute z-50 min-w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg',
            side === 'right' ? 'bottom-0 left-full ml-2' : align === 'right' ? 'right-0' : 'left-0',
            side === 'top' ? 'bottom-full mb-2' : side === 'bottom' ? 'top-full mt-2' : '',
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}
