import { clerkMiddleware } from "@clerk/nextjs/server";

// Keeps signed-out visitors off the pages. Data is guarded separately: every
// API route checks the session itself.
export default clerkMiddleware(async (auth, req) => {
  if (!req.nextUrl.pathname.startsWith("/sign-in")) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
