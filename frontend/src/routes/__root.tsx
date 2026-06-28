import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../context/AuthContext";
import { setIdTokenProvider } from "../lib/api";
import { useAuthContext } from "../context/AuthContext";
import { validateRouteAccess, logAccessAttempt } from "../lib/route-guards";
import { useLocation } from "@tanstack/react-router";
import { checkFirebaseConfig } from "../lib/firebase-debug";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NexTrust — Work Done. Trust Verified. Payment Protected." },
      { name: "description", content: "AI-verified jobs. Blockchain-secured escrow payments. NexTrust connects customers with verified local workers — zero disputes, instant payouts." },
      { name: "author", content: "NexTrust" },
      { property: "og:title", content: "NexTrust — Trusted Work, Protected Payments" },
      { property: "og:description", content: "AI-verified jobs. Blockchain-secured escrow. Instant, dispute-free payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <AuthProvider>
      <RootComponentInner queryClient={queryClient} />
    </AuthProvider>
  );
}

function RootComponentInner({ queryClient }: { queryClient: QueryClient }) {
  const auth = useAuthContext();
  const router = useRouter();
  const location = useLocation();

  useEffect(() => {
    // Check Firebase configuration on app load
    if (import.meta.env.DEV) {
      checkFirebaseConfig();
    }
  }, []);

  useEffect(() => {
    // Set up the ID token provider for API client
    setIdTokenProvider(async () => {
      return auth.getIdToken();
    });
  }, [auth]);

  useEffect(() => {
    // Route guard: wait for auth state to be established
    if (auth.loading) return;

    const pathname = location.pathname;
    const validation = validateRouteAccess(pathname, auth.user, auth.profile?.role);
    
    logAccessAttempt(pathname, auth.user, auth.profile?.role, validation.allowed);

    if (!validation.allowed && validation.redirectTo) {
      console.log(`[v0] Redirecting to ${validation.redirectTo} due to route guard`);
      router.navigate({ to: validation.redirectTo });
    }
  }, [location.pathname, auth.user, auth.profile?.role, auth.loading, router]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
