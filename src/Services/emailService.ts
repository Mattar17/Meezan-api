import nodemailer from "nodemailer";
import "dotenv/config";
import logger from "../utils/logger.js";

const DEFAULT_GMAIL_USER = "mattarvalo@gmail.com";

export const createEmailTransporter = () => {
  const user = (process.env.GMAIL_USER?.trim()) || DEFAULT_GMAIL_USER;
  const pass = process.env.GMAIL_PASSKEY?.trim();

  if (!pass) {
    logger.error("[EmailService] GMAIL_PASSKEY is not configured in environment variables.");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });
};

interface SendOtpEmailOptions {
  to: string;
  name?: string;
  code: string;
  expiresInMinutes?: number;
}

export const sendPasswordResetOtpEmail = async ({
  to,
  name,
  code,
  expiresInMinutes = 10,
}: SendOtpEmailOptions): Promise<boolean> => {
  try {
    const transporter = createEmailTransporter();
    const senderEmail = (process.env.GMAIL_USER?.trim()) || DEFAULT_GMAIL_USER;
    const recipientName = name?.trim() ? name.trim() : "عزيزنا المحامي";

    const formattedCode = code.trim();

    const subject = `رمز التحقق لإعادة تعيين كلمة المرور: ${formattedCode} | Meezan`;

    const textContent = `
مرحباً ${recipientName}،

تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في تطبيق ميزان (Meezan).
رمز التحقق الخاص بك هو: ${formattedCode}

هذا الرمز صالح لمدة ${expiresInMinutes} دقائق فقط.
إذا لم تقم بطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد الإلكتروني.

---
Hello ${recipientName},
We received a request to reset the password for your Meezan account.
Your verification code is: ${formattedCode}
This code is valid for ${expiresInMinutes} minutes. If you did not request this, please ignore this email.
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رمز استعادة كلمة المرور</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 40px 15px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 32px 24px;
      text-align: center;
      border-bottom: 4px solid #b89355;
    }
    .brand-title {
      color: #ffffff;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .brand-subtitle {
      color: #b89355;
      font-size: 13px;
      font-weight: 600;
      margin-top: 6px;
      letter-spacing: 0.5px;
    }
    .content {
      padding: 36px 32px;
      line-height: 1.7;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 14px;
    }
    .description {
      font-size: 15px;
      color: #475569;
      margin-bottom: 26px;
    }
    .code-container {
      background: #faf7f2;
      border: 2px dashed #b89355;
      border-radius: 12px;
      padding: 24px 16px;
      text-align: center;
      margin: 24px 0;
    }
    .code-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #855d1d;
      margin-bottom: 8px;
    }
    .code-digits {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 38px;
      font-weight: 800;
      letter-spacing: 10px;
      color: #0f172a;
      direction: ltr;
      display: inline-block;
      padding-left: 10px;
      user-select: all;
    }
    .info-box {
      background-color: #f8fafc;
      border-radius: 8px;
      padding: 14px 18px;
      margin-top: 24px;
      border-right: 4px solid #3b82f6;
    }
    .info-text {
      font-size: 13px;
      color: #475569;
      margin: 0;
    }
    .security-notice {
      background-color: #fffbeb;
      border-radius: 8px;
      padding: 14px 18px;
      margin-top: 14px;
      border-right: 4px solid #f59e0b;
    }
    .security-text {
      font-size: 13px;
      color: #92400e;
      margin: 0;
    }
    .divider {
      height: 1px;
      background-color: #e2e8f0;
      margin: 30px 0 24px;
    }
    .en-section {
      direction: ltr;
      text-align: left;
      font-size: 13px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer {
      background-color: #f8fafc;
      padding: 22px 24px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
    }
    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="brand-title">ميزان • Meezan</h1>
        <div class="brand-subtitle">نظام إدارة المحاماة والقضايا الذكي</div>
      </div>
      
      <div class="content">
        <div class="greeting">مرحباً ${recipientName}،</div>
        <p class="description">
          تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في تطبيق ميزان. استخدم رمز التحقق التالي لتأكيد هويتك ومتابعة تغيير كلمة المرور:
        </p>

        <div class="code-container">
          <div class="code-label">رمز التحقق الخاص بك (OTP)</div>
          <div class="code-digits">${formattedCode}</div>
        </div>

        <div class="info-box">
          <p class="info-text">
            ⏱️ <strong>صلاحية الرمز:</strong> هذا الرمز صالح لمدة <strong>${expiresInMinutes} دقائق</strong> فقط من وقت الإرسال.
          </p>
        </div>

        <div class="security-notice">
          <p class="security-text">
            🔒 <strong>ملاحظة أمنية:</strong> لا تشارك هذا الرمز مع أي شخص. إذا لم تكن قد طلبت استعادة كلمة المرور، يرجى تجاهل هذه الرسالة لحماية حسابك.
          </p>
        </div>

        <div class="divider"></div>

        <div class="en-section">
          <p style="margin: 0 0 6px 0;"><strong>Password Reset Request</strong></p>
          <p style="margin: 0;">
            Use the verification code above to complete your password reset on Meezan. It will expire in ${expiresInMinutes} minutes. If you did not make this request, please safely ignore this email.
          </p>
        </div>
      </div>

      <div class="footer">
        <p>© ${new Date().getFullYear()} ميزان (Meezan). جميع الحقوق محفوظة.</p>
        <p>رسالة آلية تم إنشاؤها لحماية أمان حسابك.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    const mailOptions = {
      from: `"ميزان | Meezan" <${senderEmail}>`,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`[EmailService] OTP email sent successfully to ${to}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailService Error] Failed to send OTP email to ${to}: ${errorMessage}`);
    throw error;
  }
};
