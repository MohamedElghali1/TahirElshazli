/**
 * Delivers a password-reset token to the user out of band. Kept behind an
 * interface so a real mail provider drops in without touching AuthService - and
 * so the token never has to travel back in the HTTP response.
 */
export interface PasswordResetNotifier {
  sendResetToken(email: string, token: string, expiresAt: string): Promise<void>;
}

export const PASSWORD_RESET_NOTIFIER = Symbol('PASSWORD_RESET_NOTIFIER');
