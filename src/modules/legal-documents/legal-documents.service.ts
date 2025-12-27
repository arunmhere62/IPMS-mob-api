import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateLegalDocumentDto } from './dto/create-legal-document.dto';
import { LegalDocumentQueryDto } from './dto/legal-document-query.dto';
import { UpdateLegalDocumentDto } from './dto/update-legal-document.dto';
import { AcceptLegalDocumentDto } from './dto/accept-legal-document.dto';
import { SIGNUP_REQUIRED_LEGAL_DOCUMENT_TYPES } from './legal-documents.constants';

@Injectable()
export class LegalDocumentsService {
  constructor(private prisma: PrismaService) {}

  async create(headers: { organization_id?: number; user_id?: number }, dto: CreateLegalDocumentDto) {
    if (dto.organization_id === undefined) {
      dto.organization_id = headers.organization_id;
    }

    const existing = await this.prisma.legal_documents.findFirst({
      where: {
        type: dto.type,
        version: dto.version,
      },
    });

    if (existing) {
      throw new ConflictException('Legal document with same type and version already exists');
    }

    const created = await this.prisma.legal_documents.create({
      data: {
        type: dto.type,
        title: dto.title,
        version: dto.version,
        url: dto.url,
        is_active: dto.is_active ?? true,
        is_required: dto.is_required ?? true,
        effective_date: dto.effective_date ? new Date(dto.effective_date) : new Date(),
        expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
        organization_id: dto.organization_id ?? null,
        created_by: headers.user_id ?? null,
        updated_by: headers.user_id ?? null,
      },
    });

    return ResponseUtil.created(created, 'Legal document created successfully');
  }

  async findAll(query: LegalDocumentQueryDto) {
    const {
      page = 1,
      limit = 10,
      type,
      is_active,
      organization_id,
      required_only = false,
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};
    if (type) where.type = type;
    if (is_active !== undefined) where.is_active = is_active;
    if (required_only) where.is_required = true;
    if (organization_id !== undefined) where.organization_id = organization_id;

    const [items, total] = await Promise.all([
      this.prisma.legal_documents.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          effective_date: 'desc',
        },
      }),
      this.prisma.legal_documents.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit, 'Legal documents fetched successfully');
  }

  async findOne(id: number) {
    const doc = await this.prisma.legal_documents.findUnique({
      where: { s_no: id },
    });

    if (!doc) throw new NotFoundException('Legal document not found');

    return ResponseUtil.success(doc, 'Legal document fetched successfully');
  }

  async update(headers: { user_id?: number }, id: number, dto: UpdateLegalDocumentDto) {
    const existing = await this.prisma.legal_documents.findUnique({
      where: { s_no: id },
    });

    if (!existing) throw new NotFoundException('Legal document not found');

    if (dto.type || dto.version) {
      const dup = await this.prisma.legal_documents.findFirst({
        where: {
          type: dto.type ?? existing.type,
          version: dto.version ?? existing.version,
          s_no: { not: id },
        },
      });

      if (dup) {
        throw new ConflictException('Legal document with same type and version already exists');
      }
    }

    const updated = await this.prisma.legal_documents.update({
      where: { s_no: id },
      data: {
        type: dto.type,
        title: dto.title,
        version: dto.version,
        url: dto.url,
        is_active: dto.is_active,
        is_required: dto.is_required,
        effective_date: dto.effective_date ? new Date(dto.effective_date) : undefined,
        expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : dto.expiry_date === null ? null : undefined,
        organization_id: dto.organization_id,
        updated_by: headers.user_id ?? null,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.success(updated, 'Legal document updated successfully');
  }

  async setActive(headers: { user_id?: number }, id: number, isActive: boolean) {
    const existing = await this.prisma.legal_documents.findUnique({
      where: { s_no: id },
    });

    if (!existing) throw new NotFoundException('Legal document not found');

    const updated = await this.prisma.legal_documents.update({
      where: { s_no: id },
      data: {
        is_active: isActive,
        updated_by: headers.user_id ?? null,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.success(updated, 'Legal document status updated successfully');
  }

  async accept(
    headers: { user_id?: number; organization_id?: number },
    legalDocumentId: number,
    dto: AcceptLegalDocumentDto,
  ) {
    if (!headers.user_id) throw new BadRequestException('Missing x-user-id header');

    const doc = await this.prisma.legal_documents.findUnique({
      where: { s_no: legalDocumentId },
    });

    if (!doc || !doc.is_active) {
      throw new NotFoundException('Active legal document not found');
    }

    // Optional safety: if doc is org-specific, enforce same org
    if (doc.organization_id && headers.organization_id && doc.organization_id !== headers.organization_id) {
      throw new BadRequestException('Legal document does not belong to your organization');
    }

    // Upsert acceptance (unique user_id + legal_document_id)
    const acceptance = await this.prisma.user_legal_acceptance.upsert({
      where: {
        user_id_legal_document_id: {
          user_id: headers.user_id,
          legal_document_id: legalDocumentId,
        },
      },
      update: {
        acceptance_context: dto.acceptance_context ?? 'SIGNUP',
        ip_address: dto.ip_address ?? null,
        user_agent: dto.user_agent ?? null,
        is_active: true,
        revoked_at: null,
        revoked_reason: null,
        updated_by: headers.user_id,
        updated_at: new Date(),
      },
      create: {
        user_id: headers.user_id,
        legal_document_id: legalDocumentId,
        acceptance_context: dto.acceptance_context ?? 'SIGNUP',
        ip_address: dto.ip_address ?? null,
        user_agent: dto.user_agent ?? null,
        is_active: true,
        created_by: headers.user_id,
        updated_by: headers.user_id,
      },
    });

    return ResponseUtil.success(acceptance, 'Legal document accepted successfully');
  }

  async revoke(headers: { user_id?: number }, legalDocumentId: number, reason?: string) {
    if (!headers.user_id) throw new BadRequestException('Missing x-user-id header');

    const existing = await this.prisma.user_legal_acceptance.findUnique({
      where: {
        user_id_legal_document_id: {
          user_id: headers.user_id,
          legal_document_id: legalDocumentId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Acceptance record not found');
    }

    const updated = await this.prisma.user_legal_acceptance.update({
      where: {
        user_id_legal_document_id: {
          user_id: headers.user_id,
          legal_document_id: legalDocumentId,
        },
      },
      data: {
        is_active: false,
        revoked_at: new Date(),
        revoked_reason: reason ?? null,
        updated_by: headers.user_id,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.success(updated, 'Legal acceptance revoked successfully');
  }

  async requiredStatus(headers: { user_id?: number; organization_id?: number }, context?: string) {
    const normalizedContext = (context ?? '').toUpperCase();
    const isSignupContext = normalizedContext === 'SIGNUP';

    if (!headers.user_id && !isSignupContext) {
      throw new BadRequestException('Missing x-user-id header');
    }

    const now = new Date();

    const requiredDocs = await this.prisma.legal_documents.findMany({
      where: {
        is_active: true,
        is_required: true,
        effective_date: { lte: now },
        OR: [
          { expiry_date: null },
          { expiry_date: { gt: now } },
        ],
        ...(isSignupContext ? { type: { in: SIGNUP_REQUIRED_LEGAL_DOCUMENT_TYPES } } : {}),
        // If you pass organization_id, return org-specific docs + global docs
        ...(headers.organization_id
          ? {
              OR: [
                { organization_id: null },
                { organization_id: headers.organization_id },
              ],
            }
          : {}),
      } as any,
      orderBy: {
        effective_date: 'desc',
      },
    });

    if (!headers.user_id && isSignupContext) {
      return ResponseUtil.success(
        {
          context: context ?? null,
          required: requiredDocs,
          accepted: [],
          pending: requiredDocs,
          is_all_accepted: false,
        },
        'Legal acceptance status fetched successfully',
      );
    }

    const acceptances = await this.prisma.user_legal_acceptance.findMany({
      where: {
        user_id: headers.user_id,
        is_active: true,
      },
      select: {
        legal_document_id: true,
        accepted_at: true,
        acceptance_context: true,
      },
    });

    const acceptedSet = new Set(acceptances.map(a => a.legal_document_id));

    const pending = requiredDocs.filter(d => !acceptedSet.has(d.s_no));

    return ResponseUtil.success(
      {
        context: context ?? null,
        required: requiredDocs,
        accepted: acceptances,
        pending,
        is_all_accepted: pending.length === 0,
      },
      'Legal acceptance status fetched successfully',
    );
  }
}
