import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { LeadCaptureDto } from './lead-capture.dto';

@Injectable()
export class LeadCaptureService {
  private readonly logger = new Logger(LeadCaptureService.name);

  constructor(private readonly emailService: EmailService) {}

  async submitLead(dto: LeadCaptureDto) {
    const subject = `New Lead from Website: ${dto.name} (+91${dto.phone})`;
    const text = [
      `New lead captured from the website popup.`,
      ``,
      `Name: ${dto.name}`,
      `Phone: +91${dto.phone}`,
      dto.message ? `Message: ${dto.message}` : '',
      ``,
      `Timestamp: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    const html = `
      <h2>New Lead from Website</h2>
      <table style="border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 12px; font-weight:600;">Name</td><td>${dto.name}</td></tr>
        <tr><td style="padding:4px 12px; font-weight:600;">Phone</td><td>+91${dto.phone}</td></tr>
        ${dto.message ? `<tr><td style="padding:4px 12px; font-weight:600;">Message</td><td>${dto.message}</td></tr>` : ''}
        <tr><td style="padding:4px 12px; font-weight:600;">Timestamp</td><td>${new Date().toISOString()}</td></tr>
      </table>`;

    const ownerEmail = 'indianpgmanagement@gmail.com';

    try {
      await this.emailService.sendMail({
        to: ownerEmail,
        subject,
        text,
        html,
      });

      this.logger.log(`Lead captured: ${dto.name} (+91${dto.phone}) — notified ${ownerEmail}`);
    } catch (err) {
      this.logger.error(`Failed to send lead notification email: ${err}`);
    }

    return ResponseUtil.success(
      { received: true },
      'Thank you! We will contact you soon.',
    );
  }
}
