import type { MetadataRoute } from 'next';

// Disallows every top-level path under app/(app)/ (signed-in consoles) and
// app/(auth)/ (sign-in flows) - both route groups are invisible in the URL,
// so the list below is the group's real top-level directories. No sitemap
// route exists in this app yet, so the `sitemap` field is omitted rather
// than pointing at a 404 (REM-027).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // app/(app)/ - signed-in consoles
        '/attendance',
        '/classmates',
        '/dashboard',
        '/help',
        '/homework',
        '/lessons',
        '/manage',
        '/marks',
        '/materials',
        '/notifications',
        '/profile',
        '/quizzes',
        '/timetable',
        // app/(auth)/ - sign-in flows
        '/accept-invitation',
        '/forgot-password',
        '/google',
        '/login',
        '/register',
        '/reset-password',
      ],
    },
  };
}
