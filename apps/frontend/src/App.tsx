import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '@/lib/ApiProvider';
import { OrgProvider } from '@/state/OrgProvider';
import { SessionProvider } from '@/state/SessionProvider';
import { ThemeProvider } from '@/state/ThemeProvider';
import { router } from '@/router';
import { SystemFeedbackProvider } from '@/components/system/SystemFeedbackProvider';

const queryClient = new QueryClient();

export function App() {
  return (
    <SystemFeedbackProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <SessionProvider>
            <ThemeProvider>
              <OrgProvider>
                <RouterProvider router={router} future={{ v7_startTransition: true }} />
              </OrgProvider>
            </ThemeProvider>
          </SessionProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SystemFeedbackProvider>
  );
}
