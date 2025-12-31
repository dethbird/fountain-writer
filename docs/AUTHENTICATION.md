# Authentication Flow

## Overview

The app uses Google OIDC (OpenID Connect) for authentication with an HttpOnly session cookie approach. Users must be authenticated to access the editor.

## Flow

1. **User visits the app** → Frontend checks `/api/me`
2. **Not authenticated** → Show `<Login>` component with Google login button
3. **User clicks "Continue with Google"** → Redirect to `/auth/google`
4. **Backend redirects to Google** → User authenticates with Google
5. **Google redirects back** → `/auth/google/callback` processes the response
6. **Backend creates/updates user** → Upserts records in `users` and `user_identities` tables
7. **Backend sets session cookie** → HttpOnly, Secure, SameSite=Lax
8. **Backend redirects to app** → User returns to `/`
9. **Frontend checks auth again** → `/api/me` returns user data
10. **Authenticated** → Show main app with logout button

## Session Management

- **Session cookie name**: `fountain_session` (configurable via `APP_SESSION_NAME`)
- **Session lifetime**: 2 hours with auto-refresh
- **Cookie attributes**: HttpOnly, Secure, SameSite=Lax
- **Storage**: PHP native sessions (file-based by default)

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/me` | GET | Get current user info or `{authenticated: false}` |
| `/auth/google` | GET | Initiate Google OAuth flow |
| `/auth/google/callback` | GET | Handle OAuth callback, set session |
| `/auth/logout` | POST | Clear session cookie |

## Frontend Components

- **App.jsx**: Main app with auth check on mount
  - Checks `/api/me` on load
  - Shows loading state while checking
  - Renders `<Login>` if not authenticated
  - Renders main app with logout button if authenticated

- **Login.jsx**: Login screen
  - Displays app title and description
  - Single button: "Continue with Google"
  - Redirects to `/auth/google` on click

## User Data Structure

### Database Tables

**users**
- `id` - Primary key
- `email` - User's email
- `email_norm` - Normalized (lowercase) email for lookups (unique)
- `name` - Display name from Google
- `picture` - Profile picture URL from Google
- `created_at`, `updated_at` - Timestamps

**user_identities**
- `id` - Primary key
- `user_id` - Foreign key to users table
- `issuer` - OIDC issuer URL (e.g., `https://accounts.google.com`)
- `subject` - OIDC `sub` claim (unique ID from provider)
- `email` - Email from this identity
- `email_verified` - Whether email is verified by provider
- `created_at`, `updated_at` - Timestamps
- Unique constraint on `(issuer, subject)`

### Session Data

Session contains:
- `user_id` - Database user ID
- `email` - User's email
- `name` - User's display name
- `picture` - Profile picture URL

## Security Notes

- Frontend never sees OAuth tokens - backend handles everything
- Session cookie is HttpOnly (not accessible via JavaScript)
- Session cookie is Secure (HTTPS only)
- SameSite=Lax prevents CSRF while allowing OAuth redirects
- User identity is keyed by `(issuer, subject)` pair - email is for account linking only
- Google client secret should never be exposed to frontend

## Environment Variables

Required for authentication:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-domain/auth/google/callback
GOOGLE_ISSUER=https://accounts.google.com
APP_SESSION_NAME=fountain_session
APP_BASE_URL=https://your-domain
```

## Logout Flow

1. User clicks logout button in toolbar
2. Frontend calls `POST /auth/logout` with credentials
3. Backend destroys session
4. Frontend clears user state and redirects to `/`
5. App shows login screen again

## Error Handling

- If `/api/me` fails, app assumes not authenticated and shows login
- If OAuth callback fails, redirects to `/?auth_error=1`
- If logout fails, shows alert to user
- All errors are logged to browser console for debugging
