export function recoveryServer(options?: {
  port?: number;
  phase?: () => number;
}): Promise<{ origin: string; close: () => Promise<void> }>;
