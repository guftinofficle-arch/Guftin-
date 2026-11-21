# Guftin email OTP signup configuration

The Android app now uses Supabase Auth `signUp` followed by `verifyOtp({ email, token, type: "signup" })`.
Keep email confirmation enabled. Do not disable it.

## Required hosted Supabase settings

Project: `oyjemlbsmffvofefgxvd`

1. Open Supabase Dashboard → Authentication → Email Templates → Confirm signup.
2. Set the subject to: `Your Guftin verification code`
3. Replace the confirmation-link template with the HTML below. It must contain `{{ .Token }}`, not `{{ .ConfirmationURL }}`.
4. Open Authentication → Sign In / Providers → Email and keep Confirm email enabled.
5. Ensure the email OTP length is 6 digits.
6. Configure a working SMTP provider under Authentication → SMTP Settings for dependable delivery to real inboxes; test with an address you control.

## Confirm signup email template

```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#102b27">
  <h2 style="color:#087f6b">Verify your Guftin email</h2>
  <p>Enter this one-time code in the Guftin app to verify your email address.</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;background:#f1f7f5;border-radius:12px;text-align:center">{{ .Token }}</div>
  <p>This code is for your Guftin account only. Do not share it with anyone.</p>
  <p>If you did not try to create a Guftin account, you can ignore this email.</p>
</div>
```

## Important

Changing app code alone cannot change the hosted Supabase email template or SMTP delivery settings. After the dashboard settings are saved, test a new signup and confirm the 6-digit email arrives. The app does not create an authenticated session until Supabase accepts the OTP.

The app also handles an email address that already has an unconfirmed signup by requesting a fresh signup OTP instead of silently failing. If a prior pending signup exists, the user should verify using the password chosen for that original signup.

## Password reset OTP template

In Supabase Dashboard → Authentication → Email Templates → Reset password, set the subject to `Your Guftin password reset code` and use a template containing `{{ .Token }}` (not `{{ .ConfirmationURL }}`):

```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#102b27">
  <h2 style="color:#087f6b">Reset your Guftin password</h2>
  <p>Enter this one-time code in the Guftin app to reset your password.</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;background:#f1f7f5;border-radius:12px;text-align:center">{{ .Token }}</div>
  <p>This code is for your Guftin account only. Do not share it with anyone.</p>
</div>
```

Keep email OTP enabled and configure SMTP for reliable delivery. The app requests a recovery code, verifies it with `verifyOtp({ type: "recovery" })`, then saves the new password using the verified recovery session.
