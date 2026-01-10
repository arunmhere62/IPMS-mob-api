import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getConfig() {
    const cfg = this.configService.get<Record<string, unknown>>('email') || {};
    return {
      enabled: Boolean(cfg.enabled),
      host: String(cfg.host || ''),
      port: Number(cfg.port || 587),
      secure: Boolean(cfg.secure),
      user: String(cfg.user || ''),
      pass: String(cfg.pass || ''),
      from: String(cfg.from || ''),
    };
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const cfg = this.getConfig();
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });

    return this.transporter;
  }

  async sendMail(args: SendEmailArgs) {
    const cfg = this.getConfig();

    if (!cfg.enabled) {
      this.logger.log(`EMAIL_ENABLED=false, skipping email to: ${Array.isArray(args.to) ? args.to.join(',') : args.to}`);
      return { skipped: true };
    }

    if (!cfg.from) {
      throw new Error('EMAIL_FROM is not configured');
    }

    const transporter = this.getTransporter();

    return await transporter.sendMail({
      from: cfg.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      cc: args.cc,
      bcc: args.bcc,
      replyTo: args.replyTo,
    });
  }
}
