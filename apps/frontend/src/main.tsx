import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication, EventType, AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { isMsalAvailable, msalConfig, unavailableMsalInstance } from '@/auth/msalConfig';
import { App } from '@/App';
import '@/i18n';
import '@/index.css';

const msalInstance = isMsalAvailable
  ? new PublicClientApplication(msalConfig)
  : unavailableMsalInstance;

async function bootstrap() {
  if (isMsalAvailable) {
    await msalInstance.initialize();

    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
    }

    // Keep the active account in sync after interactive sign-in.
    msalInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        msalInstance.setActiveAccount((event.payload as AuthenticationResult).account);
      }
    });

    await msalInstance.handleRedirectPromise();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  );
}

bootstrap();
