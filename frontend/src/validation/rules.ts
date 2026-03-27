/**
 * rules.ts
 *
 * Core validation rules for the LuminaryTrade framework.
 * Implements regex and logic for various data types.
 */

/**
 * RFC 5322 compliant email regex (simplified but robust)
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * E.164 format (international phone numbers)
 * Format: +[country code][number], total 15 digits max
 */
export const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Stellar public key format
 * Starts with 'G', 56 characters, uppercase alphanumeric
 */
export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * URL regex with protocol and domain validation
 */
export const URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;

export const validateEmail = (email: string): boolean => EMAIL_REGEX.test(email);

export const validatePhone = (phone: string): boolean => PHONE_REGEX.test(phone);

export const validateStellarAddress = (address: string): boolean => STELLAR_ADDRESS_REGEX.test(address);

export const validateUrl = (url: string): boolean => URL_REGEX.test(url);

export const validateAmount = (amount: string | number, maxDecimals = 7): boolean => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num <= 0) return false;
  
  const parts = num.toString().split('.');
  if (parts.length > 1 && parts[1].length > maxDecimals) return false;
  
  return true;
};

export interface PasswordStrength {
  score: number; // 0 to 4
  feedback: string[];
}

export const checkPasswordStrength = (password: string): PasswordStrength => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 12) score++;
  else feedback.push("Minimum 12 characters required");

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else feedback.push("Include both uppercase and lowercase letters");

  if (/\d/.test(password)) score++;
  else feedback.push("Include at least one number");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push("Include at least one special character");

  return { score, feedback };
};
