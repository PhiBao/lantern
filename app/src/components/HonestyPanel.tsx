"use client";

import { useState } from "react";

/**
 * The honesty panel.
 *
 * Most privacy products say "private!" and stop. Lantern states exactly what a
 * donation does and does not reveal, in plain language, before the user signs.
 * A privacy tool that hides its own limitations is the one users should trust
 * least — so this is a product feature, not a disclaimer.
 *
 * Content mirrors SECURITY.md and the STRK20 docs' own hidden-vs-visible split.
 */
export function HonestyPanel({
  freshlyShielded = false,
}: {
  freshlyShielded?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="honesty-details"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-stone-700 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:text-stone-300 dark:hover:text-stone-100"
      >
        <span>What this reveals</span>
        <span
          aria-hidden="true"
          className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id="honesty-details"
          className="border-t border-stone-200 px-4 py-3 text-sm dark:border-stone-800"
        >
          <dl className="space-y-3">
            <div>
              <dt className="font-medium text-emerald-700 dark:text-emerald-400">
                Hidden
              </dt>
              <dd className="mt-1 text-stone-600 dark:text-stone-400">
                Your wallet address. Nothing on-chain links you to this campaign.
                The pool moves the money, so observers see the pool paying
                Lantern — not you.
              </dd>
            </div>

            <div>
              <dt className="font-medium text-amber-700 dark:text-amber-500">
                Visible
              </dt>
              <dd className="mt-1 text-stone-600 dark:text-stone-400">
                The <strong>amount</strong> of this donation, and the time it
                happened. Amounts stay public so the total can be verified by
                anyone — that is what makes the campaign trustworthy. They are
                just not attached to a name.
              </dd>
            </div>

            <div>
              <dt className="font-medium text-stone-700 dark:text-stone-300">
                Worth knowing
              </dt>
              <dd className="mt-1 text-stone-600 dark:text-stone-400">
                An unusual amount is easier to single out. A round number blends
                in better.
              </dd>
            </div>
          </dl>

          {freshlyShielded && (
            <p
              role="status"
              className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <strong className="font-medium">Timing note.</strong> You shielded
              funds moments ago. Depositing and giving back-to-back can let an
              observer connect the two. Waiting a while — hours, ideally — makes
              that link much weaker.
            </p>
          )}

          <p className="mt-3 text-xs text-stone-500 dark:text-stone-500">
            Lantern is unaudited hackathon software.{" "}
            <a
              href="/security"
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-stone-400 underline-offset-2 hover:text-stone-700 dark:decoration-stone-600 dark:hover:text-stone-300"
            >
              Read the full privacy and security notes
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
