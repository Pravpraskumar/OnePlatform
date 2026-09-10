import { Link } from 'react-router-dom';
import {BrandingLogoIcon} from './BrandingLogo';

const appName = (import.meta.env.VITE_APP_NAME as string) ?? 'Platform';

// Responsive brand: compact mark on small screens, full logo + name on larger.
export function Logo({ textColor, moduleName }: { textColor?: string; moduleName?: string | null }) {
  return (
    <Link to="/app/dashboard" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`${appName} home dashboard`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white">
        <BrandingLogoIcon />
      </div>
      {/* Full wordmark hidden below the sm breakpoint (tablet-and-up shows it). */}
      <span
        className="hidden text-lg font-semibold sm:inline"
        style={{ color: textColor ?? '#0f172a' }}
      >
        {appName}{moduleName ? ` - ${moduleName}` : ''}
      </span>
    </Link>
  );
}
