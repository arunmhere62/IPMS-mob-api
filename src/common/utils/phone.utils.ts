/**
 * Phone number utility functions
 */

/**
 * Normalize phone number format for database lookup.
 * Converts "+91 8248449609" → "+918248449609"
 * Converts "9003939213" → "+919003939213"
 * Converts "919003939213" → "+919003939213"
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;

  // Remove all non-digit and non-leading-plus characters
  let normalized = phone.replace(/\s+/g, '');

  // If it starts with '00', replace with '+'
  if (normalized.startsWith('00')) {
    normalized = '+' + normalized.slice(2);
  }

  // If already in E.164 format with +, just clean it
  if (normalized.startsWith('+')) {
    return normalized;
  }

  // If it's a 10-digit local number, assume India (+91)
  if (/^\d{10}$/.test(normalized)) {
    return '+91' + normalized;
  }

  // If it already starts with 91 + 10 more digits (12 digits total), add + prefix
  if (/^91\d{10}$/.test(normalized)) {
    return '+' + normalized;
  }

  return normalized;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  // Basic validation - should start with + and contain digits
  return /^\+[\d\s]+$/.test(phone);
}

/**
 * Format phone number for display (add space after country code)
 * Converts "+918248449609" to "+91 8248449609"
 */
export function formatPhoneNumberForDisplay(phone: string): string {
  if (!phone) return phone;
  
  // If already has spaces, return as-is
  if (phone.includes(' ')) return phone;
  
  // Add space after country code (assuming first 2-3 digits are country code)
  const match = phone.match(/^(\+\d{2,3})(\d+)$/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  
  return phone;
}
