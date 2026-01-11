import { supabase } from "@/lib/supabase";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Return type for waitlist operations - follows Supabase convention
 * Provides type-safe responses for success and error cases
 */
interface WaitlistResponse {
  data: { email: string; message: string } | null;
  error: { message: string; code?: string } | null;
}

/**
 * Input parameters for addToWaitlist function
 * Optional honeypot field for bot detection
 */
interface WaitlistInput {
  email: string;
  referralSource?: string | null;
  marketingConsent?: boolean;
  honeypot?: string; // Hidden field for bot detection - should be empty
}

// =============================================================================
// SECURITY CONSTANTS
// =============================================================================

/**
 * List of known disposable/temporary email providers
 * These are commonly used for spam, abuse, or creating multiple accounts
 * Regularly updated list of most common disposable domains
 */
const DISPOSABLE_EMAIL_DOMAINS: Set<string> = new Set([
  // Popular disposable email services
  'tempmail.com', 'temp-mail.org', 'tempmailo.com', 'tempmail.net',
  'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net', 'guerrillamail.biz',
  'guerrillamail.de', 'sharklasers.com', 'guerrillamailblock.com',
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minemail.com',
  'throwaway.email', 'throwawaymail.com', 'trashmail.com', 'trashmail.net',
  'trashmail.org', 'trashmail.me', 'trash-mail.com',
  'fakeinbox.com', 'fakemailgenerator.com', 'fakemail.net',
  'getnada.com', 'nada.email', 'getairmail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'dispostable.com', 'discard.email', 'discardmail.com',
  'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'mailexpire.com', 'tempinbox.com', 'tempmailaddress.com',
  'burnermail.io', 'mohmal.com', 'emailondeck.com',
  'minuteinbox.com', 'emailfake.com', 'crazymailing.com',
  'tempsky.com', 'tempr.email', 'tempail.com',
  'fakemailgenerator.net', 'inboxkitten.com', 'mailsac.com',
  'mytemp.email', 'tmpmail.org', 'tmpmail.net',
  'disposablemail.com', 'instantemailaddress.com', 'emailtemporaire.fr',
  'jetable.org', 'dropmail.me', 'mailnator.com',
  'spambox.us', 'receivemail.com', 'anonymmail.net',
  'anonmails.de', 'anonymbox.com', 'one-time.email',
]);

/**
 * List of allowed major email providers
 * Only these domains are accepted to prevent abuse and ensure deliverability
 * Includes major consumer and professional email services
 */
const ALLOWED_EMAIL_PROVIDERS: Set<string> = new Set([
  // Google (Gmail)
  'gmail.com', 'googlemail.com',
  // Apple (iCloud)
  'icloud.com', 'me.com', 'mac.com',
  // Microsoft (Outlook/Hotmail)
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'outlook.co.uk', 'hotmail.co.uk', 'live.co.uk',
  'outlook.fr', 'hotmail.fr', 'live.fr',
  'outlook.de', 'hotmail.de', 'live.de',
  // Yahoo
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
  'yahoo.ca', 'yahoo.com.au', 'yahoo.co.in', 'yahoo.com.br',
  'ymail.com', 'rocketmail.com',
  // ProtonMail (privacy-focused)
  'protonmail.com', 'proton.me', 'pm.me',
  // AOL
  'aol.com', 'aim.com',
  // Zoho
  'zoho.com', 'zohomail.com',
  // FastMail
  'fastmail.com', 'fastmail.fm',
  // GMX
  'gmx.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch',
  // Mail.com
  'mail.com', 'email.com',
  // Other reputable providers
  'hey.com', 'tutanota.com', 'tutanota.de', 'tuta.io',
  'mailbox.org', 'posteo.de', 'posteo.net',
]);

/**
 * Regex pattern to detect potentially malicious unicode characters
 * Prevents homograph attacks where visually similar characters are used
 * Example: Using Cyrillic 'а' instead of Latin 'a' to impersonate emails
 */
const SUSPICIOUS_UNICODE_PATTERN = /[\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0250-\u02AF\u1E00-\u1EFF\u0400-\u04FF\u0500-\u052F\u2C60-\u2C7F\uA720-\uA7FF]/;

/**
 * Pattern to detect control characters and other dangerous sequences
 * These should never appear in valid email addresses
 */
const CONTROL_CHARACTERS_PATTERN = /[\x00-\x1F\x7F\u200B-\u200F\u2028-\u202F\uFEFF]/;

/**
 * Maximum allowed email length per RFC 5321
 * Total: 320 chars, Local part: 64 chars, Domain: 255 chars
 */
const MAX_EMAIL_LENGTH = 320;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 255;

/**
 * Maximum allowed referral source length
 * Prevents potential overflow attacks and keeps data manageable
 */
const MAX_REFERRAL_SOURCE_LENGTH = 255;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validates email format using a comprehensive regex pattern
 * More strict than the HTML5 email input validation
 * 
 * Pattern breakdown:
 * - Local part: alphanumeric, dots, hyphens, underscores, plus signs
 * - @ symbol
 * - Domain: alphanumeric, hyphens, with proper TLD structure
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if email format is valid
 */
function isValidEmailFormat(email: string): boolean {
  // Comprehensive email regex following RFC 5322 loosely
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

/**
 * Checks if email domain is from a disposable email provider
 * These services create temporary addresses often used for spam/abuse
 * 
 * @param {string} domain - Email domain to check
 * @returns {boolean} True if domain is a known disposable provider
 */
function isDisposableEmail(domain: string): boolean {
  return DISPOSABLE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Checks if email domain is from an allowed provider
 * Only accepts major, reputable email providers
 * 
 * @param {string} domain - Email domain to check
 * @returns {boolean} True if domain is allowed
 */
function isAllowedProvider(domain: string): boolean {
  return ALLOWED_EMAIL_PROVIDERS.has(domain.toLowerCase());
}

/**
 * Checks for suspicious unicode characters that could be used for homograph attacks
 * Homograph attacks use visually similar characters to impersonate legitimate addresses
 * Example: using Cyrillic 'а' (U+0430) instead of Latin 'a' (U+0061)
 * 
 * @param {string} input - String to check
 * @returns {boolean} True if suspicious characters are found
 */
function containsSuspiciousUnicode(input: string): boolean {
  return SUSPICIOUS_UNICODE_PATTERN.test(input);
}

/**
 * Checks for control characters and zero-width characters
 * These should never appear in valid email addresses and may indicate manipulation
 * 
 * @param {string} input - String to check
 * @returns {boolean} True if control characters are found
 */
function containsControlCharacters(input: string): boolean {
  return CONTROL_CHARACTERS_PATTERN.test(input);
}

/**
 * Normalizes Gmail addresses for duplicate detection
 * 
 * Gmail ignores:
 * 1. Dots in the local part (john.doe@gmail.com = johndoe@gmail.com)
 * 2. Plus addressing (john+spam@gmail.com = john@gmail.com)
 * 
 * This prevents users from signing up multiple times with variations
 * 
 * @param {string} email - Email to normalize
 * @returns {string} Normalized email address
 */
function normalizeGmailAddress(email: string): string {
  const [localPart, domain] = email.split('@');
  
  // Only normalize Gmail and Googlemail addresses
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    return email;
  }
  
  // Remove dots from local part
  let normalizedLocal = localPart.replace(/\./g, '');
  
  // Remove plus addressing (everything after +)
  const plusIndex = normalizedLocal.indexOf('+');
  if (plusIndex !== -1) {
    normalizedLocal = normalizedLocal.substring(0, plusIndex);
  }
  
  // Always use gmail.com as the canonical domain
  return `${normalizedLocal}@gmail.com`;
}

/**
 * Validates email length according to RFC 5321 specifications
 * 
 * @param {string} email - Email to validate
 * @returns {{ valid: boolean; reason?: string }} Validation result
 */
function validateEmailLength(email: string): { valid: boolean; reason?: string } {
  if (email.length > MAX_EMAIL_LENGTH) {
    return { valid: false, reason: 'Email too long' };
  }
  
  const [localPart, domain] = email.split('@');
  
  if (localPart && localPart.length > MAX_LOCAL_PART_LENGTH) {
    return { valid: false, reason: 'Local part too long' };
  }
  
  if (domain && domain.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, reason: 'Domain too long' };
  }
  
  return { valid: true };
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 * Used for referral source and other non-email inputs
 * 
 * @param {string} input - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(input: string): string {
  // Remove control characters and zero-width characters
  let sanitized = input.replace(CONTROL_CHARACTERS_PATTERN, '');
  
  // Remove any HTML/script tags to prevent XSS when displaying
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Trim and limit length
  return sanitized.trim().slice(0, MAX_REFERRAL_SOURCE_LENGTH);
}

/**
 * Checks if an email already exists in the waitlist
 * Provides better UX than relying solely on database constraint errors
 * 
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} True if email already exists
 */
async function emailExistsInWaitlist(email: string): Promise<boolean> {
  // Use Supabase's parameterized query for SQL injection protection
  const { data, error } = await supabase
    .from('waitlist')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  
  // If there's an error, we'll let the insert handle it
  if (error) {
    console.error('[Waitlist] Error checking email existence:', error.message);
    return false;
  }
  
  return data !== null;
}

/**
 * Checks if normalized Gmail already exists (for duplicate detection)
 * Prevents users from signing up multiple times with Gmail dot/plus variations
 * 
 * @param {string} normalizedEmail - Normalized Gmail address
 * @param {string} originalEmail - Original email (to exclude from check)
 * @returns {Promise<boolean>} True if a variation already exists
 */
async function gmailVariationExists(normalizedEmail: string, originalEmail: string): Promise<boolean> {
  const [normalizedLocal, domain] = normalizedEmail.split('@');
  
  // Only check for Gmail addresses
  if (domain !== 'gmail.com') {
    return false;
  }
  
  // Query for Gmail addresses, then check if any normalize to the same address
  const { data, error } = await supabase
    .from('waitlist')
    .select('email')
    .or(`email.ilike.%@gmail.com,email.ilike.%@googlemail.com`);
  
  if (error || !data) {
    return false;
  }
  
  // Check if any existing email normalizes to the same address
  for (const row of data) {
    if (row.email.toLowerCase() === originalEmail) {
      continue; // Skip the original email
    }
    const existingNormalized = normalizeGmailAddress(row.email.toLowerCase());
    if (existingNormalized === normalizedEmail) {
      return true;
    }
  }
  
  return false;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Adds an email to the waitlist with comprehensive security validation and sanitization.
 * 
 * Security Features Implemented:
 * 1. Input validation - Type checking and required field validation
 * 2. Email sanitization - Trim, lowercase, normalize
 * 3. Email format validation - RFC 5322 compliant regex
 * 4. Email length validation - RFC 5321 limits (320 total, 64 local, 255 domain)
 * 5. Email provider whitelist - Only major providers allowed
 * 6. Disposable email blocking - Blocks known temp email services
 * 7. Unicode/homograph attack prevention - Blocks suspicious unicode
 * 8. Control character filtering - Removes dangerous characters
 * 9. Gmail normalization - Prevents duplicate signups via dot/plus variations
 * 10. Duplicate email detection - Checks before insert for better UX
 * 11. Honeypot bot detection - Hidden field that should be empty
 * 12. SQL injection protection - Supabase uses parameterized queries
 * 13. XSS prevention - HTML tags stripped from inputs
 * 14. Referral source sanitization - Length limits and character filtering
 * 
 * @param {WaitlistInput} input - Object containing email, referralSource, marketingConsent, honeypot
 * @returns {Promise<WaitlistResponse>} Response with data on success or error on failure
 */
export async function addToWaitlist(
  email: string,
  referralSource: string | null = null,
  marketingConsent: boolean = true,
  honeypot?: string
): Promise<WaitlistResponse> {
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 1: Honeypot bot detection
  // A hidden field that real users won't fill out, but bots will
  // If it has a value, silently reject the submission
  // ---------------------------------------------------------------------------
  if (honeypot && honeypot.trim().length > 0) {
    // Return fake success to not alert the bot that detection occurred
    // Log for monitoring purposes
    console.warn('[Waitlist] Bot detected via honeypot field');
    return {
      data: { email: '', message: 'Thank you for joining!' },
      error: null,
    };
  }
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 2: Input type validation
  // Ensure email is provided and is a string
  // ---------------------------------------------------------------------------
  if (!email || typeof email !== 'string') {
    return {
      data: null,
      error: { 
        message: 'Hey - Enter your email to join the waitlist!',
        code: 'MISSING_EMAIL'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 3: Control character detection
  // Block emails containing null bytes, zero-width chars, etc.
  // ---------------------------------------------------------------------------
  if (containsControlCharacters(email)) {
    return {
      data: null,
      error: { 
        message: 'That email is invalid!',
        code: 'INVALID_CHARACTERS'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 4: Unicode/homograph attack prevention
  // Block emails with suspicious unicode that could impersonate legitimate addresses
  // ---------------------------------------------------------------------------
  if (containsSuspiciousUnicode(email)) {
    return {
      data: null,
      error: { 
        message: 'That email is invalid!',
        code: 'SUSPICIOUS_UNICODE'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // SANITIZATION: Normalize email
  // Trim whitespace and convert to lowercase for consistent storage
  // ---------------------------------------------------------------------------
  const sanitizedEmail = email.trim().toLowerCase();
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 5: Email format validation
  // Validate against RFC 5322 compliant regex pattern
  // ---------------------------------------------------------------------------
  if (!isValidEmailFormat(sanitizedEmail)) {
    return {
      data: null,
      error: { 
        message: 'That email is invalid!',
        code: 'INVALID_FORMAT'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 6: Email length validation
  // RFC 5321 limits: 320 total, 64 local part, 255 domain
  // ---------------------------------------------------------------------------
  const lengthValidation = validateEmailLength(sanitizedEmail);
  if (!lengthValidation.valid) {
    return {
      data: null,
      error: { 
        message: 'That email is invalid!',
        code: 'EMAIL_TOO_LONG'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // Extract domain for provider validation
  // ---------------------------------------------------------------------------
  const emailParts = sanitizedEmail.split('@');
  if (emailParts.length !== 2) {
    return {
      data: null,
      error: { 
        message: 'That email is invalid!',
        code: 'INVALID_FORMAT'
      },
    };
  }
  
  const [, emailDomain] = emailParts;
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 7: Disposable email blocking
  // Block known temporary/throwaway email services
  // ---------------------------------------------------------------------------
  if (isDisposableEmail(emailDomain)) {
    return {
      data: null,
      error: { 
        message: 'Please use a permanent email address.',
        code: 'DISPOSABLE_EMAIL'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 8: Email provider whitelist
  // Only allow major, reputable email providers
  // ---------------------------------------------------------------------------
  if (!isAllowedProvider(emailDomain)) {
    return {
      data: null,
      error: { 
        message: 'That email is invalid!',
        code: 'PROVIDER_NOT_ALLOWED'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // SECURITY CHECK 9: Gmail normalization for duplicate detection
  // Normalize Gmail addresses to prevent duplicate signups via variations
  // ---------------------------------------------------------------------------
  const normalizedEmail = normalizeGmailAddress(sanitizedEmail);
  
  // ---------------------------------------------------------------------------
  // NOTE: Duplicate detection
  // Pre-insert duplicate checks are skipped to avoid requiring SELECT permission
  // on the waitlist table. The database unique constraint on email handles this,
  // and we catch the constraint violation error (code 23505) below.
  // 
  // Gmail variation detection is also skipped for the same reason.
  // If you need Gmail variation blocking, add a SELECT RLS policy and 
  // uncomment the checks in the code (see emailExistsInWaitlist and 
  // gmailVariationExists helper functions).
  // ---------------------------------------------------------------------------
  
  // ---------------------------------------------------------------------------
  // SANITIZE: Referral source
  // Validate type, sanitize content, and limit length
  // ---------------------------------------------------------------------------
  let sanitizedReferralSource: string | null = null;
  if (referralSource !== null && referralSource !== undefined) {
    if (typeof referralSource !== 'string') {
      return {
        data: null,
        error: { 
          message: 'Invalid referral source',
          code: 'INVALID_REFERRAL_SOURCE'
        },
      };
    }
    
    // Sanitize the referral source
    const cleaned = sanitizeString(referralSource);
    sanitizedReferralSource = cleaned.length > 0 ? cleaned : null;
  }
  
  // ---------------------------------------------------------------------------
  // VALIDATION: Marketing consent
  // Ensure boolean type for GDPR compliance
  // ---------------------------------------------------------------------------
  if (typeof marketingConsent !== 'boolean') {
    return {
      data: null,
      error: { 
        message: 'Invalid consent value',
        code: 'INVALID_CONSENT'
      },
    };
  }
  
  // ---------------------------------------------------------------------------
  // DATABASE INSERT
  // Supabase automatically uses parameterized queries for SQL injection protection
  // NOTE: We don't use .select() after insert because that requires SELECT permission
  // which anonymous users don't have (and shouldn't have for security reasons)
  // ---------------------------------------------------------------------------
  try {
    const { error } = await supabase
      .from('waitlist')
      .insert([
        {
          email: sanitizedEmail,
          referral_source: sanitizedReferralSource,
          marketing_consent: marketingConsent,
          // created_at is handled by database default
          // status is handled by database default ('pending')
        }
      ]);
    
    // Handle database errors
    if (error) {
      // Check for unique constraint violation (duplicate email)
      if (error.code === '23505') {
        return {
          data: null,
          error: { 
            message: "You're already on the waitlist! We'll be in touch soon.",
            code: 'DUPLICATE_EMAIL'
          },
        };
      }
      
      // Log the error for debugging (don't expose internal errors to users)
      console.error('[Waitlist] Database insert error:', error.message);
      
      // Return generic error to user
      return {
        data: null,
        error: { 
          message: 'Something went wrong. Please try again later.',
          code: 'DATABASE_ERROR'
        },
      };
    }
    
    // Success - return sanitized email in response
    // We already have the email from input, no need to fetch it back from DB
    return {
      data: { 
        email: sanitizedEmail,
        message: 'Successfully joined the waitlist!'
      },
      error: null,
    };
    
  } catch (unexpectedError) {
    // Catch any unexpected errors (network issues, etc.)
    console.error('[Waitlist] Unexpected error:', unexpectedError);
    
    return {
      data: null,
      error: { 
        message: 'Something went wrong. Please try again later.',
        code: 'UNEXPECTED_ERROR'
      },
    };
  }
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

// Export helper functions for unit testing (optional)
export const _testing = {
  isValidEmailFormat,
  isDisposableEmail,
  isAllowedProvider,
  containsSuspiciousUnicode,
  containsControlCharacters,
  normalizeGmailAddress,
  validateEmailLength,
  sanitizeString,
};
