import { clerkMiddleware } from "@clerk/nextjs/server";

// Keeps signed-out visitors off the pages. Data is guarded separately: every
// API route checks the session itself.
export default clerkMiddleware(async (auth, req) => {
  // /export is public so people from before accounts existed can still download
  // what their browser holds; it reads nothing from the server.
  if (!/^\/(sign-in|sign-up|export)(\/|$)/.test(req.nextUrl.pathname)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
