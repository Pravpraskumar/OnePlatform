import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { supportedLanguages } from '@/i18n';
import { useTheme } from '@/state/ThemeProvider';

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const { headerTextColor } = useTheme();
  const current = supportedLanguages.find((l) => l.code === i18n.language) ?? supportedLanguages[0];

  const change = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('lang', code);
  };

  return (
    <Dropdown
      trigger={
        <span
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-black/5"
          style={{ color: headerTextColor }}
        >
          <Globe size={16} />
          <span className="hidden md:inline">{current.label}</span>
        </span>
      }
    >
      {supportedLanguages.map((l) => (
        <DropdownItem key={l.code} onClick={() => change(l.code)}>
          {l.label}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
