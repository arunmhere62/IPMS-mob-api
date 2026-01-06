# 🚀 VPS Deployment Guide - Hostinger KVM-2

Complete step-by-step guide to deploy your NestJS API backend on Hostinger VPS.

## 📋 VPS Details

- **Server Location**: Malaysia - Kuala Lumpur
- **OS**: Ubuntu 24.04 LTS
- **Hostname**: srv1250950.hstgr.cloud
- **IP Address**: 72.62.194.189
- **SSH Username**: root
- **CPU**: 2 cores
- **Memory**: 8 GB
- **Disk**: 100 GB
- **Plan**: KVM 2
- **Expiration**: 2026-02-06

---

## 🎯 Deployment Steps

### Step 1: Connect to Your VPS

```bash
ssh root@72.62.194.189
```

When prompted, enter your root password (provided by Hostinger via email).

**First-time connection**: You'll see a fingerprint confirmation. Type `yes` to continue.

---

### Step 2: Secure Your VPS (Recommended)

```bash
# Update system
apt update && apt upgrade -y

# Create a new sudo user (replace 'yourusername' with your desired username)
adduser yourusername
usermod -aG sudo yourusername

# Setup SSH key authentication (optional but recommended)
# On your local machine, generate SSH key if you don't have one:
# ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy your public key to the server
# ssh-copy-id yourusername@72.62.194.189
```

---

### Step 3: Upload Your Application Files

**Option A: Using SCP (from your local machine)**

```bash
# Navigate to your project directory on local machine
cd d:\pg-mobile-app\IPMS-mob\IPMS-mob-api

# Upload files to VPS
scp -r ./* root@72.62.194.189:/var/www/pg-api/
```

**Option B: Using Git (recommended)**

```bash
# On VPS
mkdir -p /var/www/pg-api
cd /var/www/pg-api

# Clone your repository
git clone <your-git-repository-url> .

# Or if you want to use a specific branch
git clone -b main <your-git-repository-url> .
```

**Option C: Using SFTP Client**
- Use FileZilla, WinSCP, or Cyberduck
- Host: 72.62.194.189
- Username: root
- Port: 22
- Upload to: `/var/www/pg-api/`

---

### Step 4: Configure Environment Variables

```bash
cd /var/www/pg-api

# Copy environment example
cp .env.example .env

# Edit environment file
nano .env
```

**Important Environment Variables to Update:**

```env
# Database Configuration
DATABASE_URL="mysql://username:password@host:3306/database"

# Server Configuration
PORT=5000
NODE_ENV=production

# JWT Secrets (CHANGE THESE!)
JWT_SECRET=your-production-secret-key-here
JWT_REFRESH_SECRET=your-production-refresh-secret-here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=indianpgmanagement

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com

# Payment Gateway
CCAVENUE_MERCHANT_ID=your-merchant-id
CCAVENUE_ACCESS_CODE=your-access-code
CCAVENUE_WORKING_KEY=your-working-key
CCAVENUE_REDIRECT_URL=https://api.yourdomain.com/api/v1/subscription/payment/callback
CCAVENUE_CANCEL_URL=https://api.yourdomain.com/api/v1/subscription/payment/cancel

# Expo Push Notifications
EXPO_ACCESS_TOKEN=your-expo-token
```

Save and exit (Ctrl+X, then Y, then Enter)

---

### Step 5: Run Deployment Script

```bash
# Make the script executable
chmod +x deploy-vps.sh

# Run the deployment script
./deploy-vps.sh
```

This script will:
- ✅ Install Node.js 20.x LTS
- ✅ Install PM2 process manager
- ✅ Install and configure Nginx
- ✅ Setup firewall rules
- ✅ Install dependencies
- ✅ Generate Prisma client
- ✅ Run database migrations
- ✅ Build the application
- ✅ Start the app with PM2
- ✅ Configure PM2 to start on boot

---

### Step 6: Configure Nginx Reverse Proxy

```bash
# Copy nginx configuration
sudo cp nginx-config.conf /etc/nginx/sites-available/pg-api

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/pg-api /etc/nginx/sites-enabled/

# Remove default nginx site
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

### Step 7: Setup Domain (Optional but Recommended)

**A. Configure DNS Records:**

Go to your domain registrar and add these DNS records:

```
Type: A
Name: api (or @)
Value: 72.62.194.189
TTL: 3600
```

**B. Update Nginx Configuration:**

```bash
sudo nano /etc/nginx/sites-available/pg-api
```

Replace `api.yourdomain.com` with your actual domain.

**C. Setup SSL Certificate (Let's Encrypt):**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal is configured automatically
# Test renewal:
sudo certbot renew --dry-run
```

**D. Enable HTTPS in Nginx:**

Edit `/etc/nginx/sites-available/pg-api` and uncomment the HTTPS server block.

```bash
sudo nano /etc/nginx/sites-available/pg-api
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 8: Verify Deployment

**Check Application Status:**

```bash
pm2 status
pm2 logs pg-api
```

**Test API Endpoints:**

```bash
# Test locally on VPS
curl http://localhost:5000/health

# Test via public IP
curl http://72.62.194.189/health

# Test via domain (if configured)
curl http://api.yourdomain.com/health
```

**Check Nginx Status:**

```bash
sudo systemctl status nginx
```

---

## 🔧 Useful Commands

### PM2 Commands

```bash
pm2 status              # Check application status
pm2 logs pg-api         # View logs
pm2 logs pg-api --lines 100  # View last 100 lines
pm2 restart pg-api      # Restart application
pm2 stop pg-api         # Stop application
pm2 start pg-api        # Start application
pm2 delete pg-api       # Delete from PM2
pm2 monit               # Monitor CPU/Memory usage
pm2 save                # Save current process list
```

### Nginx Commands

```bash
sudo systemctl status nginx    # Check status
sudo systemctl start nginx     # Start nginx
sudo systemctl stop nginx      # Stop nginx
sudo systemctl restart nginx   # Restart nginx
sudo systemctl reload nginx    # Reload config
sudo nginx -t                  # Test configuration
```

### Database Commands

```bash
cd /var/www/pg-api
npx prisma migrate deploy      # Run migrations
npx prisma studio              # Open Prisma Studio (localhost:5555)
npx prisma generate            # Regenerate Prisma client
```

### System Monitoring

```bash
htop                    # Interactive process viewer
df -h                   # Disk usage
free -h                 # Memory usage
netstat -tulpn          # Check open ports
journalctl -u nginx -f  # Nginx logs
```

---

## 🔄 Updating Your Application

When you need to deploy updates:

```bash
# Navigate to app directory
cd /var/www/pg-api

# Pull latest changes (if using Git)
git pull origin main

# Install new dependencies (if any)
npm install --legacy-peer-deps

# Run migrations (if any)
npx prisma migrate deploy

# Rebuild application
npm run build

# Restart with PM2
pm2 restart pg-api

# Check logs
pm2 logs pg-api
```

---

## 🛡️ Security Best Practices

1. **Change Default SSH Port** (Optional):
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Change Port 22 to something else (e.g., 2222)
   sudo systemctl restart sshd
   ```

2. **Disable Root Login** (After creating sudo user):
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   sudo systemctl restart sshd
   ```

3. **Setup Fail2Ban**:
   ```bash
   sudo apt install fail2ban -y
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

4. **Regular Updates**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

5. **Backup Database Regularly**:
   ```bash
   # Create backup script
   nano /root/backup-db.sh
   ```

---

## 🐛 Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs pg-api --lines 50

# Check if port is in use
sudo lsof -i :5000

# Restart application
pm2 restart pg-api
```

### Nginx 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart both services
pm2 restart pg-api
sudo systemctl restart nginx
```

### Database Connection Issues

```bash
# Test database connection
cd /var/www/pg-api
npx prisma db pull

# Check .env file
cat .env | grep DATABASE_URL
```

### Out of Memory

```bash
# Check memory usage
free -h

# Restart PM2 with memory limit
pm2 restart pg-api --max-memory-restart 500M
```

---

## 📊 Monitoring & Logs

### Application Logs

```bash
# Real-time logs
pm2 logs pg-api

# Error logs only
pm2 logs pg-api --err

# Output logs only
pm2 logs pg-api --out

# Log files location
ls -la /var/www/pg-api/logs/
```

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### System Logs

```bash
# System journal
journalctl -xe

# Nginx service logs
journalctl -u nginx -f
```

---

## 🎯 Performance Optimization

### PM2 Cluster Mode

Already configured in `ecosystem.config.js` to use all CPU cores.

### Nginx Caching

Add to nginx config for static assets:

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Database Connection Pooling

Already configured in `DATABASE_URL` with `connection_limit=5`

---

## 📞 Support

- **Hostinger Support**: https://www.hostinger.com/support
- **VPS IP**: 72.62.194.189
- **Hostname**: srv1250950.hstgr.cloud

---

## ✅ Deployment Checklist

- [ ] Connected to VPS via SSH
- [ ] Uploaded application files
- [ ] Configured `.env` file with production values
- [ ] Ran deployment script successfully
- [ ] Configured Nginx reverse proxy
- [ ] Application accessible via IP address
- [ ] (Optional) Configured domain DNS
- [ ] (Optional) Setup SSL certificate
- [ ] Verified all API endpoints working
- [ ] Setup monitoring and alerts
- [ ] Configured automated backups
- [ ] Documented any custom configurations

---

**🎉 Your NestJS API is now deployed and running on Hostinger VPS!**

Access your API at:
- **HTTP**: http://72.62.194.189
- **With Domain**: http://api.yourdomain.com (after DNS setup)
- **HTTPS**: https://api.yourdomain.com (after SSL setup)
