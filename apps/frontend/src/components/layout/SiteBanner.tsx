import { useTheme } from '@/state/ThemeProvider';

// Renders the admin-configured site banner. Content is admin-authored HTML.
export function SiteBanner() {
  const { banner } = useTheme();

  if (!banner.enabled || !banner.content) return null;

  return (
    <div
      className="px-4 py-2 text-center text-sm"
      style={{ backgroundColor: banner.bgColor, color: banner.textColor }}
      dangerouslySetInnerHTML={{ __html: banner.content }}
    />
  );
}
