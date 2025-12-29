# UniFi Access Portal - Quick Start (TL;DR)

**Want to get started fast? Follow these 4 steps.**

> For detailed documentation, see [README.md](README.md)

## Step 1: Get the Containers

Pull the two required Docker images:

```bash
docker pull mongo:latest
docker pull node:lts-alpine
```

## Step 2: Copy This Folder to Your Data Directory

Copy the `web-portal` folder to your server/machine where you'll run the application. This folder contains all the code and scripts needed.

**Directory structure:**
```
your-server/
└── web-portal/          ← Copy this entire folder here
    ├── index.js
    ├── package.json
    ├── public/
    ├── *.sh (shell scripts)
    └── ... (other files)
```

## Step 3: Configure Your `.env` File

Create a `.env` file in the `web-portal` directory with your settings:

```bash
# MongoDB Connection
MONGO_URL=mongodb://mongodb:27017/web-portal

# UniFi API - Site 1 (Primary) - REQUIRED
UNIFA_API_URL=https://YOUR_UNIFI_IP:12445/api/v1/developer
UNIFA_BEARER_TOKEN=your_bearer_token_here

# UniFi API - Site 2 (Optional, only if you have 2 sites)
UNIFA_SITE2_API_URL=https://YOUR_UNIFI_IP_2:12445/api/v1/developer
UNIFA_SITE2_BEARER_TOKEN=your_site2_bearer_token_here

# Email Configuration - REQUIRED
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yoursite.com
```

## Step 4: Set Up Docker & Run

### Option A: Using Docker Compose (Recommended)

Create a `docker-compose.yml` in your project root (parent of `web-portal`):

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:latest
    container_name: web-portal-mongo
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    networks:
      - web-portal-network

  node:
    image: node:lts-alpine
    container_name: web-portal-app
    working_dir: /app
    restart: unless-stopped
    volumes:
      - ./web-portal:/app
    ports:
      - "3000:3000"
    networks:
      - web-portal-network
    depends_on:
      - mongodb
    environment:
      MONGO_URL: mongodb://mongodb:27017/web-portal
    entrypoint: sh -c "apk add --no-cache curl jq && cd /app && npm install && npm start"

volumes:
  mongo-data:

networks:
  web-portal-network:
    driver: bridge
```

Then run:
```bash
docker-compose up -d
```

### Option B: Manual Docker Commands

```bash
# Create network
docker network create web-portal-network

# Run MongoDB
docker run -d \
  --name web-portal-mongo \
  --network web-portal-network \
  -v mongo-data:/data/db \
  mongo:latest

# Run Node.js Application
docker run -d \
  --name web-portal-app \
  --network web-portal-network \
  -p 3000:3000 \
  -v $(pwd)/web-portal:/app \
  -e MONGO_URL=mongodb://web-portal-mongo:27017/web-portal \
  --entrypoint sh \
  node:lts-alpine \
  -c "apk add --no-cache curl jq && cd /app && npm install && npm start"
```

## That's It! 

Access the portal at: `http://localhost:3000` (or `http://your-server-ip:3000`)

---

## Troubleshooting

**Can't reach the application?**
- Check if containers are running: `docker ps`
- View logs: `docker logs web-portal-app`

**Email not working?**
- Verify email credentials in `.env`
- For Gmail, use an app-specific password

**API connection error?**
- Verify UniFi API URL and bearer token in `.env`
- Check network connectivity to UniFi system

---

## Next Steps

- See [README.md](README.md) for full documentation
- Check [Customization Guide](README.md#customization-guide) to personalize the interface
- Review [Multi-Site Support](README.md#multi-site-support) if you have 2+ UniFi sites

