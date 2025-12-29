require('dotenv').config();
console.log('This is version 2 of index.js');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const app = express();
const port = 3000;
const { sendVerificationCode } = require('./email');
const { logUserAction } = require('./user_action_log');
const { exec } = require('child_process');
const path = require('path');

app.use(express.static('public'));
app.use(express.json());

const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/web-portal';

app.use(session({
    secret: 'a-very-secret-key-that-should-be-in-an-env-file',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl }),
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));

const verificationCodes = {};

let userCache = [];
let licensePlateCache = {};
let userEmailMap = {};

function fetchAndCacheData() {
    const API_URL = process.env.UNIFA_API_URL ? `${process.env.UNIFA_API_URL}/api/v1/developer/users` : "https://10.10.10.1:12445/api/v1/developer/users";
    const AUTH_HEADER = `Authorization: Bearer ${process.env.UNIFA_BEARER_TOKEN}`;
    const command = `curl -s -k "${API_URL}?expand[]=license_plates" -H "${AUTH_HEADER}"`;

    // console.log('fetchAndCacheData: Starting cache fetch...');
    // console.log(`fetchAndCacheData: Executing command: ${command}`);

    return new Promise((resolve, reject) => { // Return a Promise
        exec(command, { timeout: 60000 }, (error, stdout, stderr) => { // Increased timeout to 60 seconds
            // console.log('fetchAndCacheData: exec callback triggered.');
            if (error) {
                console.error(`fetchAndCacheData: exec error: ${error.message}`);
                console.error(`fetchAndCacheData: command: ${command}`);
                console.error(`fetchAndCacheData: stderr: ${stderr}`);
                return reject(error); // Reject the Promise on error
            }
            // console.log('fetchAndCacheData: exec completed without error.');
            // console.log(`fetchAndCacheData: stdout: ${stdout.substring(0, 500)}...`); // Log first 500 chars of stdout
            // console.log(`fetchAndCacheData: stderr: ${stderr}`);


            try {
                const users = JSON.parse(stdout);
                const newUserCache = users.data;
                const newLicensePlateCache = {};
                const newUserEmailMap = {};

                newUserCache.forEach(user => {
                    if (user.license_plates) {
                        newLicensePlateCache[user.id] = user.license_plates.map(p => ({ plate: p.credential }));
                    } else {
                        newLicensePlateCache[user.id] = [];
                    }
                    if (user.email) {
                        newUserEmailMap[user.email.toLowerCase()] = user;
                    }
                    if (user.user_email) {
                        newUserEmailMap[user.user_email.toLowerCase()] = user;
                    }
                });
                userCache = newUserCache;
                licensePlateCache = newLicensePlateCache;
                userEmailMap = newUserEmailMap;
                // console.log('fetchAndCacheData: Cache updated successfully.');
                resolve(); // Resolve the Promise on success
            } catch (e) {
                console.error(`fetchAndCacheData: Error parsing JSON: ${e.message}`);
                console.error(`fetchAndCacheData: stdout (potentially invalid JSON): ${stdout}`);
                reject(e); // Reject on parsing error
            }
        });
    });
}

setInterval(fetchAndCacheData, 30 * 60 * 1000);
function startServer() {
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/public/index.html');
    });

    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}

fetchAndCacheData()
    .then(startServer)
    .catch(err => {
        console.error('Failed to initialize cache, server not starting:', err);
        process.exit(1); // Exit if initial cache fails
    });

function requireLogin(req, res, next) {

    if (req.session.user) {

        next();

    } else {

        res.redirect('/');

    }

}

app.post('/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[email] = { code, timestamp: Date.now() };
    console.log(`sending code ${code} to ${email}`);
    await sendVerificationCode(email, code);
    res.sendStatus(200);
});

app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    console.log(`User ${email} entered code ${code}`);
    if (verificationCodes[email] && verificationCodes[email].code === code) {
        // Code is valid for 5 minutes
        if (Date.now() - verificationCodes[email].timestamp < 5 * 60 * 1000) {
            delete verificationCodes[email];
            req.session.user = { email };
            req.session.save((err) => {
                if (err) {
                    console.error('Error saving session:', err);
                    return res.sendStatus(500);
                }
                console.log(`User ${email} connected.`);
                logUserAction(`User ${email} connected.`);
                return res.sendStatus(200);
            });
            return;
        }
    }
    res.sendStatus(401);
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/user', requireLogin, (req, res) => {
    res.json(req.session.user);
});

app.post('/api/user/name', requireLogin, (req, res) => {
    const { email } = req.body;
    // console.log('Searching for email:', email);
    // Use userEmailMap for direct lookup
    const user = userEmailMap[email.toLowerCase()];

    if (user) {
        let fullName = 'User not found';
        if (user.first_name && user.last_name) {
            fullName = `${user.first_name} ${user.last_name}`;
        } else if (user.first_name) {
            fullName = user.first_name;
        } else if (user.last_name) {
            fullName = user.last_name;
        } else if (user.email) {
            fullName = user.email;
        } else if (user.user_email) {
            fullName = user.user_email;
        }
        res.send(fullName);
    } else {
        res.status(404).send('User not found');
    }
});




app.post('/logout', (req, res) => {
    const userEmail = req.session.user ? req.session.user.email : 'unknown user';
    logUserAction(`User ${userEmail} logged out.`);
    req.session.destroy(err => {
        if (err) {
            return res.sendStatus(500);
        }
        res.clearCookie('connect.sid');
        res.sendStatus(200);
    });
});

app.post('/change-pin', requireLogin, async (req, res) => {
    const { email, newPin } = req.body;

    // 1. Validate PIN exists and is a string
    if (!newPin || typeof newPin !== 'string') {
        return res.status(400).send('PIN must be a string.');
    }

    // 2. Check for non-digit characters
    if (!/^\d+$/.test(newPin)) {
        return res.status(400).send('PIN must contain only digits.');
    }

    // 3. Check length (5-8 digits)
    if (newPin.length < 5 || newPin.length > 8) {
        return res.status(400).send('PIN must be between 5 and 8 digits long.');
    }

    // 4. Check for repetitive digits (e.g., 11111)
    if (/(.)\1{2,}/.test(newPin)) {
        return res.status(400).send('PIN cannot contain repetitive numbers (e.g., 11111).');
    }

    // 5. Check for sequential digits (e.g., 12345 or 54321)
    let isSequential = true;
    // Check ascending
    for (let i = 0; i < newPin.length - 1; i++) {
        if (parseInt(newPin[i+1]) - parseInt(newPin[i]) !== 1) {
            isSequential = false;
            break;
        }
    }
    if (!isSequential) { // If not ascending, check descending
        isSequential = true; // Reset for descending check
        for (let i = 0; i < newPin.length - 1; i++) {
            if (parseInt(newPin[i]) - parseInt(newPin[i+1]) !== 1) {
                isSequential = false;
                break;
            }
        }
    }

    if (isSequential) {
        return res.status(400).send('PIN cannot contain sequential numbers (e.g., 12345 or 54321).');
    }

    let site1Success = false;
    let site2Success = false;
    let errorMessage = '';

    console.log(`${email} updated PIN to ${newPin} at ${new Date().toLocaleTimeString()}`);

    try {
        // Execute script for the primary site
        const scriptPath1 = './Add_Pin_To_User.sh';
        const { stdout: stdout1, stderr: stderr1 } = await new Promise((resolve, reject) => {
            exec(`${scriptPath1} "${email}" "${newPin}"`, { cwd: __dirname, env: process.env }, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr, site: 'SMB Gate' });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
        
        if (stdout1.includes("PIN successfully updated.")) {
            site1Success = true;
            console.log('SMB Gate Update complete');
        } else {
            errorMessage = 'Failed to confirm PIN update on SMB Gate.';
            console.error(errorMessage);
            if (stderr1) {
                console.error(`SMB Gate (stderr): ${stderr1}`);
            }
        }

        // Execute script for the second site
        const scriptPath2 = './Add_Pin_To_User_Site2.sh';
        try {
            const { stdout: stdout2, stderr: stderr2 } = await new Promise((resolve, reject) => {
                exec(`${scriptPath2} "${email}" "${newPin}"`, {
                    cwd: __dirname,
                    env: {
                        ...process.env,
                        UNIFA_SITE2_API_URL: process.env.UNIFA_SITE2_API_URL,
                        UNIFA_SITE2_BEARER_TOKEN: process.env.UNIFA_SITE2_BEARER_TOKEN
                    }
                }, (error, stdout, stderr) => {
                    if (error) {
                        reject({ error, stdout, stderr, site: 'SMB Clubhouse' });
                    } else {
                        resolve({ stdout, stderr });
                    }
                });
            });

            if (stdout2.includes("PIN successfully updated on Site 2.")) {
                site2Success = true;
                console.log('SMB Clubhouse Update complete');
            } else {
                errorMessage = 'PIN updated on SMB Gate, but failed to confirm update on SMB Clubhouse.';
                console.error(errorMessage);
                 if (stderr2) {
                    console.error(`SMB Clubhouse (stderr): ${stderr2}`);
                }
            }
        } catch (err) {
            errorMessage = `PIN updated on SMB Gate, but failed to update on SMB Clubhouse: ${err.error?.message || 'Unknown error'}`;
            console.error(`exec error for SMB Clubhouse: ${err.error?.message}`);
            console.error(`SMB Clubhouse (stdout): ${err.stdout}`);
            console.error(`SMB Clubhouse (stderr): ${err.stderr}`);
        }

    } catch (err) {
        errorMessage = `Failed to update PIN on ${err.site}: ${err.error?.message || 'Unknown error'}`;
        console.error(`exec error for ${err.site}: ${err.error?.message}`);
        console.error(`${err.site} (stdout): ${err.stdout}`);
        console.error(`${err.site} (stderr): ${err.stderr}`);
    } finally {
        // Trigger cache refresh regardless of full success, as primary might have updated
        fetchAndCacheData();

        if (site1Success && site2Success) {
            logUserAction(`${email} updated PIN to ${newPin}`);
            return res.sendStatus(200);
        } else if (site1Success && !site2Success) {
            // Primary succeeded, but second site had issues
            return res.status(202).send(errorMessage || 'PIN updated on SMB Gate, but not fully confirmed on SMB Clubhouse.');
        } else {
            // Primary site failed, or unknown state
            return res.status(500).send(errorMessage || 'Failed to change PIN due to an internal error.');
        }
    }
});

app.post('/get-managed-users', requireLogin, (req, res) => {
    const { email } = req.body;
    const scriptPath = './get_managed_users.sh';
    exec(`${scriptPath} "${email}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.sendStatus(500);
        }
        try {
            const users = JSON.parse(stdout);
            res.json(users);
        } catch (e) {
            console.error(`Error parsing JSON: ${e}`);
            res.sendStatus(500);
        }
    });
});

app.post('/get-license-plates', requireLogin, (req, res) => {
    const { email } = req.body;
    // console.log('Searching for email:', email);
    // Use userEmailMap for direct lookup
    const user = userEmailMap[email.toLowerCase()];
    if (user) {
        res.json(licensePlateCache[user.id] || []);
    } else {
        res.status(404).send('User not found');
    }
});

function requireLogin(req, res, next) {
    // console.log('requireLogin middleware: req.session.user =', req.session.user);
    if (req.session.user) {
        next();
    } else {
        res.redirect('/');
    }
}

// ... other routes ...

app.post('/add-license-plate', requireLogin, (req, res) => {
    const { email, plate } = req.body;
    const scriptPath = './add_license_plate.sh';
    
    const sanitizedPlate = plate.trim().toUpperCase();

    if (!/^[A-Z0-9]{1,8}$/.test(sanitizedPlate)) {
        return res.status(400).send('Invalid license plate format. Only letters and numbers are allowed, and the length must be between 1 and 8 characters.');
    }

    exec(`${scriptPath} "${email}" "${sanitizedPlate}" 2>&1`, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error for /add-license-plate: ${error.message}`);
            console.error(`exec exit code: ${error.code}`);
            console.error(`exec stdout/stderr: ${stdout}`); // stderr is now merged with stdout
            return res.status(500).send('Failed to add license plate due to internal error.');
        }
        if (stdout.includes("added successfully")) {
            console.log(`${email} added ${sanitizedPlate} as a plate`);
            logUserAction(`${email} added license plate ${sanitizedPlate}`);
        } else {
            console.log(`stdout for /add-license-plate: ${stdout}`); // Log output if not successful for debugging
        }
        fetchAndCacheData(); // Trigger cache refresh
        res.sendStatus(200);
    });
});

app.post('/remove-license-plate', requireLogin, (req, res) => {
    const { email, plate } = req.body;
    const scriptPath = './remove_license_plate.sh';
    exec(`${scriptPath} "${email}" "${plate}"`, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error.message}`);
            console.error(`exec stderr: ${stderr}`);
            return res.status(500).send('Failed to remove license plate due to internal error.');
        }
        if (stdout.includes("removed successfully")) {
            console.log(`${email} removed plate ${plate}`);
            logUserAction(`${email} removed license plate ${plate}`);
        } else {
            console.error(`Failed to remove license plate for ${email}. stdout: ${stdout}`);
        }
        fetchAndCacheData(); // Trigger cache refresh
        res.sendStatus(200);
    });
});

app.post('/api/send-invite', requireLogin, (req, res) => {
    const { email } = req.body;
    console.log(`Received request to send invite to: ${email}`);

    const user = userEmailMap[email.toLowerCase()];

    if (!user) {
        console.warn(`User with email ${email} not found in cache.`);
        return res.status(404).send('User not found. Cannot send invite.');
    }

    const userId = user.id;
    const scriptPath = path.join(__dirname, 'send_invite.sh');

    console.log(`DEBUG: __dirname is: ${__dirname}`);
    console.log(`DEBUG: Attempting to execute script at: ${__dirname}/${scriptPath}`);

    // Execute the send_invite.sh script
    exec(`${scriptPath} "${userId}" "${email}"`, { cwd: __dirname, env: { ...process.env, UNIFA_API_URL: process.env.UNIFA_API_URL, UNIFA_BEARER_TOKEN: process.env.UNIFA_BEARER_TOKEN } }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error for send_invite.sh: ${error.message}`);
            console.error(`exec exit code: ${error.code}`);
            console.error(`exec stdout: ${stdout}`);
            console.error(`exec stderr: ${stderr}`);
            return res.status(500).send('Failed to send invitation due to internal error.');
        }
        console.log(`stdout from send_invite.sh: ${stdout}`);
        if (stderr) {
            console.error(`stderr from send_invite.sh: ${stderr}`);
        }
        // Check if the script's output indicates success
        if (stdout.includes("Invitation successfully triggered.")) {
			logUserAction(`Invitation sent to ${email} for SMB Gate`);
            res.sendStatus(200);
        } else {
            // If the script exited successfully but didn't print the success message,
            // it might have failed internally or returned an unexpected response.
            res.status(500).send('Invitation script executed, but response was not successful.');
        }
    });
});

app.post('/api/send-invite-site2', requireLogin, (req, res) => {
    const { email } = req.body;
    console.log(`Received request to send invite to Site 2: ${email}`);

    const user = userEmailMap[email.toLowerCase()];

    if (!user) {
        console.warn(`User with email ${email} not found in cache for Site 2.`);
        return res.status(404).send('User not found for Site 2. Cannot send invite.');
    }

    const userId = user.id;
    const scriptPath = './send_invite_site2.sh';

    console.log(`DEBUG: __dirname for site2 is: ${__dirname}`);
    console.log(`DEBUG: Attempting to execute site2 script at: ${__dirname}/${scriptPath}`);

    // Execute the send_invite_site2.sh script
    exec(`${scriptPath} "${userId}" "${email}"`, {
        cwd: __dirname,
        env: {
            ...process.env,
            UNIFA_SITE2_API_URL: process.env.UNIFA_SITE2_API_URL,
            UNIFA_SITE2_BEARER_TOKEN: process.env.UNIFA_SITE2_BEARER_TOKEN
        }
    }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error for send_invite_site2.sh: ${error.message}`);
            console.error(`exec exit code: ${error.code}`);
            console.error(`exec stdout: ${stdout}`);
            console.error(`exec stderr: ${stderr}`);
            return res.status(500).send('Failed to send invitation to Site 2 due to internal error.');
        }
        console.log(`stdout from send_invite_site2.sh: ${stdout}`);
        if (stderr) {
            console.error(`stderr from send_invite_site2.sh: ${stderr}`);
        }
        // Check if the script's output indicates success
        if (stdout.includes("Invitation successfully triggered.")) {
            logUserAction(`Invitation sent to ${email} for SMB Clubhouse`);
            res.sendStatus(200);
        } else {
            res.status(500).send('Invitation script for Site 2 executed, but response was not successful.');
        }
    });
});

// Endpoint to get all visitors invited by the logged-in user
app.get('/api/visitors', requireLogin, async (req, res) => {
    const { email } = req.session.user;
    
    // Get the user's ID from cache
    const user = userEmailMap[email.toLowerCase()];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = user.id;
    const API_URL = process.env.UNIFA_API_URL ? `${process.env.UNIFA_API_URL}/api/v1/developer/visitors` : "https://10.10.10.1:12445/api/v1/developer/visitors";
    const AUTH_HEADER = `Authorization: Bearer ${process.env.UNIFA_BEARER_TOKEN}`;
    const command = `curl -s -k "${API_URL}" -H "${AUTH_HEADER}"`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error fetching visitors: ${error.message}`);
            console.error(`Command: ${command}`);
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: 'Failed to fetch visitors' });
        }

        try {
            const response = JSON.parse(stdout);
            // Filter visitors to only show those invited by the logged-in user
            const filteredVisitors = response.data ? response.data.filter(v => v.inviter_id === userId) : [];
            res.json({ ...response, data: filteredVisitors });
        } catch (e) {
            console.error(`Error parsing visitors JSON: ${e.message}`);
            console.error(`stdout (potentially invalid JSON): ${stdout}`);
            res.status(500).json({ error: 'Failed to parse visitors response' });
        }
    });
});

// Endpoint to get single visitor details
app.get('/api/visitors/:visitorId', requireLogin, async (req, res) => {
    const { visitorId } = req.params;
    const API_URL = process.env.UNIFA_API_URL ? `${process.env.UNIFA_API_URL}/api/v1/developer/visitors/${visitorId}` : `https://10.10.10.1:12445/api/v1/developer/visitors/${visitorId}`;
    const AUTH_HEADER = `Authorization: Bearer ${process.env.UNIFA_BEARER_TOKEN}`;
    const command = `curl -s -k "${API_URL}" -H "${AUTH_HEADER}"`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error fetching visitor ${visitorId}: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: 'Failed to fetch visitor details' });
        }

        try {
            const response = JSON.parse(stdout);
            res.json(response);
        } catch (e) {
            console.error(`Error parsing visitor JSON: ${e.message}`);
            console.error(`stdout: ${stdout}`);
            res.status(500).json({ error: 'Failed to parse visitor response' });
        }
    });
});

// Endpoint to add license plate to a visitor
app.post('/api/add-visitor-plate', requireLogin, (req, res) => {
    const { visitorId, plate } = req.body;

    if (!visitorId || !plate) {
        return res.status(400).json({ error: 'visitorId and plate are required' });
    }

    const sanitizedPlate = plate.trim().toUpperCase();

    if (!/^[A-Z0-9]{1,8}$/.test(sanitizedPlate)) {
        return res.status(400).send('Invalid license plate format. Only letters and numbers are allowed, and the length must be between 1 and 8 characters.');
    }

    const API_URL = process.env.UNIFA_API_URL ? `${process.env.UNIFA_API_URL}/api/v1/developer/visitors/${visitorId}/license-plates` : `https://10.10.10.1:12445/api/v1/developer/visitors/${visitorId}/license-plates`;
    const AUTH_HEADER = `Authorization: Bearer ${process.env.UNIFA_BEARER_TOKEN}`;
    const DATA = JSON.stringify({ credential: sanitizedPlate });
    
    const command = `curl -s -k -X POST "${API_URL}" -H "${AUTH_HEADER}" -H "Content-Type: application/json" -d '${DATA.replace(/'/g, "'\\''")}'`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error adding plate to visitor ${visitorId}: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: 'Failed to add plate to visitor' });
        }

        try {
            const response = JSON.parse(stdout);
            console.log(`Added plate ${sanitizedPlate} to visitor ${visitorId}`);
            logUserAction(`Added license plate ${sanitizedPlate} to visitor ${visitorId}`);
            res.json(response);
        } catch (e) {
            console.error(`Error parsing add plate response: ${e.message}`);
            console.error(`stdout: ${stdout}`);
            res.status(500).json({ error: 'Failed to parse add plate response' });
        }
    });
});

// Endpoint to delete a visitor
app.post('/api/delete-visitor', requireLogin, (req, res) => {
    const { visitorId } = req.body;

    if (!visitorId) {
        return res.status(400).json({ error: 'visitorId is required' });
    }

    const API_URL = process.env.UNIFA_API_URL ? `${process.env.UNIFA_API_URL}/api/v1/developer/visitors/${visitorId}` : `https://10.10.10.1:12445/api/v1/developer/visitors/${visitorId}`;
    const AUTH_HEADER = `Authorization: Bearer ${process.env.UNIFA_BEARER_TOKEN}`;
    
    const command = `curl -s -k -X DELETE "${API_URL}" -H "${AUTH_HEADER}"`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error deleting visitor ${visitorId}: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: 'Failed to delete visitor' });
        }

        console.log(`Deleted visitor ${visitorId}`);
        logUserAction(`Deleted visitor ${visitorId}`);
        res.json({ success: true, message: 'Visitor deleted successfully' });
    });
});

// Endpoint to delete a license plate from a visitor
app.post('/api/delete-visitor-plate', requireLogin, (req, res) => {
    const { visitorId, plateId } = req.body;

    if (!visitorId || !plateId) {
        return res.status(400).json({ error: 'visitorId and plateId are required' });
    }

    const API_URL = process.env.UNIFA_API_URL ? `${process.env.UNIFA_API_URL}/api/v1/developer/visitors/${visitorId}/license-plates/${plateId}` : `https://10.10.10.1:12445/api/v1/developer/visitors/${visitorId}/license-plates/${plateId}`;
    const AUTH_HEADER = `Authorization: Bearer ${process.env.UNIFA_BEARER_TOKEN}`;
    
    const command = `curl -s -k -X DELETE "${API_URL}" -H "${AUTH_HEADER}"`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error deleting plate ${plateId} from visitor ${visitorId}: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: 'Failed to delete plate from visitor' });
        }

        console.log(`Deleted plate ${plateId} from visitor ${visitorId}`);
        logUserAction(`Deleted license plate ${plateId} from visitor ${visitorId}`);
        res.json({ success: true, message: 'Plate deleted successfully' });
    });
});



