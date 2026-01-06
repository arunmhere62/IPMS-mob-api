# ⚡ Quick Deployment Commands

## 🚀 Fast Track Deployment (Copy & Paste)

### 1️⃣ Connect to VPS
```bash
ssh root@72.62.194.189
```

### 2️⃣ Create App Directory
```bash
mkdir -p /var/www/pg-api
cd /var/www/pg-api
```

### 3️⃣ Upload Files from Local Machine
**Open a NEW terminal on your local machine** (keep SSH session open):

```bash
cd d:\pg-mobile-app\IPMS-mob\IPMS-mob-api
scp -r ./* root@72.62.194.189:/var/www/pg-api/
```

### 4️⃣ Back to VPS Terminal - Run Deployment
```bash
cd /var/www/pg-api
chmod +x deploy-vps.sh
./deploy-vps.sh
```

**Note**: The script will pause when it creates `.env` file. Edit it with your production values:
```bash
nano .env
```
Update these critical values:
- `DATABASE_URL` - Your production database
- `JWT_SECRET` - Strong random secret
- `JWT_REFRESH_SECRET` - Another strong secret
- `NODE_ENV=production`

Press `Ctrl+X`, then `Y`, then `Enter` to save.

Then press `Enter` to continue the deployment script.

### 5️⃣ Setup Nginx
```bash
sudo cp nginx-config.conf /etc/nginx/sites-available/pg-api
sudo ln -s /etc/nginx/sites-available/pg-api /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 6️⃣ Verify Deployment
```bash
pm2 status
curl http://localhost:5000/health
curl http://72.62.194.189/health
```

---

## 🎯 Your API is Live!

**Access URLs:**
- Direct IP: `http://72.62.194.189`
- API Docs: `http://72.62.194.189/api-docs`
- Health Check: `http://72.62.194.189/health`

---

## 🔄 Quick Update Commands

```bash
cd /var/www/pg-api
git pull origin main  # or upload new files
npm install --legacy-peer-deps
npm run build
pm2 restart pg-api
pm2 logs pg-api
```

---

## 📱 Essential Commands

```bash
pm2 status              # Check app status
pm2 logs pg-api         # View logs
pm2 restart pg-api      # Restart app
sudo systemctl status nginx  # Check nginx
```

---

## 🆘 Quick Troubleshooting

**App not starting?**
```bash
pm2 logs pg-api --lines 50
pm2 restart pg-api
```

**502 Bad Gateway?**
```bash
pm2 status
sudo systemctl restart nginx
```

**Database issues?**
```bash
cd /var/www/pg-api
cat .env | grep DATABASE_URL
npx prisma migrate deploy
```

---

## 🔐 Optional: Setup Domain & SSL

**After configuring DNS (A record → 72.62.194.189):**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d api.yourdomain.com

# Edit nginx config to use your domain
sudo nano /etc/nginx/sites-available/pg-api

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

---

**📖 For detailed guide, see: `VPS_DEPLOYMENT_GUIDE.md`**
