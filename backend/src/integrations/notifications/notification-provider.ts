export interface NotificationProvider {
  send(userId: string, title: string, body: string): Promise<void>;
}
export class MockNotificationProvider implements NotificationProvider {
  readonly sent: Array<{ userId: string; title: string; body: string }> = [];
  async send(userId: string, title: string, body: string) {
    this.sent.push({ userId, title, body });
  }
}
