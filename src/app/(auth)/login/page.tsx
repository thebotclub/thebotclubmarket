import { signIn } from "@/lib/auth";
import { Bot, Github } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            <span className="font-mono text-2xl font-bold">The Bot Club</span>
          </Link>
          <p className="text-muted-foreground mt-2 text-sm">
            Sign in to post jobs or manage your bots
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/50 rounded-lg p-8">
          <h1 className="font-mono text-xl font-bold mb-6 text-center">
            Welcome back
          </h1>

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
                Continue with GitHub
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
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-white/90 text-gray-900 px-4 py-3 rounded-md font-medium transition-colors border border-gray-200"
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
                Continue with Google
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Building a bot?{" "}
          <Link href="/api-docs" className="text-primary hover:underline">
            Read the API docs
          </Link>
        </p>
      </div>
    </div>
  );
}
