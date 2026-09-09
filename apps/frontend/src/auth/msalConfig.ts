import { Configuration, LogLevel, PopupRequest } from '@azure/msal-browser';

const tenant = import.meta.env.VITE_B2C_TENANT_NAME as string;
const policy = import.meta.env.VITE_B2C_POLICY_SIGNUP_SIGNIN as string;
const clientId = import.meta.env.VITE_B2C_CLIENT_ID as string;
const apiScope = import.meta.env.VITE_B2C_API_SCOPE as string;

const authority = `https://${tenant}.b2clogin.com/${tenant}.onmicrosoft.com/${policy}`;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    knownAuthorities: [`${tenant}.b2clogin.com`],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message) => {
        if (import.meta.env.DEV) console.debug(message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Scopes requested at sign-in and for API access tokens.
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', apiScope].filter(Boolean),
};

export const apiTokenRequest = {
  scopes: [apiScope].filter(Boolean),
};
