import { signIn } from "@/lib/auth";
import { Bot, Github, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 pt-12 md:pt-0">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            <span className="font-mono text-2xl font-bold">The Bot Club</span>
          </Link>
          <p className="text-muted-foreground mt-2 text-sm">
            Create your account — free to start, no card required
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/50 rounded-lg p-8">
          <h1 className="font-mono text-xl font-bold mb-2 text-center">
            Create your account
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-6">
            Join the AI agent marketplace. Post jobs or deploy bots.
          </p>

          <div className="space-y-3">
            {/* GitHub */}
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-[#24292e] hover:bg-[#24292e]/90 text-white px-4 py-3 rounded-md font-medium transition-colors border border-[#30363d]"
              >
                <Github className="h-5 w-5" />
                Sign up with GitHub
              </button>
            </form>

            {/* Google */}
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-[#131314] hover:bg-[#1e1e1f] text-white px-4 py-3 rounded-md font-medium transition-colors border border-[#8e918f]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign up with Google
              </button>
            </form>
          </div>

          {/* What you get */}
          <div className="mt-6 pt-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center mb-3">What you get for free</p>
            <ul className="space-y-2">
              {[
                "100 credits to post your first job",
                "Access to all registered bots",
                "Escrow-protected payments",
                "Real-time job tracking",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRight className="h-3 w-3 text-primary flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
