# CCAvenue Payment Gateway Setup

## Error: "10002 Working is empty"

This error occurs when CCAvenue credentials are not properly configured in your `.env` file.

## Setup Instructions

### 1. Get CCAvenue Credentials

You need to obtain the following from CCAvenue:
- **Merchant ID** - Your unique merchant identifier
- **Access Code** - Access code for your account
- **Working Key** - Encryption key for secure transactions

**How to get these:**
1. Login to your CCAvenue merchant account at https://merchant.ccavenue.com/
2. Go to **Settings** → **Generate Working Key**
3. Copy the **Merchant ID**, **Access Code**, and **Working Key**

### 2. Configure Environment Variables

Create or update your `.env` file in the `api` folder:

```env
# CCAvenue Payment Gateway Configuration
CCAVENUE_MERCHANT_ID=your_merchant_id_here
CCAVENUE_ACCESS_CODE=your_access_code_here
CCAVENUE_WORKING_KEY=your_working_key_here
CCAVENUE_PAYMENT_URL=https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction
CCAVENUE_REDIRECT_URL=http://your-api-url/api/subscription/payment/callback
CCAVENUE_CANCEL_URL=http://your-api-url/api/subscription/payment/cancel
```

### 3. Test vs Production URLs

**Test Environment:**
```
CCAVENUE_PAYMENT_URL=https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction
```

**Production Environment:**
```
CCAVENUE_PAYMENT_URL=https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction
```

### 4. Configure Redirect URLs in CCAvenue Dashboard

1. Login to CCAvenue merchant dashboard
2. Go to **Settings** → **Response/Redirect URL**
3. Set your callback URLs:
   - **Redirect URL**: `https://your-api-domain.com/api/subscription/payment/callback`
   - **Cancel URL**: `https://your-api-domain.com/api/subscription/payment/cancel`

### 5. Restart Your Server

After updating the `.env` file:
```bash
cd api
npm run start:dev
```

## Testing

### Test Cards (CCAvenue Test Mode)

**Credit Card:**
- Card Number: `5123456789012346`
- CVV: `123`
- Expiry: Any future date
- Name: Any name

**Debit Card:**
- Card Number: `4012001037141112`
- CVV: `123`
- Expiry: Any future date

### Test UPI:
- UPI ID: `success@payu`

## Troubleshooting

### Error: "Working is empty"
- Check if `CCAVENUE_WORKING_KEY` is set in `.env`
- Ensure there are no extra spaces or quotes
- Verify the working key is correct from CCAvenue dashboard

### Error: "Invalid Access Code"
- Verify `CCAVENUE_ACCESS_CODE` matches your CCAvenue account
- Check for typos or extra characters

### Error: "Merchant ID not found"
- Confirm `CCAVENUE_MERCHANT_ID` is correct
- Ensure you're using the right environment (test/production)

## Security Notes

⚠️ **Important:**
- Never commit `.env` file to git
- Keep your Working Key secret
- Use different keys for test and production
- Rotate keys periodically for security

## Support

For CCAvenue specific issues:
- Email: service@ccavenue.com
- Phone: +91-22-4000 4646
- Documentation: https://www.ccavenue.com/developers.jsp
