// Hands back the session named by VERIFY_SESSION, so a script can exercise
// code behind requireAdmin(). Verification only; there is no such env var in
// the app, and nothing outside scripts/ imports this.
export const cookies = async () => ({
  get: (name) =>
    name === "aussiemed_session" && process.env.VERIFY_SESSION
      ? { name, value: process.env.VERIFY_SESSION }
      : undefined,
  set: () => {},
});
export const headers = async () => new Map();
