# Bill Payment Tracker — AWS Deployment Guide (Zero-Cost)

> **Cost:** $0/month within the AWS Free Tier (first 12 months).
> After free tier expires, a single `t2.micro` costs ~$8/month (or less with reserved pricing).
> No RDS — PostgreSQL runs directly on the EC2 instance to avoid extra charges.

---

## Architecture

```
                       ┌──────────────────────────────────────┐
                       │   AWS Cloud (ap-south-1)             │
                       │                                      │
[Browser] ──HTTP/S──►  │  EC2  t2.micro  (Free Tier)          │
                       │   ├── Nginx (port 80 / 443)          │
                       │   ├── Node.js + Express (:5000)      │
                       │   │     ├─ Serves React build        │
                       │   │     ├─ REST API                  │
                       │   │     └─ pg driver ──► localhost    │
                       │   └── PostgreSQL 15 (:5432 local)    │
                       │         └── bill_payment_tracker DB  │
                       │                                      │
                       │  S3 Bucket                           │
                       │   └── payment-proofs/*               │
                       └──────────────────────────────────────┘
```

---

## Prerequisites

- AWS account (free tier eligible)
- SSH client (OpenSSH / PuTTY)
- Your project source code (git repo or local copy)

---

## Step 1 — Launch EC2 Instance (Free Tier)

1. **AWS Console → EC2 → Launch Instance**
2. Configure:
   | Setting | Value |
   |---|---|
   | Name | `bill-payment-tracker` |
   | AMI | Amazon Linux 2023 (Free tier eligible) |
   | Instance type | `t2.micro` |
   | Key pair | Create new → Download `.pem` → Save securely |
   | Storage | 15 GB gp3 (free tier allows up to 30 GB) |
3. **Network settings → Security group** (create new `bill-tracker-sg`):
   - SSH (22) — your IP only
   - HTTP (80) — 0.0.0.0/0
   - HTTPS (443) — 0.0.0.0/0
   - **Do NOT** open port 5432 — PostgreSQL stays local only
4. Launch instance
5. Note the **Public IPv4 address**

---

## Step 2 — Connect to EC2

```bash
# Linux / Mac / Windows PowerShell
chmod 400 your-key.pem
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

---

## Step 3 — Install Node.js, Nginx, Git, PM2

```bash
# Update system
sudo dnf update -y

# Install Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Verify
node --version   # v20.x
npm --version

# Install Nginx + Git
sudo dnf install -y nginx git

# Install PM2 globally
sudo npm install -g pm2
```

---

## Step 4 — Install and Configure PostgreSQL on EC2

```bash
# Install PostgreSQL 15 server + client
sudo dnf install -y postgresql15-server postgresql15

# Initialize the database cluster
sudo postgresql-setup --initdb

# Enable and start PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Verify it's running
sudo systemctl status postgresql
```

### Create the database and application user

```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE bill_payment_tracker;"

# Create user with password
sudo -u postgres psql -c "CREATE USER bill_user_admin WITH PASSWORD 'NorwayLightToSee123';"

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bill_payment_tracker TO bill_user_admin;"
sudo -u postgres psql -d bill_payment_tracker -c "GRANT ALL ON SCHEMA public TO bill_user_admin;"
```

### Enable password authentication for local connections

By default PostgreSQL uses `ident` auth. Change it to `md5` (password) for the app user:

```bash
# Edit pg_hba.conf
sudo nano /var/lib/pgsql/data/pg_hba.conf
```

Find the line:
```
local   all             all                                     peer
```
Change `peer` to `md5`:
```
local   all             all                                     md5
```

Also find:
```
host    all             all             127.0.0.1/32            ident
```
Change `ident` to `md5`:
```
host    all             all             127.0.0.1/32            md5
```

Save and restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Verify connection

```bash
psql -h 127.0.0.1 -U bill_user_admin -d bill_payment_tracker -c "SELECT version();"
# Enter password: NorwayLightToSee123
```

---

## Step 5 — Create S3 Bucket for Screenshots

1. **AWS Console → S3 → Create bucket**
   - Bucket name: `bill-payment-tracker-screenshots` (must be globally unique — add a random suffix if taken)
   - Region: same as EC2 (e.g. `ap-south-1`)
   - **Block all public access**: Keep ON
   - Versioning: Disabled
2. Create the bucket

### Create IAM user for S3 access

1. **IAM → Users → Create user** → name: `bill-tracker-s3-user`
2. Attach policy → **Create inline policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::bill-payment-tracker-screenshots/*"
    }
  ]
}
```
3. Create **Access key** (use case: Application running on EC2)
4. Save the **Access Key ID** and **Secret Access Key**

> **Alternative (recommended):** Attach an IAM Role with the S3 policy directly to the
> EC2 instance instead. Go to EC2 → Instance → Actions → Security → Modify IAM role.
> This eliminates the need for `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars.

---

## Step 6 — Deploy Application Code

### Option A: Git clone
```bash
cd /home/ec2-user
git clone <YOUR_REPO_URL> bill-payment-tracker
cd bill-payment-tracker
```

### Option B: SCP from local machine
```bash
# Run from your LOCAL machine:
scp -i your-key.pem -r ./billPaymentTracker ec2-user@<EC2_PUBLIC_IP>:/home/ec2-user/bill-payment-tracker
```

---

## Step 7 — Install Dependencies and Build

```bash
cd /home/ec2-user/bill-payment-tracker

# Server
cd server
npm install --production
cd ..

# Client (build React app)
cd client
npm install
npm run build
cd ..
```

---

## Step 8 — Configure Environment

```bash
cat > /home/ec2-user/bill-payment-tracker/.env << 'EOF'
# ---- General ----
PORT=5000
NODE_ENV=production
APP_URL=http://<EC2_PUBLIC_IP>
COUNTRY_CODE=91

# ---- Auth ----
JWT_SECRET=<GENERATE_A_LONG_RANDOM_SECRET>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<YOUR_ADMIN_PASSWORD>

# ---- PostgreSQL (local on EC2) ----
DATABASE_URL=postgresql://bill_user_admin:NorwayLightToSee123@127.0.0.1:5432/bill_payment_tracker
DB_SSL=false

# ---- AWS S3 (screenshots) ----
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<YOUR_KEY>
AWS_SECRET_ACCESS_KEY=<YOUR_SECRET>
S3_BUCKET_NAME=bill-payment-tracker-screenshots
EOF
```

Replace the `<placeholders>`:
| Placeholder | Where to find it |
|---|---|
| `<EC2_PUBLIC_IP>` | EC2 console → Instance → Public IPv4 |
| `<GENERATE_A_LONG_RANDOM_SECRET>` | Run: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `<YOUR_KEY>` / `<YOUR_SECRET>` | IAM user access key (skip if using IAM Role on EC2) |

Secure the file:
```bash
chmod 600 /home/ec2-user/bill-payment-tracker/.env
```

---

## Step 9 — Start Application with PM2

```bash
cd /home/ec2-user/bill-payment-tracker

# Start the server (schema auto-creates on first boot via initializeSchema())
pm2 start server/server.js --name bill-tracker

# Verify
pm2 logs bill-tracker --lines 20

# Save process list and enable startup on reboot
pm2 save
pm2 startup
# ↑ Run the command it prints (starts with sudo)
```

---

## Step 10 — Configure Nginx Reverse Proxy

```bash
sudo tee /etc/nginx/conf.d/bill-tracker.conf > /dev/null << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Test and start
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Step 11 — Verify Deployment

Open your browser:
```
http://<EC2_PUBLIC_IP>
```

You should see the Bill Payment Tracker login page.

---

## Step 12 (Optional) — Free SSL with Let's Encrypt

Requires a domain name pointing to your EC2 IP.

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
sudo systemctl status certbot-renew.timer
```

Update `.env`:
```
APP_URL=https://yourdomain.com
```

Then restart:
```bash
pm2 restart bill-tracker
```

---

## Useful Commands

```bash
# App logs
pm2 logs bill-tracker

# Restart / stop
pm2 restart bill-tracker
pm2 stop bill-tracker

# Nginx logs
sudo tail -f /var/log/nginx/error.log

# Connect to local PostgreSQL
psql -h 127.0.0.1 -U bill_user_admin -d bill_payment_tracker

# Backup database
pg_dump -h 127.0.0.1 -U bill_user_admin bill_payment_tracker > ~/bill_tracker_backup_$(date +%F).sql

# Restore from backup
psql -h 127.0.0.1 -U bill_user_admin -d bill_payment_tracker < ~/bill_tracker_backup_YYYY-MM-DD.sql

# Check PostgreSQL status
sudo systemctl status postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## Database Maintenance

### Automatic daily backup (recommended)

```bash
# Create backup script
cat > /home/ec2-user/backup-db.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/home/ec2-user/db-backups"
mkdir -p "$BACKUP_DIR"
PGPASSWORD='NorwayLightToSee123' pg_dump -h 127.0.0.1 -U bill_user_admin bill_payment_tracker \
  > "$BACKUP_DIR/bill_tracker_$(date +%F).sql"
# Keep only last 7 days
find "$BACKUP_DIR" -name "*.sql" -mtime +7 -delete
SCRIPT

chmod +x /home/ec2-user/backup-db.sh

# Schedule daily backup at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /home/ec2-user/backup-db.sh") | crontab -
```

---

## Cost Summary

| Service | Free Tier (12 months) | After Free Tier |
|---|---|---|
| EC2 `t2.micro` | 750 hrs/month — **$0** | ~$8/month |
| EBS (gp3) 15 GB | 30 GB/month — **$0** | ~$1.20/month |
| S3 | 5 GB — **$0** | pennies |
| Data Transfer | 100 GB/month — **$0** | pennies |
| PostgreSQL | On EC2 — **$0** | On EC2 — **$0** |
| **Total** | **$0/month** | **~$10/month** |

> PostgreSQL on EC2 = always free. No RDS charges ever.

---

## Updating the Application

```bash
cd /home/ec2-user/bill-payment-tracker
git pull
cd client && npm install && npm run build && cd ..
cd server && npm install --production && cd ..
pm2 restart bill-tracker
```
