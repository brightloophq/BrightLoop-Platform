"use client";

import { useActionState } from "react";
import { Alert, Button, FormSection, Input, Textarea } from "@brightloop/ui";
import { MAX_PAGES_DEFAULT, MAX_PAGES_MAX, MAX_PAGES_MIN, REASONING_MODES } from "@/lib/prospect-form";
import type { ScannerActionResult } from "../scanner-actions";
import styles from "../scanner.module.css";

const EMPTY: ScannerActionResult = { ok: false };

export interface ProspectScanFormProps {
  organizations: { id: string; name: string }[];
  crawlerEnabled: boolean;
  providerEnabled: boolean;
  estimatedMaxCostUsd: number | null;
  action: (prev: ScannerActionResult, formData: FormData) => Promise<ScannerActionResult>;
}

/**
 * The prospect scan request form (§2).
 *
 * Validation is the pure `parseProspectScanForm` on the server — including the
 * Phase-A URL + SSRF rules — so the form can never accept a target the crawler
 * would refuse to fetch. `useActionState` supplies the pending state, and the
 * submit button is disabled while a submission is in flight, so one click
 * creates at most one scan.
 */
export function ProspectScanForm({ organizations, crawlerEnabled, providerEnabled, estimatedMaxCostUsd, action }: ProspectScanFormProps) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className={styles.workspace} noValidate>
      {state.error ? (
        <Alert tone="danger" title="Couldn't create the scan">
          {state.error}
        </Alert>
      ) : null}

      {!crawlerEnabled ? (
        <Alert tone="warning" title="The crawler is currently disabled">
          You can still create the scan — it will queue safely, and the discovery stages will report a stable <code>crawler_disabled</code> block until
          the switch is on. Nothing is fetched and nothing is fabricated.
        </Alert>
      ) : null}

      <FormSection title="Prospect" description="Who you're scanning. Only the website URL is required.">
        <div className={styles.formGrid}>
          <div className={styles.selectField}>
            <label className={styles.selectLabel} htmlFor="clientId">
              Organization
            </label>
            <select id="clientId" name="clientId" className={styles.select} defaultValue={organizations[0]?.id ?? ""} required>
              {organizations.length === 0 ? <option value="">No organizations available</option> : null}
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {errors["clientId"] ? <span className={styles.fieldError}>{errors["clientId"]}</span> : null}
          </div>

          <Input
            label="Business website URL"
            name="websiteUrl"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            required
            hint="Public site only. http/https, no credentials, no private or local address."
            {...(errors["websiteUrl"] ? { error: errors["websiteUrl"] } : {})}
          />
          <Input label="Business name" name="businessName" optional maxLength={160} {...(errors["businessName"] ? { error: errors["businessName"] } : {})} />
          <Input label="Contact name" name="contactName" optional maxLength={120} {...(errors["contactName"] ? { error: errors["contactName"] } : {})} />
          <Input label="Email" name="email" type="email" optional maxLength={200} {...(errors["email"] ? { error: errors["email"] } : {})} />
          <Input label="Industry" name="industry" optional maxLength={120} {...(errors["industry"] ? { error: errors["industry"] } : {})} />
          <Input label="Location" name="location" optional maxLength={160} {...(errors["location"] ? { error: errors["location"] } : {})} />
          <div className={styles.formWide}>
            <Textarea
              label="Internal notes"
              name="notes"
              optional
              rows={3}
              maxLength={2000}
              hint="Operator context. Plain text only — angle brackets aren't allowed."
              {...(errors["notes"] ? { error: errors["notes"] } : {})}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Scan envelope" description="Bounds for this scan. Defaults are deliberately conservative.">
        <div className={styles.formGrid}>
          <Input
            label="Crawl page limit"
            name="maxPages"
            type="number"
            min={MAX_PAGES_MIN}
            max={MAX_PAGES_MAX}
            defaultValue={MAX_PAGES_DEFAULT}
            hint={`Between ${MAX_PAGES_MIN} and ${MAX_PAGES_MAX} pages.`}
            {...(errors["maxPages"] ? { error: errors["maxPages"] } : {})}
          />
          <div className={styles.selectField}>
            <label className={styles.selectLabel} htmlFor="reasoningMode">
              Reasoning mode
            </label>
            <select id="reasoningMode" name="reasoningMode" className={styles.select} defaultValue="standard">
              {REASONING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {errors["reasoningMode"] ? <span className={styles.fieldError}>{errors["reasoningMode"]}</span> : null}
          </div>
        </div>
      </FormSection>

      <FormSection title="Authorization" description="Both acknowledgements are required before a scan is created.">
        <label className={styles.checkRow}>
          <input type="checkbox" name="scanAuthorized" value="yes" />
          <span className={styles.checkText}>
            I'm authorized to scan this public website.
            <span className={styles.checkHint}>
              Auxion fetches only public pages, respects robots.txt, and never attempts an authenticated or private crawl.
            </span>
            {errors["scanAuthorized"] ? <span className={styles.fieldError}>{errors["scanAuthorized"]}</span> : null}
          </span>
        </label>

        <label className={styles.checkRow}>
          <input type="checkbox" name="costAcknowledged" value="yes" />
          <span className={styles.checkText}>
            I understand a reasoning turn may spend API credit.
            <span className={styles.checkHint}>
              {providerEnabled
                ? `Reasoning is live. One turn costs at most ${estimatedMaxCostUsd === null ? "an unknown amount" : `about $${estimatedMaxCostUsd.toFixed(2)}`}, and only runs when you explicitly confirm it.`
                : "Reasoning is currently disabled, so no credit can be spent until it is switched on."}
            </span>
            {errors["costAcknowledged"] ? <span className={styles.fieldError}>{errors["costAcknowledged"]}</span> : null}
          </span>
        </label>
      </FormSection>

      <div className={styles.formActions}>
        <Button type="submit" variant="primary" disabled={pending || organizations.length === 0} loading={pending}>
          {pending ? "Creating scan…" : "Create prospect scan"}
        </Button>
        <span className={styles.checkHint}>Creating a scan queues the first stage. Nothing executes until you run it.</span>
      </div>
    </form>
  );
}
