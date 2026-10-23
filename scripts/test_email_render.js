const { chromium } = require('playwright');
const fs = require('fs');

function generateEmailHtml({ otp_code, expires_in_minutes, reset_link, logo_src, lock_src, app_url }) {
    const digits = String(otp_code || '143249').split('');
    const codeBoxesHtml = digits.map(d => `
        <td align="center" valign="middle" style="padding: 0 3px;">
            <div class="code-digit-box" style="width: 44px; height: 54px; line-height: 54px; background-color: #ffffff; border: 1.2px solid #ded6fa; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'SF Pro Display', Monaco, monospace; font-size: 30px; font-weight: 800; color: #3730a3; text-align: center; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.07);">
                ${d}
            </div>
        </td>
    `).join('');

    const resetBtnHtml = reset_link ? `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 26px auto 14px auto;">
            <tr>
                <td align="center" style="border-radius: 32px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 50%, #7c3aed 100%); background-color: #7c3aed; box-shadow: 0 10px 28px rgba(109, 40, 217, 0.38);">
                    <a href="${reset_link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 16px 42px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 32px; letter-spacing: 0.3px; white-space: nowrap;">
                        <span style="font-size: 15px; margin-right: 8px;">&#128274;</span>Reset Password<span style="font-size: 16px; margin-left: 8px;">&rarr;</span>
                    </a>
                </td>
            </tr>
        </table>
        <div style="margin: 0 auto 24px auto; max-width: 460px; text-align: center; word-break: break-all; overflow-wrap: break-word; padding: 0 8px;">
            <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #94a3b8;">
                Can't click the button? Copy and paste this link:
            </span>
            <br/>
            <a href="${reset_link}" target="_blank" rel="noopener noreferrer" style="color: #6366f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; word-break: break-all; text-decoration: underline; line-height: 1.4;">
                ${reset_link}
            </a>
        </div>
    ` : '';

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset your FRANK Think password</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td, h1, p, a { font-family: Segoe UI, Arial, sans-serif !important; }
    </style>
    <![endif]-->
    <style type="text/css">
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        @media only screen and (max-width: 580px) {
            .email-outer-table { padding: 16px 6px !important; }
            .email-container { width: 100% !important; border-radius: 20px !important; }
            .card-padding { padding: 22px 16px !important; }
            .header-table tr, .header-table td { display: block !important; width: 100% !important; text-align: left !important; }
            .header-badge-col { margin-top: 10px !important; }
            .header-badge-table { float: left !important; margin: 0 !important; }
            .hero-col { display: block !important; width: 100% !important; max-width: 100% !important; }
            .hero-lock-col { display: block !important; width: 100% !important; max-width: 100% !important; text-align: center !important; margin: 12px auto !important; }
            .hero-title { font-size: 25px !important; line-height: 1.18 !important; }
            .code-digit-box { width: 38px !important; height: 48px !important; line-height: 48px !important; font-size: 26px !important; }
            .footer-col { display: block !important; width: 100% !important; text-align: center !important; }
            .footer-social-table { float: none !important; margin: 12px auto 0 auto !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ece8f9; background: radial-gradient(circle at 85% 15%, #e6dcfd 0%, #f6f3fc 45%, #ede6fa 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6;">

    <!-- Wrapper Table -->
    <table role="presentation" class="email-outer-table" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ece8f9; padding: 36px 12px;">
        <tr>
            <td align="center">
                <!-- Main Glassmorphic Card -->
                <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 32px; border: 1px solid #ebe4f9; box-shadow: 0 20px 60px rgba(124, 58, 237, 0.09), 0 2px 8px rgba(0, 0, 0, 0.02); overflow: hidden;">
                    <tr>
                        <td class="card-padding" style="padding: 38px 38px 30px 38px;">
                            
                            <!-- Header Table: Logo on Left, Security Badge on Right -->
                            <table role="presentation" class="header-table" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td valign="middle">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="vertical-align: middle; padding-right: 12px;">
                                                    <img src="${logo_src}" width="40" height="40" alt="FRANK" style="display: block; width: 40px; height: 40px; border-radius: 10px;" />
                                                </td>
                                                <td style="vertical-align: middle;">
                                                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 23px; font-weight: 900; color: #0f172a; letter-spacing: 0.6px; line-height: 1;">FRANK</span><span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 23px; font-weight: 700; color: #f97316; letter-spacing: 0.6px; line-height: 1; margin-left: 4px;">Think</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td valign="middle" align="right" class="header-badge-col">
                                        <table role="presentation" class="header-badge-table" cellspacing="0" cellpadding="0" border="0" align="right" style="border: 1px solid #ddd6fe; background-color: #ffffff; border-radius: 20px; padding: 5px 12px; box-shadow: 0 1px 3px rgba(124, 58, 237, 0.05);">
                                            <tr>
                                                <td style="vertical-align: middle; padding-right: 6px; font-size: 13px; color: #6366f1;">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                                        <path d="M9 12l2 2 4-4"></path>
                                                    </svg>
                                                </td>
                                                <td style="vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 700; color: #6366f1; white-space: nowrap; letter-spacing: 0.2px;">
                                                    Your Account Security
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Hero Section: Title/Subtitle on Left, 3D Lock Illustration on Right -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 18px;">
                                <tr>
                                    <td class="hero-col" width="315" valign="middle">
                                        <p style="margin: 12px 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #6366f1; text-transform: uppercase;">PASSWORD RESET REQUEST &#8212;</p>
                                        <h1 class="hero-title" style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 30px; font-weight: 900; line-height: 1.15; color: #0f172a; letter-spacing: -0.5px;">
                                            Reset your<br/>
                                            <span style="color: #4338ca;">FRANK Think</span><br/>
                                            password
                                        </h1>
                                        <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.55; color: #64748b;">
                                            We received a request to reset your FRANK Think password. Use the verification code below to continue.
                                        </p>
                                    </td>
                                    <td class="hero-lock-col" width="195" valign="middle" align="right">
                                        <img src="${lock_src}" width="190" height="185" alt="Security Lock" style="display: block; width: 190px; height: auto; max-width: 100%; border-radius: 16px;" />
                                    </td>
                                </tr>
                            </table>

                            <!-- Verification Code Panel -->
                            <div style="margin: 28px 0 20px 0; background: linear-gradient(180deg, #fbfaff 0%, #f4f0fd 100%); background-color: #f7f4fe; border: 1.5px solid #e1d8fa; border-radius: 22px; padding: 24px 14px 20px 14px; text-align: center; box-shadow: 0 4px 18px rgba(124, 58, 237, 0.05);">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #7c3aed; text-transform: uppercase; margin-bottom: 16px;">
                                    YOUR VERIFICATION CODE
                                </div>
                                
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                                    <tr>
                                        ${codeBoxesHtml}
                                    </tr>
                                </table>
                                
                                <div style="margin-top: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #64748b;">
                                    This code will expire in <strong style="color: #4338ca; font-weight: 800;">${expires_in_minutes} minutes</strong>.
                                </div>
                            </div>

                            <!-- Reset Password Button -->
                            ${resetBtnHtml}

                            <!-- Security Notices -->
                            <!-- Notice 1 -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8f6fe; border: 1px solid #ebe5f8; border-radius: 14px; padding: 13px 16px; margin-bottom: 12px;">
                                <tr>
                                    <td width="36" valign="middle" style="padding-right: 12px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 32px; height: 32px; background-color: #ede9fe; border-radius: 50%;">
                                            <tr>
                                                <td align="center" valign="middle" style="font-size: 15px; color: #6366f1;">
                                                    &#9201;
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td valign="middle" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #64748b;">
                                        <strong style="color: #1e1b4b; display: block; font-size: 12px;">This code will expire in <span style="color: #4338ca;">${expires_in_minutes} minutes</span>.</strong>
                                        <span>For your security, never share this code with anyone.</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Notice 2 -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding: 6px 12px 18px 12px;">
                                <tr>
                                    <td width="32" valign="middle" style="padding-right: 10px;">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                            <path d="M9 12l2 2 4-4"></path>
                                        </svg>
                                    </td>
                                    <td valign="middle" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #64748b;">
                                        <strong style="color: #4338ca; display: block; font-size: 12px;">If you did not request this email, no further action is required.</strong>
                                        <span>Your FRANK Think account remains secure.</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Footer -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top: 1px solid #ede8fa; padding-top: 22px;">
                                <tr>
                                    <td valign="middle" class="footer-col">
                                        <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 600; color: #64748b;">
                                            &copy; 2026 FRANK Think.
                                        </p>
                                        <p style="margin: 3px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #94a3b8;">
                                            Engineered for effortless, secure communication.
                                        </p>
                                    </td>
                                    <td valign="middle" align="right" class="footer-col">
                                        <table role="presentation" class="footer-social-table" cellspacing="0" cellpadding="0" border="0" align="right">
                                            <tr>
                                                <td style="padding-left: 6px;">
                                                    <a href="${app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 11px; font-weight: 700;" title="LinkedIn">in</a>
                                                </td>
                                                <td style="padding-left: 6px;">
                                                    <a href="${app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 11px; font-weight: 700;" title="X (Twitter)">&#120143;</a>
                                                </td>
                                                <td style="padding-left: 6px;">
                                                    <a href="${app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 11px; font-weight: 700;" title="YouTube">&#9654;</a>
                                                </td>
                                                <td style="padding-left: 6px;">
                                                    <a href="${app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 13px; font-weight: 700;" title="Website">&#127760;</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

</body>
</html>`;
}

async function run() {
    const logoBase64 = 'data:image/png;base64,' + fs.readFileSync('frontend/assets/brand/frank-icon.png').toString('base64');
    const lockBase64 = 'data:image/png;base64,' + fs.readFileSync('frontend/assets/brand/security-lock.png').toString('base64');
    
    const html = generateEmailHtml({
        otp_code: '143249',
        expires_in_minutes: 15,
        reset_link: 'http://localhost:8000/reset-password.html?email=test%40example.com&token=sample_token',
        logo_src: logoBase64,
        lock_src: lockBase64,
        app_url: 'http://localhost:8000'
    });

    fs.writeFileSync('scratch/email_preview.html', html);

    const browser = await chromium.launch();
    
    // Mobile screenshot (iPhone width 375)
    const pageMobile = await browser.newPage({ viewport: { width: 375, height: 1200 } });
    await pageMobile.setContent(html);
    await pageMobile.screenshot({ path: 'scratch/email_mobile.png' });

    await browser.close();
}

run().catch(console.error);
