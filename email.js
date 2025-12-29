const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email', // Use environment variable or default
    port: process.env.EMAIL_PORT || 587, // Use environment variable or default
    secure: process.env.EMAIL_SECURE === 'true', // Use environment variable for secure connection (e.g., SMTPS)
    auth: {
        user: process.env.EMAIL_USER || 'reyna.marvin@ethereal.email', // Use environment variable or default
        pass: process.env.EMAIL_PASS || 'g3tZp4xGk2Jxq1fBnp' // Use environment variable or default
    }
});

async function sendVerificationCode(email, code) {
    console.log(`Sending verification code ${code} to ${email}`);
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Gate CLI" <noreply@gate.com>',
        to: email,
        subject: 'Your verification code',
        text: `Your verification code is: ${code}\n\nThis is an auto-generated email. Replying to this email will go to a folder that is not monitored.`,
        html: `<p>Your verification code is: <strong>${code}</strong></p><br><p><small>This is an auto-generated email. Replying to this email will go to a folder that is not monitored.</small></p>`, // Added HTML version
    });
    console.log(`Verification code ${code} sent to ${email}`);
}

module.exports = { sendVerificationCode };
