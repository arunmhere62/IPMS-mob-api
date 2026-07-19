const crypto = require('crypto');

// Same credentials as in subscription.service.ts
const MERCHANT_ID = '4422142';
const ACCESS_CODE = 'AVAE94NG00AB68EABA';
const WORKING_KEY = 'B2779D53659D72AD12DD229F49FE01B4';
const PAYMENT_URL = 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

// Encrypt (matches our implementation)
function encrypt(plainText) {
  const key = crypto.createHash('md5').update(WORKING_KEY).digest();
  const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encoded = cipher.update(plainText, 'utf8', 'hex');
  encoded += cipher.final('hex');
  return encoded;
}

// Decrypt (matches our implementation)
function decrypt(encText) {
  const key = crypto.createHash('md5').update(WORKING_KEY).digest();
  const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decoded = decipher.update(encText, 'hex', 'utf8');
  decoded += decipher.final('utf8');
  return decoded;
}

// Build payment data (same as subscription.service.ts)
const paymentData = {
  merchant_id: MERCHANT_ID,
  order_id: 'TEST_' + Date.now(),
  amount: '1.00',
  currency: 'INR',
  redirect_url: 'https://mobapi.indianpgmanagement.com/api/v1/subscription/payment/callback',
  cancel_url: 'https://mobapi.indianpgmanagement.com/api/v1/subscription/payment/cancel',
  language: 'EN',
  billing_name: 'Test User',
  billing_email: 'test@example.com',
  billing_tel: '9999999999',
  billing_address: 'Not Provided',
  billing_city: 'Not Provided',
  billing_state: 'Not Provided',
  billing_zip: '000000',
  billing_country: 'India',
  merchant_param1: '1',
  merchant_param2: '1',
  merchant_param3: '1',
  merchant_param4: '1',
};

// Build query string (no encodeURIComponent - matches demo)
const queryString = Object.entries(paymentData)
  .map(([key, value]) => `${key}=${value}`)
  .join('&');

console.log('=== CCAvenue Encryption Test ===\n');
console.log('1. Plain text query string:');
console.log(queryString);
console.log('\n2. Key derivation:');
const key = crypto.createHash('md5').update(WORKING_KEY).digest();
console.log('   MD5 hash length:', key.length, 'bytes (should be 16 for AES-128)');
console.log('   Algorithm: aes-128-cbc');

// Encrypt
const encrypted = encrypt(queryString);
console.log('\n3. Encrypted data:');
console.log('   Length:', encrypted.length);
console.log('   First 100 chars:', encrypted.substring(0, 100));

// Decrypt to verify roundtrip
const decrypted = decrypt(encrypted);
console.log('\n4. Decrypted (roundtrip verify):');
console.log('   Matches original:', decrypted === queryString);

// Generate payment URL
const paymentUrl = `${PAYMENT_URL}&encRequest=${encrypted}&access_code=${ACCESS_CODE}`;
console.log('\n5. Payment URL:');
console.log(paymentUrl);
console.log('\n=== Open this URL in your browser to test with CCAvenue ===');
