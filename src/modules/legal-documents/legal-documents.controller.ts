import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { LegalDocumentsService } from './legal-documents.service';
import { CreateLegalDocumentDto } from './dto/create-legal-document.dto';
import { LegalDocumentQueryDto } from './dto/legal-document-query.dto';
import { UpdateLegalDocumentDto } from './dto/update-legal-document.dto';
import { AcceptLegalDocumentDto } from './dto/accept-legal-document.dto';
import { RevokeLegalAcceptanceDto } from './dto/revoke-legal-acceptance.dto';

@ApiTags('Legal Documents')
@Controller('legal-documents')
@UseGuards(HeadersValidationGuard)
export class LegalDocumentsController {
  constructor(private readonly legalDocumentsService: LegalDocumentsService) {}

  // Admin/Backoffice: create legal document
  @Post()
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Create a legal document (admin/backoffice)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'User ID performing the action' })
  @ApiHeader({ name: 'x-organization-id', required: false, description: 'Organization ID (optional)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Legal document created successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Duplicate type+version' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid headers/body' })
  async create(
    @ValidatedHeaders() headers: any,
    @Body() dto: CreateLegalDocumentDto,
  ) {
    return this.legalDocumentsService.create(headers, dto);
  }

  // Public/Authenticated: list documents
  @Get()
  @RequireHeaders()
  @ApiOperation({ summary: 'List legal documents' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by document type' })
  @ApiQuery({ name: 'is_active', required: false, description: 'Filter by active status (true/false)' })
  @ApiQuery({ name: 'organization_id', required: false, description: 'Filter by organization id' })
  @ApiQuery({ name: 'required_only', required: false, description: 'If true, return only required documents' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal documents fetched successfully' })
  async findAll(@Query() query: LegalDocumentQueryDto) {
    return this.legalDocumentsService.findAll(query);
  }

  @Get(':id')
  @RequireHeaders()
  @ApiOperation({ summary: 'Get a legal document by ID' })
  @ApiParam({ name: 'id', description: 'Legal document ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal document fetched successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Legal document not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.legalDocumentsService.findOne(id);
  }

  @Patch(':id')
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Update a legal document' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'User ID performing the action' })
  @ApiParam({ name: 'id', description: 'Legal document ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal document updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Legal document not found' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Duplicate type+version' })
  async update(
    @ValidatedHeaders() headers: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLegalDocumentDto,
  ) {
    return this.legalDocumentsService.update(headers, id, dto);
  }

  @Patch(':id/active')
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Activate or deactivate a legal document' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'User ID performing the action' })
  @ApiParam({ name: 'id', description: 'Legal document ID' })
  @ApiQuery({ name: 'value', required: true, description: 'true to activate, false to deactivate' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal document status updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Legal document not found' })
  async setActive(
    @ValidatedHeaders() headers: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('value', ParseBoolPipe) value: boolean,
  ) {
    return this.legalDocumentsService.setActive(headers, id, value);
  }

  // User: accept a specific document
  @Post(':id/accept')
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Accept a legal document (creates/updates acceptance record)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'User accepting the document' })
  @ApiHeader({ name: 'x-organization-id', required: false, description: 'Organization ID (optional)' })
  @ApiParam({ name: 'id', description: 'Legal document ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal document accepted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Active legal document not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Missing headers or invalid org/document' })
  async accept(
    @ValidatedHeaders() headers: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptLegalDocumentDto,
  ) {
    return this.legalDocumentsService.accept(headers, id, dto);
  }

  // User: revoke a specific acceptance
  @Post(':id/revoke')
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Revoke acceptance of a legal document' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'User revoking acceptance' })
  @ApiParam({ name: 'id', description: 'Legal document ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal acceptance revoked successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Acceptance record not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Missing headers/body' })
  async revoke(
    @ValidatedHeaders() headers: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevokeLegalAcceptanceDto,
  ) {
    return this.legalDocumentsService.revoke(headers, id, dto.reason);
  }

  // User: check whether they have accepted all currently required docs
  @Get('required/status')
  @RequireHeaders()
  @ApiOperation({ summary: 'Get user acceptance status for all currently required legal documents' })
  @ApiHeader({ name: 'x-user-id', required: false, description: 'User to check acceptance for (required except SIGNUP context)' })
  @ApiHeader({ name: 'x-organization-id', required: false, description: 'Organization scope (optional)' })
  @ApiQuery({ name: 'context', required: false, description: 'Optional context label (SIGNUP/LOGIN/INVOICE/etc) returned back in response' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Legal acceptance status fetched successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Missing x-user-id' })
  async requiredStatus(
    @ValidatedHeaders() headers: any,
    @Query('context') context?: string,
  ) {
    return this.legalDocumentsService.requiredStatus(headers, context);
  }
}
