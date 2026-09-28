import type { RunEnvelopeEvent } from '@assistant/contracts';

export type RunEventListener = (event: RunEnvelopeEvent | Record<string, unknown>) => void;

export class RunEventBus {
  private static instance: RunEventBus;
  private runListeners = new Map<string, Set<RunEventListener>>();

  public static getInstance(): RunEventBus {
    if (!RunEventBus.instance) {
      RunEventBus.instance = new RunEventBus();
    }
    return RunEventBus.instance;
  }

  public subscribe(runId: string, listener: RunEventListener): () => void {
    let set = this.runListeners.get(runId);
    if (!set) {
      set = new Set();
      this.runListeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.runListeners.delete(runId);
      }
    };
  }

  public publish(runId: string, event: RunEnvelopeEvent | Record<string, unknown>): void {
    const set = this.runListeners.get(runId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {}
    }
  }

  public clear(): void {
    this.runListeners.clear();
  }
}

export const runEventBus = RunEventBus.getInstance();
