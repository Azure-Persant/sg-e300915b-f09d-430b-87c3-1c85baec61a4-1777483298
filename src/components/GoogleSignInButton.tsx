import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** "Sign in" or "Sign up" — the flow is identical either way. */
  label?: string;
  onError: (message: string) => void;
};

/**
 * Google's mark, inline.
 *
 * A remote image would be blocked by the Content-Security-Policy and Google's
 * brand guidelines require the four-colour G rather than a generic icon.
 */
function GoogleMark() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ label = "Continue with Google", onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    // Deliberately imported here rather than at module scope: the auth service
    // pulls in the Supabase client, and this button is rendered on pages that
    // otherwise do not need it.
    const { authService } = await import("@/services/authService");
    const { error } = await authService.signInWithGoogle();

    if (error) {
      // The redirect never happens on failure, so the spinner has to stop.
      setLoading(false);
      onError(
        error.message.toLowerCase().includes("provider")
          ? "Google sign-in is not enabled for this site yet."
          : error.message
      );
    }
    // On success the browser leaves for Google, so no state to reset.
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      className="w-full"
    >
      <GoogleMark />
      {loading ? "Redirecting..." : label}
    </Button>
  );
}
