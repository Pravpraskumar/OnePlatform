import { Boxes } from 'lucide-react';

const appName = (import.meta.env.VITE_APP_NAME as string) ?? 'Platform';

// Responsive brand: compact mark on small screens, full logo + name on larger.
export function Logo({ textColor }: { textColor?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
        <Boxes size={20} />
      </div>
      {/* Full wordmark hidden below the sm breakpoint (tablet-and-up shows it). */}
      <span
        className="hidden text-lg font-semibold sm:inline"
        style={{ color: textColor ?? '#0f172a' }}
      >
        {appName}
      </span>
    </div>
  );
}
