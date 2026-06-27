import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env';
import User from '../models/User';

/**
 * Configures Passport.js with the Google OAuth 2.0 strategy.
 *
 * On successful Google login:
 * - If the user already has a googleId linked, logs them in directly.
 * - If a user with the same email exists (signed up via email), links the Google account.
 * - Otherwise, creates a new user from the Google profile (auto-verified).
 *
 * Passes { userId, role } to the done callback for token generation downstream.
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id, isDeleted: false });

        if (!user) {
          // Check if user exists with same email (signed up via email/password)
          const existingUser = await User.findOne({
            email: profile.emails?.[0]?.value,
            isDeleted: false,
          });

          if (existingUser) {
            // Link Google account to existing email user
            existingUser.googleId = profile.id;
            await existingUser.save();
            return done(null, { userId: existingUser._id.toString(), role: 'user' });
          }

          // Create new user from Google profile
          user = await User.create({
            name: profile.displayName,
            email: profile.emails?.[0]?.value,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value,
            isVerified: true,
          });
        }

        return done(null, { userId: user._id.toString(), role: 'user' });
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

export default passport;
