# IPMS Mobile App - Backend API Documentation

NestJS backend API for IPMS mobile application.

---

## 📋 Quick Navigation

### 🚀 Getting Started
- [API Documentation](./docs/README.md) - Complete API reference
- [Jenkins CI/CD](./JENKINS.md) - Pipeline configuration

### 📚 API Modules & Endpoints

#### Authentication & Users
- [Auth JWT Flow](./AUTH_JWT_FLOW.md) - JWT token management
- [PG Owner Registration](./docs/01-pg-owner-registration.md) - Owner signup and login
- Tenant authentication
- Role-based access control

#### Property Management
- [PG Locations](./docs/02-pg-locations.md) - Multi-location management
- [Rooms Management](./docs/03-rooms.md) - Room CRUD operations
- [Beds Management](./docs/04-beds.md) - Bed allocation and tracking

#### Tenant Management
- [Tenant Registration](./docs/05-tenant-registration.md) - Tenant onboarding
- Tenant profile management
- Tenant status tracking
- Tenant documents

#### Financial Management
- [Rent Cycles](./docs/06-rent-cycles.md) - Rent collection logic
- [Rent Cycle Edge Cases](./docs/07-rent-cycle-date-edge-cases.md) - Complex scenarios
- [Payment Integration](./README_PAYMENT_INTEGRATION.md) - CCAvenue payment gateway
- Receipt generation
- Advance rent handling

#### Additional Features
- [Support Ticketing](./PRODUCT_SUPPORT_TICKETING_FLOW.md) - Ticket system
- [Task Management](./Task_Management_README.md) - Task management
- Expense tracking
- Electricity bill management
- Employee management
- Notifications (Push, SMS, WhatsApp)
- Analytics and reporting

---

## 🔧 Development Setup

### Prerequisites
- Node.js 16+
- npm or yarn
- PostgreSQL 12+
- Docker (optional)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd IPMS-mob/IPMS-mob-api

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

### Environment Configuration

Create `.env` file:
```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ipms_db

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=7d

# Server
NODE_ENV=development
PORT=3001
API_BASE_URL=http://localhost:3001

# Payment Gateway (CCAvenue)
CCAVENUE_MERCHANT_ID=your-merchant-id
CCAVENUE_ACCESS_CODE=your-access-code
CCAVENUE_WORKING_KEY=your-working-key

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=ap-south-1

# Firebase (Notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# SMS & WhatsApp
SMS_API_KEY=your-sms-api-key
WHATSAPP_API_KEY=your-whatsapp-api-key

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 📁 Project Structure

```
IPMS-mob-api/
├── src/
│   ├── modules/
│   │   ├── auth/                # Authentication & JWT
│   │   ├── users/               # User management
│   │   ├── pg-locations/        # PG location management
│   │   ├── rooms/               # Room management
│   │   ├── beds/                # Bed management
│   │   ├── tenants/             # Tenant management
│   │   ├── subscription/        # Subscription & payments
│   │   ├── rent-cycles/         # Rent collection logic
│   │   ├── tickets/             # Support ticketing
│   │   ├── expenses/            # Expense tracking
│   │   ├── electricity-bills/   # Electricity management
│   │   ├── employees/           # Employee management
│   │   ├── notifications/       # Push, SMS, WhatsApp
│   │   ├── analytics/           # Analytics & reporting
│   │   └── common/              # Shared utilities
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   ├── config/                  # Configuration files
│   ├── common/
│   │   ├── decorators/          # Custom decorators
│   │   ├── filters/             # Exception filters
│   │   ├── guards/              # Auth guards
│   │   ├── interceptors/        # Request/response interceptors
│   │   └── utils/               # Utility functions
│   ├── main.ts                  # Application entry point
│   └── app.module.ts            # Root module
├── docs/                        # API documentation
├── test/                        # Test files
├── docker-compose.yml           # Docker configuration
├── Dockerfile                   # Docker image
├── package.json                 # Dependencies
└── README.md                    # This file
```

---

## 🚀 Running the Application

### Development
```bash
npm run start:dev
```
Server runs on `http://localhost:3001`

### Production
```bash
npm run build
npm run start:prod
```

### Testing
```bash
# Unit tests
npm run test

# Integration tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## 🗄️ Database Management

### Migrations
```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

### Database Seeding
```bash
npx prisma db seed
```

### Database Studio
```bash
npx prisma studio
```

---

## 🔐 Authentication

### JWT Flow
1. User sends phone + OTP
2. Backend verifies OTP
3. Backend generates JWT tokens (access + refresh)
4. Frontend stores tokens in AsyncStorage
5. Frontend includes access token in Authorization header
6. Backend validates token on protected routes

### Token Refresh
- Access token expires in 24 hours
- Refresh token expires in 7 days
- Frontend automatically refreshes on 401 response

---

## 💳 Payment Integration

### CCAvenue Integration
- Merchant ID: `4422142`
- Encryption: AES-128-CBC
- Key: MD5(working_key)
- IV: Fixed 16-byte IV

### Payment Flow
1. Frontend requests payment URL
2. Backend generates encrypted payment data
3. Frontend opens WebView with CCAvenue URL
4. User completes payment
5. CCAvenue redirects to callback URL
6. Backend verifies payment signature
7. Backend updates subscription status

---

## 📲 Notifications

### Firebase Cloud Messaging (FCM)
- Push notifications to mobile devices
- Topic-based messaging
- Device token management

### SMS & WhatsApp
- SMS for payment confirmations
- WhatsApp for notifications
- Scheduled messages

---

## 📊 API Response Format

All endpoints return standardized response:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

Error response:
```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE"
}
```

---

## 🔍 Logging & Monitoring

### Logging
- Winston logger for structured logging
- Log levels: error, warn, info, debug
- Logs stored in `logs/` directory

### Monitoring
- Sentry for error tracking
- Health check endpoint: `GET /health`
- Metrics endpoint: `GET /metrics`

---

## 🐳 Docker Deployment

### Build Image
```bash
docker build -t ipms-api:latest .
```

### Run Container
```bash
docker run -p 3001:3001 \
  --env-file .env \
  -v postgres_data:/var/lib/postgresql/data \
  ipms-api:latest
```

### Docker Compose
```bash
docker-compose up -d
```

---

## 🔄 CI/CD Pipeline

### Jenkins Configuration
See [JENKINS.md](./JENKINS.md) for:
- Automated builds
- Test execution
- Code quality checks
- Deployment to staging/production

### GitHub Actions
- Automated testing on PR
- Build on merge to main
- Deploy to production

---

## 📈 Performance Optimization

### Database
- Indexed queries for fast lookups
- Connection pooling
- Query optimization

### Caching
- Redis for session management
- Response caching for frequently accessed data

### Rate Limiting
- API rate limiting per user
- DDoS protection

---

## 🐛 Common Issues

### Database Connection
```bash
# Check PostgreSQL is running
psql -U user -d ipms_db -c "SELECT 1"

# Reset migrations
npx prisma migrate reset
```

### JWT Errors
- Verify JWT_SECRET in .env
- Check token expiry
- Verify Authorization header format

### Payment Issues
- Verify CCAvenue credentials
- Check encryption key
- Review webhook logs

---

## 📞 Support

- Check [API Documentation](./docs/README.md)
- Review [Current Fix Status](../CURRENT_FIX_STATUS.md)
- Check error logs in console

---

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test
3. Run linter: `npm run lint`
4. Commit: `git commit -m "Add feature"`
5. Push: `git push origin feature/your-feature`
6. Create pull request

---

**Last Updated:** August 2026  
**Version:** 1.0.0  
**API Version:** v1
