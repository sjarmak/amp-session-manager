export class Notifier {
  async notify(title: string, message: string): Promise<void> {
    // Desktop notifications will be implemented in the Electron app
    console.log(`NOTIFICATION: ${title} - ${message}`);
  }
  
  async notifySessionComplete(sessionName: string): Promise<void> {
    await this.notify('Session Complete', `Session "${sessionName}" has finished.`);
  }
  
  async notifyAwaitingInput(sessionName: string): Promise<void> {
    await this.notify('Awaiting Input', `Session "${sessionName}" needs your attention.`);
  }
  
  async notifyConflict(sessionName: string): Promise<void> {
    await this.notify('Rebase Conflict', `Session "${sessionName}" has merge conflicts.`);
  }
}
