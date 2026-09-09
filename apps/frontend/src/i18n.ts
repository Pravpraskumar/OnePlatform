import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const supportedLanguages = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
];

const resources = {
  en: {
    translation: {
      products: 'Products',
      resources: 'Resources',
      selectOrganisation: 'Select Organisation',
      switch: 'Switch Organisation',
      orgSettings: 'Org-Settings',
      orgTeams: 'Org-Teams',
      orgAdministrator: 'Org Administrator',
      signIn: 'Sign In',
      signUp: 'Sign Up',
      signOut: 'Sign Out',
      dashboard: 'Dashboard',
      administration: 'Administration',
    },
  },
  de: {
    translation: {
      products: 'Produkte',
      resources: 'Ressourcen',
      selectOrganisation: 'Organisation wählen',
      switch: 'Wechseln Organisation',
      orgSettings: 'Org-Einstellungen',
      orgTeams: 'Org-Teams',
      orgAdministrator: 'Org-Administrator',
      signIn: 'Anmelden',
      signUp: 'Registrieren',
      signOut: 'Abmelden',
      dashboard: 'Übersicht',
      administration: 'Verwaltung',
    },
  },
  fr: {
    translation: {
      products: 'Produits',
      resources: 'Ressources',
      selectOrganisation: 'Choisir une organisation',
      switch: 'Changer Organisation',
      orgSettings: 'Paramètres',
      orgTeams: 'Équipes',
      orgAdministrator: 'Administrateur',
      signIn: 'Se connecter',
      signUp: "S'inscrire",
      signOut: 'Se déconnecter',
      dashboard: 'Tableau de bord',
      administration: 'Administration',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('lang') ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
