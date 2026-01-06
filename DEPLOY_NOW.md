# 🚀 Deploy Your API Right Now - Step by Step

## ⚡ What You Need
- Your VPS root password (check Hostinger email)
- 10-15 minutes

---

## 📋 Copy-Paste Commands (Do This Now!)

### 1️⃣ Open PowerShell/Terminal on Your Computer

Press `Win + X` and select "Windows PowerShell" or "Terminal"

### 2️⃣ Connect to Your VPS

```powershell
ssh root@72.62.194.189
```

Enter your root password when prompted.

---

### 3️⃣ Once Connected, Run These Commands One by One

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2
npm install -g pm2

# Install Nginx
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# Setup firewall
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5000/tcp

# Create app directory
mkdir -p /var/www/pg-api
cd /var/www/pg-api
```

---

### 4️⃣ Upload Your Files

**Open a NEW PowerShell window** (keep the SSH session open), then run:

```powershell
cd d:\pg-mobile-app\IPMS-mob\IPMS-mob-api
scp -r * root@72.62.194.189:/var/www/pg-api/
```

This will upload all your files. Enter your root password when prompted.

**Wait for upload to complete** (may take a few minutes depending on your internet speed)

---

### 5️⃣ Back to SSH Terminal - Install & Build

```bash
cd /var/www/pg-api

# Install dependencies
npm install --legacy-peer-deps

# Setup environment
cp .env.example .env
nano .env
```

**IMPORTANT**: Update these values in the `.env` file:
- Change `NODE_ENV=development` to `NODE_ENV=production`
- Update `JWT_SECRET` to a strong random string
- Update `JWT_REFRESH_SECRET` to another strong random string
- Verify `DATABASE_URL` is correct: `mysql://pgmanp7o_arun:arun30121998@116.206.105.148:3306/pgmanp7o_pg_mobile_app_v2?connection_limit=5&pool_timeout=0`

Press `Ctrl+X`, then `Y`, then `Enter` to save.

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Build application
npm run build

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

**Copy and run the command** that PM2 shows you (it will look like: `sudo env PATH=$PATH:/usr/bin pm2 startup...`)

Then run:
```bash
pm2 save
```

---

### 6️⃣ Setup Nginx Reverse Proxy

```bash
# Create nginx config
cat > /etc/nginx/sites-available/pg-api << 'EOF'
upstream nestjs_backend {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name 72.62.194.189;

    location / {
        proxy_pass http://nestjs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 50M;
}
EOF

# Enable the site
ln -s /etc/nginx/sites-available/pg-api /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Restart nginx
systemctl restart nginx
```

---

### 7️⃣ Verify Everything is Working

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs pg-api --lines 20

# Test API locally
curl http://localhost:5000/health

# Test via public IP
curl http://72.62.194.189/health
```

---

## 🎉 Success!

Your API is now live at: **http://72.62.194.189**

### Test These URLs in Your Browser:
- Health Check: http://72.62.194.189/health
- API Docs: http://72.62.194.189/api-docs
- API Base: http://72.62.194.189/api/v1

---

## 📱 Useful Commands

```bash
pm2 status              # Check app status
pm2 logs pg-api         # View logs
pm2 restart pg-api      # Restart app
pm2 stop pg-api         # Stop app
systemctl status nginx  # Check nginx
```

---

## 🔄 To Update Your App Later

```bash
cd /var/www/pg-api
# Upload new files via SCP, then:
npm install --legacy-peer-deps
npx prisma migrate deploy
npm run build
pm2 restart pg-api
```

---

## 🆘 Troubleshooting

**If app won't start:**
```bash
pm2 logs pg-api --lines 50
pm2 restart pg-api
```

**If you get 502 error:**
```bash
pm2 status
systemctl restart nginx
```

**Check if port 5000 is in use:**
```bash
lsof -i :5000
```

---

## 🔐 Next Steps (Optional)

1. **Setup Domain**: Point your domain's A record to `72.62.194.189`
2. **Add SSL**: Run `certbot --nginx -d api.yourdomain.com`
3. **Setup Monitoring**: Configure alerts for downtime
4. **Database Backups**: Setup automated backups

---

**Need help? Check the detailed guide in `VPS_DEPLOYMENT_GUIDE.md`**
