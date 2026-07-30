import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { Layers } from "lucide-react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { authService } from "@/services/authService";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    // Goes into user metadata, which the profile trigger copies into
    // profiles.full_name — the name a shared collection shows.
    const { error } = await authService.signUp(email, password, displayName);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <>
        <Navigation />
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-3 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-3">
                  <Layers className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl font-heading">Check Your Email</CardTitle>
              <CardDescription>
                We've sent you a confirmation email. Please check your inbox and click the link to verify your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.push("/")} className="w-full">
                Return Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-background to-secondary/20 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-3 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-3">
                <Layers className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-heading">Create Account</CardTitle>
            <CardDescription>
              Start managing your Grand Archive collection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="How others see you"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Shown to anyone you share your collection with. You can change
                  it later on your profile.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <GoogleSignInButton label="Sign up with Google" onError={setError} />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account..." : "Sign Up"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
