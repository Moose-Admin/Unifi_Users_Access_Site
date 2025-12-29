# Web Portal
This is a web portal for managing UniFi Access system with support for license plates, PINs, identity app invites, and visitor management.

> **Note:** This is a non-production copy. Sensitive production-specific configurations have been removed for public sharing.

## Table of Contents

- [Requirements](#requirements)
  - [Docker Containers](#docker-containers)
  - [Environment Configuration](#environment-configuration)
- [Installation & Setup Guide](#installation--setup-guide)
  - [Prerequisites](#prerequisites)
  - [Step-by-Step Installation](#step-by-step-installation)
  - [Troubleshooting Installation](#troubleshooting-installation)
- [Features](#features)
- [How It Works](#how-it-works)
  - [Application Flow](#application-flow)
- [Core Components](#core-components)
  - [Backend (Node.js/Express)](#backend-nodejs-express)
  - [Frontend (HTML/CSS/JavaScript)](#frontend-htmlcssjavascript)
  - [Shell Scripts](#shell-scripts)
- [Validation Rules](#validation-rules)
- [Environment Variables](#environment-variables)
- [Script Execution Flow](#script-execution-flow)
- [Multi-Site Support](#multi-site-support)
  - [How Multi-Site Works](#how-multi-site-works)
  - [What Happens at Each Site](#what-happens-at-each-site)
  - [Site-Specific Features](#site-specific-features)
  - [Example Scenarios](#example-scenarios)
- [Converting to Single-Site Setup](#converting-to-single-site-setup)
  - [Option 1: Clean Approach](#option-1-clean-approach-recommended)
  - [Option 2: Keep Structure](#option-2-keep-structure-minimal-changes)
  - [Code Changes](#code-changes-for-single-site-option-1)
  - [Reverting to Multi-Site](#reverting-from-single-site-to-multi-site)
- [Session Management](#session-management)

## Requirements

### Docker Containers

#### MongoDB
- Used to maintain session state for users
- Required for user authentication and session persistence

#### Node.js
- **Recommended Image:** `node:lts-alpine`
- **Volume Mount:** Map the `web-portal` folder as the container's data directory (`/app`)
- **Post Argument:** 
  ```sh
  sh -c "apk add --no-cache curl jq && cd /app && npm install && npm start"
  ```
  This command will:
  - Install `curl` and `jq` utilities
  - Install Node.js dependencies
  - Start the application
  - Copy local site users with license plates and cache them in memory
  - Remove any visitors that have expired more than 30 days ago

### Environment Configuration
- Create a `.env` file in the `web-portal` directory with all required environment variables
- See `.env.example` (if available) for reference configuration

## Installation & Setup Guide

### Prerequisites
- Docker and Docker Compose installed
- UniFi Network Management System with API access enabled
- UniFi API bearer token(s) for your site(s)
- SMTP email server credentials (for sending verification codes)
- Basic knowledge of Docker and environment variables

### Step-by-Step Installation

#### 1. Obtain UniFi API Credentials

For each UniFi site you want to manage:
- Log in to UniFi Network Management System
- Navigate to Settings → API Management
- Enable API access if not already enabled
- Generate or retrieve your API bearer token
- Note the API URL (typically `https://<unifi-ip>:12445/api/v1/developer`)

#### 2. Prepare Environment Variables

Create a `.env` file in the `web-portal` directory with your credentials:

```bash
# MongoDB Connection (use container name if using Docker Compose)
MONGO_URL=mongodb://mongodb:27017/web-portal

# UniFi API - Site 1 (Primary) - REQUIRED
UNIFA_API_URL=https://192.168.1.1:12445/api/v1/developer
UNIFA_BEARER_TOKEN=your_site1_bearer_token

# UniFi API - Site 2 (Secondary) - OPTIONAL
# Only include these if you have a second site
UNIFA_SITE2_API_URL=https://192.168.1.2:12445/api/v1/developer
UNIFA_SITE2_BEARER_TOKEN=your_site2_bearer_token

# Email Configuration - REQUIRED
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yoursite.com
```

#### 3. Docker Compose Configuration

Create a `docker-compose.yml` file in your project root:

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
    environment:
      MONGO_INITDB_DATABASE: web-portal

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

#### 4. Start the Application

```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000`

#### 5. Verify Installation

- Check logs: `docker-compose logs -f node`
- The application should initialize the cache and start the server
- Try logging in with a test user email
- Verify that verification codes are being sent

### Troubleshooting Installation

**MongoDB Connection Failed:**
- Ensure MongoDB container is running: `docker-compose ps`
- Check MongoDB logs: `docker-compose logs mongodb`
- Verify `MONGO_URL` is correct in `.env`

**API Connection Failed:**
- Verify UniFi API URL and bearer token are correct
- Test API connectivity: `curl -k -H "Authorization: Bearer YOUR_TOKEN" https://YOUR_IP:12445/api/v1/developer/users`
- Check network connectivity to UniFi management system

**Emails Not Sending:**
- Verify email credentials in `.env`
- Check email logs: `docker-compose logs node | grep -i email`
- For Gmail, use an app-specific password, not your account password
- Ensure port 587 or 25 is not blocked by firewall

**Cache Not Updating:**
- Check if curl and jq are installed in the container
- Verify API bearer token has correct permissions
- Check application logs for errors

## Features
- User authentication with email and verification code
- View and manage managed users
- Change PIN for both the gate and the clubhouse/pool
- Add and remove license plates
- Send invites to new users
- Logout
- Client-side and server-side validation
- Real-time loading indicators and user feedback
- Automatic visitor cleanup for expired entries

## How It Works

### Application Flow

1. **Startup Process**
   - Upon initialization, the application fetches all users and license plates from the UniFi API and caches them in memory
   - The `query_and_delete_completed_visitors.sh` script automatically runs to clean up expired visitors (>30 days old)
   - The server then starts and listens on port 3000

2. **User Authentication**
   - Users enter their email address
   - A 6-digit verification code is sent via email
   - User enters the code (valid for 5 minutes)
   - Session is created and stored in MongoDB
   - Sessions expire after 1 hour of inactivity

3. **Dashboard Access**
   - Once authenticated, users access the dashboard
   - User information is fetched from the cached data
   - Managed users are retrieved via API call
   - License plates are displayed from memory cache

4. **Cache Synchronization**
   - Cache refreshes every 30 minutes automatically
   - Cache also refreshes after any successful user modification (PIN or plate change)
   - This ensures the in-memory data stays in sync with the UniFi API

## Core Components

### Backend (Node.js/Express)

#### Main Server File: [index.js](index.js)
The main application server that handles:
- Express configuration and middleware setup
- Session management with MongoDB store
- API endpoints for authentication and user actions
- Cache management for users and license plates
- Shell script execution for UniFi API operations

**Key Functions:**
- `fetchAndCacheData()` - Pulls all users and license plates from UniFi API, updates in-memory cache
- `requireLogin` - Middleware that protects routes requiring authentication

**Key Endpoints:**
- `GET /` - Serves login page
- `GET /dashboard` - Serves authenticated user dashboard
- `GET /api/user` - Returns current user session data
- `POST /send-code` - Sends verification email with 6-digit code
- `POST /verify-code` - Validates code and creates session
- `POST /logout` - Destroys session and clears cookie
- `POST /api/user/name` - Gets user's full name from cache
- `POST /get-managed-users` - Gets list of users managed by current user
- `POST /get-license-plates` - Gets current user's license plates from cache
- `POST /change-pin` - Updates PIN on both sites (gate and clubhouse)
- `POST /add-license-plate` - Adds license plate to user account
- `POST /remove-license-plate` - Removes license plate from user account
- `POST /api/send-invite` - Sends UniFi identity app invite to user

#### Email Handler: [email.js](email.js)
Manages email sending via Nodemailer:
- Sends verification codes to user email addresses
- Configured via environment variables for SMTP settings
- Supports custom email sender, host, port, and credentials

#### User Action Logging: [user_action_log.js](user_action_log.js)
Records all user actions to `user_actions.log` file:
- Login/logout events
- PIN changes
- License plate additions/removals
- Invite sending
- Includes timestamp for each action

### Frontend (HTML/CSS/JavaScript)

#### Main Page: [public/index.html](public/index.html)
- Login form with email input
- Verification code form
- User dashboard with tabs for different functions
- Loading overlay during operations
- Bootstrap-based responsive design

#### Script: [public/script.js](public/script.js)
Handles all frontend interactions:
- Email and code verification flow
- PIN validation (5-8 digits, no sequential/repetitive numbers)
- License plate management
- Managed users listing
- Invite sending with retry logic (up to 3 attempts with 2-second delays)
- Real-time feedback messages
- Error/success notifications

#### Styling: [public/style.css](public/style.css)
- Custom styling for the portal interface
- Loading overlay styles
- Alert and feedback message styling

### Shell Scripts

These scripts interact directly with the UniFi API and require the `UNIFA_API_URL` and `UNIFA_BEARER_TOKEN` environment variables.

#### PIN Management Scripts

**[Add_Pin_To_User.sh](Add_Pin_To_User.sh)** & **[Add_Pin_To_User_Site2.sh](Add_Pin_To_User_Site2.sh)**
- Called by: `/change-pin` endpoint
- Function: Updates user's PIN for gate access
- Parameters: `<email> <pin>`
- Validates PIN format before submission
- Site1 and Site2 versions for managing multiple access points

#### License Plate Scripts

**[add_license_plate.sh](add_license_plate.sh)** & **[add_license_plate_site2.sh](add_license_plate_site2.sh)**
- Called by: `/add-license-plate` endpoint
- Function: Adds license plate to user account
- Parameters: `<email> <license_plate>`
- Validates plate doesn't already exist
- Returns error if plate is already in use

**[remove_license_plate.sh](remove_license_plate.sh)** & **[remove_license_plate_site2.sh](remove_license_plate_site2.sh)**
- Called by: `/remove-license-plate` endpoint
- Function: Removes license plate from user account
- Parameters: `<email> <license_plate>`
- Confirms plate removal

#### User & Invite Scripts

**[get_managed_users.sh](get_managed_users.sh)** & **[get_user_name_site2.sh](get_user_name_site2.sh)**
- Called by: `/get-managed-users` endpoint
- Function: Retrieves list of users managed by the authenticated user
- Parameters: `<email>`
- Returns JSON array of managed users

**[send_invite.sh](send_invite.sh)** & **[send_invite_site2.sh](send_invite_site2.sh)**
- Called by: `/api/send-invite` endpoint
- Function: Sends UniFi identity app invite to a user
- Parameters: `<user_id> <email>`
- Allows users to add or reinstall the UniFi Access app

#### Visitor Cleanup Script

**[query_and_delete_completed_visitors.sh](query_and_delete_completed_visitors.sh)**
- Called by: Automatically on startup (see `npm start` in package.json)
- Function: Deletes visitor records that have expired for more than 30 days
- No parameters required
- Uses `jq` for JSON parsing and filtering
- Helps maintain database cleanliness by removing old records

## Validation Rules

### PIN Requirements
- Length: 5-8 digits
- No repetitive numbers (e.g., 11111 is invalid)
- No sequential numbers (e.g., 12345 or 54321 is invalid)
- Server-side validation matches client-side validation

### License Plate Requirements
- Characters: Letters (A-Z) and numbers (0-9) only
- Length: 1-8 characters
- Uppercase conversion applied automatically
- Must be unique across the system

## Environment Variables

The `.env` file should contain:

```
# MongoDB Connection
MONGO_URL=mongodb://mongodb:27017/web-portal

# UniFi API - Site 1 (Primary)
UNIFA_API_URL=https://10.10.10.1:12445/api/v1/developer
UNIFA_BEARER_TOKEN=your_unifi_bearer_token

# UniFi API - Site 2 (Secondary)
UNIFA_SITE2_API_URL=https://10.10.10.2:12445/api/v1/developer
UNIFA_SITE2_BEARER_TOKEN=your_site2_unifi_bearer_token

# Email Configuration
EMAIL_HOST=smtp.your-email-provider.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@example.com
EMAIL_PASS=your-email-password
EMAIL_FROM=noreply@yoursite.com
```

## Script Execution Flow

```
User Login Request
    ↓
/send-code Endpoint → email.js → Nodemailer → User Email
    ↓
/verify-code Endpoint → Session Created in MongoDB
    ↓
GET /api/user → Returns Session Data
    ↓
/get-managed-users → get_managed_users.sh → UniFi API
/get-license-plates → From Memory Cache
    ↓
User Action (Change PIN / Add Plate / Remove Plate / Send Invite)
    ↓
Executes Corresponding Shell Script → UniFi API
    ↓
Cache Refresh via fetchAndCacheData()
    ↓
Response to Frontend
    ↓
user_action_log.js → Logs to user_actions.log
```

## Multi-Site Support

The application supports managing two separate UniFi access sites simultaneously. This is useful for:
- Managing different access points (e.g., gate and clubhouse)
- Managing locations with separate UniFi controllers
- Providing redundancy or load balancing

### How Multi-Site Works

**Site 1 (Primary) - Required**
- Main site that all users must have access to
- Always executed when user performs any action
- If Site 1 fails, the entire operation fails
- PIN and plate changes are mandatory for this site

**Site 2 (Secondary) - Optional**
- Secondary site for extended access management
- Only executed if Site 2 credentials are provided in `.env`
- If Site 2 fails, the operation may still complete (partial success)
- Users can have different settings on each site

### What Happens at Each Site

When a user **changes their PIN**:
1. PIN is validated on the server (5-8 digits, no sequential/repetitive numbers)
2. `Add_Pin_To_User.sh` executes against **Site 1** API
   - Updates the PIN in Site 1's UniFi database
   - User can now use this PIN at Site 1's access point
3. If `UNIFA_SITE2_BEARER_TOKEN` is configured:
   - `Add_Pin_To_User_Site2.sh` executes against **Site 2** API
   - Updates the PIN in Site 2's UniFi database
   - User can now use this PIN at Site 2's access point
4. The in-memory cache is refreshed to reflect changes
5. Action is logged to `user_actions.log`

When a user **adds/removes a license plate**:
1. License plate is validated (letters/numbers only, 1-8 chars)
2. `add_license_plate.sh` executes against **Site 1** API
   - Adds plate to Site 1's system
3. If Site 2 is configured:
   - `add_license_plate_site2.sh` executes against **Site 2** API
   - Adds plate to Site 2's system
4. Cache is refreshed
5. Action is logged

### Site-Specific Features

**Managed Users:**
- Retrieved from whichever site is being queried
- Site 2 is only queried if explicitly needed

**License Plates:**
- Cached from Site 1 and displayed to users
- Changes sync to both sites

**Identity App Invites:**
- Can be sent to users on either site
- Sent through the appropriate site's API

### Example Scenarios

**Scenario 1: Gate + Clubhouse**
- Site 1: Gate access control
- Site 2: Clubhouse/Pool access control
- User sets PIN → Works at both gate and clubhouse
- User adds license plate → Recognized at both locations

**Scenario 2: Building A + Building B**
- Site 1: Main building access
- Site 2: Secondary building access
- Users can manage credentials for both locations from one interface

**Scenario 3: Production + Test**
- Site 1: Production UniFi system
- Site 2: Test/Development UniFi system
- Can test changes on Site 2 before applying to Site 1

## Converting to Single-Site Setup

If you only have one UniFi site and want to simplify the application, follow these steps:

### Option 1: Clean Approach (Recommended)

#### 1. Modify `index.js`

Find the `/change-pin` endpoint (around line 200) and modify the PIN change logic:

**Before:**
```javascript
// Execute script for the primary site
const scriptPath1 = './Add_Pin_To_User.sh';
// ... execute for Site 1 ...

// Execute script for the second site
const scriptPath2 = './Add_Pin_To_User_Site2.sh';
// ... execute for Site 2 ...
```

**After:**
```javascript
// Execute script for the single site
const scriptPath = './Add_Pin_To_User.sh';
// ... execute only Site 1 script ...
// Remove the Site 2 execution block entirely
```

#### 2. Remove Site 2 Scripts

Delete these files:
- `Add_Pin_To_User_Site2.sh`
- `add_license_plate_site2.sh`
- `remove_license_plate_site2.sh`
- `send_invite_site2.sh`
- `get_user_name_site2.sh`

#### 3. Simplify `.env`

Remove Site 2 variables:
```bash
# Remove these lines:
# UNIFA_SITE2_API_URL=...
# UNIFA_SITE2_BEARER_TOKEN=...
```

#### 4. Update Frontend Messaging

In `public/script.js`, find references to "Site 2" or "Clubhouse" and update the UI labels to match your single site name.

#### 5. Simplify Error Handling

Remove Site 2 error handling from endpoints. Focus on Site 1 response only.

### Option 2: Keep Structure (Minimal Changes)

If you want to keep the Site 2 scripts but don't use them:

1. **Do not** delete the Site 2 scripts
2. **Do not** set `UNIFA_SITE2_BEARER_TOKEN` in `.env`
3. The application will automatically skip Site 2 operations since the token is missing
4. This approach allows you to add Site 2 later without code changes

### Code Changes for Single Site Option 1

**In `index.js`, replace the `/change-pin` endpoint execution logic:**

```javascript
// Remove the try-catch block that handles both sites
// Replace with simplified version that only handles Site 1:

try {
    const scriptPath = './Add_Pin_To_User.sh';
    const { stdout, stderr } = await new Promise((resolve, reject) => {
        exec(`${scriptPath} "${email}" "${newPin}"`, { cwd: __dirname, env: process.env }, 
            (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
    });
    
    if (stdout.includes("PIN successfully updated.")) {
        logUserAction(`${email} updated PIN to ${newPin}`);
        fetchAndCacheData();
        return res.sendStatus(200);
    } else {
        return res.status(500).send('Failed to change PIN.');
    }
} catch (err) {
    console.error(`exec error: ${err.error?.message}`);
    return res.status(500).send('Failed to change PIN due to an internal error.');
} finally {
    fetchAndCacheData();
}
```

**In `index.js`, simplify the `/add-license-plate` endpoint:**

Remove the second site execution and keep only the primary site logic.

**In `index.js`, simplify the `/remove-license-plate` endpoint:**

Remove the second site execution and keep only the primary site logic.

### Reverting from Single-Site to Multi-Site

If you started with Option 2 or want to re-enable Site 2:

1. Get Site 2 scripts from version control or backup
2. Add `UNIFA_SITE2_API_URL` and `UNIFA_SITE2_BEARER_TOKEN` to `.env`
3. Update error handling logic in `index.js` if you used Option 1
4. Restart the application

## Session Management

- Sessions stored in MongoDB for persistence across container restarts
- Session timeout: 1 hour of inactivity
- Logout clears session and cookie
- Session secret should be updated in production environment
