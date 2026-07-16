/* =============================================================================
 * Automation boundary — n8n (approved Decision H: integrate via secure
 * authenticated webhooks; business logic stays in the app, orchestration in n8n).
 *
 * The app TRIGGERS workflows and RECEIVES status callbacks. n8n never owns app
 * state: callbacks map onto the `automation` machine through the guarded service
 * layer, and every callback signature is verified before it is trusted.
 * ========================================================================== */

export interface TriggerWorkflowInput {
  /** Workflow webhook path registered in n8n. */
  workflow: string;
  payload: Record<string, unknown>;
  /** Correlates the run back to an Automation row. */
  automationId: string;
}

export interface TriggerResult {
  ok: boolean;
  runRef: string;
}

export interface AutomationProvider {
  readonly name: string;
  trigger(input: TriggerWorkflowInput): Promise<TriggerResult>;
  /** Callbacks are authenticated — unverified payloads must be rejected. */
  verifyCallbackSignature(rawBody: string, signature: string, secret: string): boolean;
}

export class MockAutomationProvider implements AutomationProvider {
  readonly name = "mock";
  readonly triggered: TriggerWorkflowInput[] = [];
  private counter = 0;

  async trigger(input: TriggerWorkflowInput): Promise<TriggerResult> {
    this.counter += 1;
    this.triggered.push(input);
    return { ok: true, runRef: `run_mock_${this.counter}` };
  }

  verifyCallbackSignature(_rawBody: string, signature: string): boolean {
    return signature === "mock-valid-signature";
  }

  clear(): void {
    this.triggered.length = 0;
  }
}
