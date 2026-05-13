import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly appUrl: string;
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    this.fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL', 'noreply@invapp.com');
    this.fromName = this.configService.get<string>('SMTP_FROM_NAME', 'InvApp');
    this.appUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:4200';

    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    this.isConfigured = !!(smtpHost && smtpUser && smtpPass);

    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort || 587,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log('Email service configured successfully');
    } else {
      this.logger.warn(
        'Email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env',
      );
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      this.logger.warn(`Email not sent (not configured): ${options.subject} to ${options.to}`);
      // In development, log the email content
      if (this.configService.get('NODE_ENV') === 'development') {
        this.logger.debug(`Email content:\n${options.text || options.html}`);
      }
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });
      this.logger.log(`Email sent: ${options.subject} to ${options.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return false;
    }
  }

  async sendEmailWithAttachment(options: EmailOptions): Promise<boolean> {
    return this.sendEmail(options);
  }

  async sendPasswordResetEmail(email: string, token: string, userName?: string): Promise<boolean> {
    const resetUrl = `${this.appUrl}/reset-password/${token}`;
    const name = userName || email.split('@')[0];

    const html = this.getPasswordResetTemplate(name, resetUrl);
    const text = `
Hello ${name},

You requested a password reset for your InvApp account.

Click this link to reset your password: ${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.

Best regards,
The InvApp Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: 'Reset Your InvApp Password',
      html,
      text,
    });
  }

  async sendWelcomeEmail(email: string, userName?: string): Promise<boolean> {
    const name = userName || email.split('@')[0];
    const loginUrl = `${this.appUrl}/login`;

    const html = this.getWelcomeTemplate(name, loginUrl);
    const text = `
Welcome to InvApp, ${name}!

Your account has been created successfully.

You can log in at: ${loginUrl}

Best regards,
The InvApp Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: 'Welcome to InvApp!',
      html,
      text,
    });
  }

  async sendPasswordChangedEmail(email: string, userName?: string): Promise<boolean> {
    const name = userName || email.split('@')[0];

    const html = this.getPasswordChangedTemplate(name);
    const text = `
Hello ${name},

Your InvApp password has been successfully changed.

If you didn't make this change, please contact support immediately.

Best regards,
The InvApp Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: 'Your InvApp Password Has Been Changed',
      html,
      text,
    });
  }

  // ============================================
  // Email Templates
  // ============================================

  private getBaseTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InvApp</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      background-color: #4d7c6f;
      color: white;
      width: 60px;
      height: 60px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .brand {
      font-size: 24px;
      font-weight: bold;
      color: #4d7c6f;
    }
    h1 {
      color: #333;
      font-size: 22px;
      margin-bottom: 20px;
    }
    p {
      margin-bottom: 15px;
      color: #555;
    }
    .button {
      display: inline-block;
      background-color: #4d7c6f;
      color: white !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #3d6a5f;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    .warning {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 6px;
      padding: 12px;
      margin: 15px 0;
      font-size: 14px;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">📦</div>
      <div class="brand">InvApp</div>
    </div>
    ${content}
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} InvApp. All rights reserved.</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private getPasswordResetTemplate(name: string, resetUrl: string): string {
    const content = `
    <h1>Reset Your Password</h1>
    <p>Hello ${name},</p>
    <p>We received a request to reset your password for your InvApp account.</p>
    <p>Click the button below to create a new password:</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </p>
    <div class="warning">
      ⏰ This link will expire in <strong>1 hour</strong>.
    </div>
    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    <p style="font-size: 12px; color: #999;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #4d7c6f;">${resetUrl}</a>
    </p>
    `;
    return this.getBaseTemplate(content);
  }

  private getWelcomeTemplate(name: string, loginUrl: string): string {
    const content = `
    <h1>Welcome to InvApp! 🎉</h1>
    <p>Hello ${name},</p>
    <p>Thank you for joining InvApp! Your account has been created successfully.</p>
    <p>With InvApp, you can:</p>
    <ul>
      <li>📦 Manage your inventory efficiently</li>
      <li>🏭 Track items across multiple warehouses</li>
      <li>📊 Generate detailed reports</li>
      <li>🔄 Handle transfers and loans</li>
    </ul>
    <p style="text-align: center;">
      <a href="${loginUrl}" class="button">Log In to Your Account</a>
    </p>
    <p>If you have any questions, feel free to reach out to our support team.</p>
    `;
    return this.getBaseTemplate(content);
  }

  private getPasswordChangedTemplate(name: string): string {
    const content = `
    <h1>Password Changed Successfully</h1>
    <p>Hello ${name},</p>
    <p>Your InvApp password has been successfully changed.</p>
    <div class="warning">
      ⚠️ If you didn't make this change, please contact support immediately and secure your account.
    </div>
    <p>For your security, all your active sessions have been logged out.</p>
    `;
    return this.getBaseTemplate(content);
  }
}
