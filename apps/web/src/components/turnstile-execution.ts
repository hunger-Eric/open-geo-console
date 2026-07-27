export class DeferredTurnstileExecution {
  private requested = false;
  private executeReady: (() => void) | null = null;

  request(): void {
    if (this.executeReady) {
      this.executeReady();
      return;
    }
    this.requested = true;
  }

  ready(execute: () => void): void {
    this.executeReady = execute;
    if (!this.requested) return;
    this.requested = false;
    execute();
  }

  clear(): void {
    this.requested = false;
    this.executeReady = null;
  }
}
