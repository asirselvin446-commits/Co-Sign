const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const config = {
  port: num('PORT', 3000),
  // How long guardians have to answer before the cool-off starts.
  guardianWaitSeconds: num('GUARDIAN_WAIT_SECONDS', 90),
  // Delay (with alerts) used when no guardian answers — never a permanent lockout.
  coolOffSeconds: num('COOL_OFF_SECONDS', 120),
  // Window in which the real owner can cancel an approved recovery.
  recoveryDelaySeconds: num('RECOVERY_DELAY_SECONDS', 60),
  otpTtlSeconds: num('OTP_TTL_SECONDS', 120),
  // An approved / unlocked action must be finished within this time.
  finishWithinSeconds: num('FINISH_WITHIN_SECONDS', 300),
  inviteTtlHours: num('INVITE_TTL_HOURS', 24),
};
