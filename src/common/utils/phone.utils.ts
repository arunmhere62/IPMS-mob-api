/**
 * Phone number utility functions
 */

/**
 * Normalize phone number format by removing spaces
 * Converts "+91 8248449609" to "+918248449609"
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  return phone.replace(/\s+/g, '');
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
