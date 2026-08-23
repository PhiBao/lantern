import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lantern — private crowdfunding on Starknet",
  description:
    "Everyone sees the goal. No one sees the givers. Public totals, cryptographically private donors.",
  openGraph: {
    title: "Lantern — private crowdfunding on Starknet",
    description: "Everyone sees the goal. No one sees the givers.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-amber-500 focus:px-4 focus:py-2 focus:font-medium focus:text-stone-950"
        >
          Skip to content
        </a>

        <header className="border-b border-stone-200 dark:border-stone-800">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
            <Link
              href="/"
              className="group flex items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600"
            >
              <LanternMark />
              <span className="text-lg font-semibold tracking-tight">
                Lantern
              </span>
            </Link>
            <Link
              href="/new"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            >
              Start a campaign
            </Link>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="mt-20 border-t border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-3xl px-5 py-8 text-sm text-stone-500 dark:text-stone-500">
            <p>
              Unaudited software on Starknet mainnet. Amounts are public; donor
              identities are not.
            </p>
            <p className="mt-2">
              <a
                href="/security"
                className="underline decoration-stone-300 underline-offset-4 hover:text-stone-800 dark:decoration-stone-700 dark:hover:text-stone-300"
              >
                Privacy &amp; security
              </a>
              <span className="mx-2 text-stone-300 dark:text-stone-700">·</span>
              <a
                href="https://github.com/PhiBao/lantern"
                className="underline decoration-stone-300 underline-offset-4 hover:text-stone-800 dark:decoration-stone-700 dark:hover:text-stone-300"
                target="_blank"
                rel="noreferrer noopener"
              >
                Source
              </a>
              <span className="mx-2 text-stone-300 dark:text-stone-700">·</span>
              <a
                href="https://github.com/starkience/strk20-hackathon"
                className="underline decoration-stone-300 underline-offset-4 hover:text-stone-800 dark:decoration-stone-700 dark:hover:text-stone-300"
                target="_blank"
                rel="noreferrer noopener"
              >
                Built on STRK20
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

function LanternMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="text-amber-500"
    >
      <path
        d="M12 2v2M8 6h8l1 10H7L8 6zM10 20h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.5" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
