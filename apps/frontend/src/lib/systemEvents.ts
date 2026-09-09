export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export interface SystemNotification {
  message: string;
  kind: NotificationKind;
}

export const SESSION_EXPIRED_EVENT = 'platform:session-expired';
export const SYSTEM_NOTIFICATION_EVENT = 'platform:notification';

export function notify(message: string, kind: NotificationKind = 'info') {
  window.dispatchEvent(new CustomEvent<SystemNotification>(SYSTEM_NOTIFICATION_EVENT, {
    detail: { message, kind },
  }));
}

export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}