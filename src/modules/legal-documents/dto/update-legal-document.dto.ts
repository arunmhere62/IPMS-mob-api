import { PartialType } from '@nestjs/swagger';
import { CreateLegalDocumentDto } from './create-legal-document.dto';

export class UpdateLegalDocumentDto extends PartialType(CreateLegalDocumentDto) {}
