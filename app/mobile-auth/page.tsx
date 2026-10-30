"use client";

import { useEffect, useState } from "react";

type BridgeState =
  | { status: "opening"; appUrl: string }
  | { status: "error"; message: string };

function createSafeAppUrl(): BridgeState {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("return_to");
  if (!returnTo) return { status: "error", message: "The mobile callback is missing." };

  try {
    const target = new URL(returnTo);
    if (target.protocol !== "exp:" && target.protocol !== "thedrift:") {
      return { status: "error", message: "The mobile callback is not allowed." };
    }

    // The implicit Auth flow returns the session in the fragment. Fragments
    // are never sent to Vercel; this client-only page passes it to the app.
    target.hash = window.location.hash;
    return { status: "opening", appUrl: target.toString() };
  } catch {
    return { status: "error", message: "The mobile callback is invalid." };
  }
}

export default function MobileAuthBridge() {
  const [state, setState] = useState<BridgeState>({
    status: "error",
    message: "Preparing the mobile sign-in…",
  });

  useEffect(() => {
    const next = createSafeAppUrl();
    const renderTimeout = window.setTimeout(() => setState(next), 0);
    if (next.status !== "opening") {
      return () => window.clearTimeout(renderTimeout);
    }

    const redirectTimeout = window.setTimeout(() => window.location.replace(next.appUrl), 150);
    return () => {
      window.clearTimeout(renderTimeout);
      window.clearTimeout(redirectTimeout);
    };
  }, []);

  return (
    <main className="mobile-auth-page">
      <section className="mobile-auth-card">
        <div className="mobile-auth-mark">D</div>
        <p className="mobile-auth-eyebrow">The Drift</p>
        {state.status === "opening" ? (
          <>
            <h1>Opening the app…</h1>
            <p>If it does not open automatically, use the button below.</p>
            <a className="mobile-auth-button" href={state.appUrl}>Open The Drift</a>
          </>
        ) : (
          <>
            <h1>We could not finish signing in.</h1>
            <p>{state.message}</p>
          </>
        )}
      </section>
    </main>
  );
}
