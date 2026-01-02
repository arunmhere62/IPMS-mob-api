# Send-OTP 500 Error - Quick Fixes

## 1. Check Environment Variables
Create/verify `.env` file in the API root:

```env
# Database
DATABASE_URL="mysql://username:password@localhost:3306/database_name"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"

# App
NODE_ENV="development"
PORT=3000

# SMS (optional for development)
SMS_API_URL="http://cannyinfotech.in/api/mt/SendSMS"
SMS_USER="SATZTECHNOSOLUTIONS"
SMS_PASSWORD="demo1234"
SMS_SENDER_ID="SATZTH"
```

## 2. Database Connection Fix
```bash
# Test database connection
npx prisma db pull

# If connection fails, check:
# - Database server is running
# - Credentials are correct
# - Network connectivity
```

## 3. Regenerate Prisma Client
```bash
# Regenerate Prisma client
npx prisma generate

# Run migrations if needed
npx prisma db push
```

## 4. Restart Server with Logs
```bash
# Stop current server (Ctrl+C)
# Start with detailed logging
npm run start:dev

# Watch for error messages when making the request
```

## 5. Test with Curl
```bash
curl -X POST http://localhost:3000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"918248449609"}'
```

## 6. Check Server Status
```bash
# Verify server is running
curl http://localhost:3000/api/v1/

# Should return API info or 404, not connection error
```

## 7. Common Error Patterns

### Database Connection Error
```
Error: P1001: Can't reach database server at `localhost`:`3306`
```
**Fix**: Check DATABASE_URL and database server

### Missing JWT Secret
```
Error: JWT secret is required
```
**Fix**: Add JWT_SECRET to .env file

### Prisma Client Not Generated
```
Error: Prisma Client is not generated
```
**Fix**: Run `npx prisma generate`

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3000
```
**Fix**: Kill process on port 3000 or use different port

## 8. Development Mode Bypass
In development, the OTP system should work even if SMS fails:
- Uses DevelopmentOtpStrategy
- Bypass OTP: `1234`
- Should not cause 500 errors

## 9. Check Logs Location
Look for detailed error messages in:
- Console output when running `npm run start:dev`
- Application logs (if configured)
- Database logs

## 10. Last Resort - Clean Install
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Regenerate Prisma
npx prisma generate
```
