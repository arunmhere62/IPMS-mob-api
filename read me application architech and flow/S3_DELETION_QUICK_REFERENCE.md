# S3 Deletion Service - Quick Reference

## Service Location
`/api/src/modules/common/s3-deletion.service.ts`

## Available Methods

### 1. deleteRemovedFiles()
**Use Case:** When updating an entity and some files were removed

**Signature:**
```typescript
async deleteRemovedFiles(
  oldFiles: string[],
  newFiles: string[],
  entityType: string = 'entity',
  fileType: string = 'files',
): Promise<string[]>
```

**Example - Tenant Update:**
```typescript
if (updateTenantDto.images !== undefined) {
  const oldImages = (Array.isArray(existingTenant.images) ? existingTenant.images : []) as string[];
  const newImages = (Array.isArray(updateTenantDto.images) ? updateTenantDto.images : []) as string[];
  
  await this.s3DeletionService.deleteRemovedFiles(
    oldImages,
    newImages,
    'tenant',
    'images',
  );
}
```

**Example - Room Update:**
```typescript
if (updateRoomDto.images !== undefined) {
  const oldImages = (Array.isArray(existingRoom.images) ? existingRoom.images : []) as string[];
  const newImages = (Array.isArray(updateRoomDto.images) ? updateRoomDto.images : []) as string[];
  
  await this.s3DeletionService.deleteRemovedFiles(
    oldImages,
    newImages,
    'room',
    'images',
  );
}
```

### 2. deleteAllFiles()
**Use Case:** When deleting an entity and all its files should be removed from S3

**Signature:**
```typescript
async deleteAllFiles(
  files: string[],
  entityType: string = 'entity',
  fileType: string = 'files',
): Promise<string[]>
```

**Example - Room Deletion:**
```typescript
if (existingRoom.images && Array.isArray(existingRoom.images) && existingRoom.images.length > 0) {
  const roomImages = (existingRoom.images as string[]);
  await this.s3DeletionService.deleteAllFiles(
    roomImages,
    'room',
    'images',
  );
}
```

### 3. extractS3KeyFromUrl()
**Use Case:** Extract S3 key from a full S3 URL (internal utility)

**Signature:**
```typescript
extractS3KeyFromUrl(url: string): string | null
```

**Example:**
```typescript
const key = this.s3DeletionService.extractS3KeyFromUrl(
  'https://bucket.s3.region.amazonaws.com/path/to/file.jpg'
);
// Returns: 'path/to/file.jpg'
```

## Setup Steps

### Step 1: Import CommonModule in Your Module
```typescript
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  // ...
})
export class YourModule {}
```

### Step 2: Inject S3DeletionService
```typescript
import { S3DeletionService } from '../common/s3-deletion.service';

@Injectable()
export class YourService {
  constructor(
    private s3DeletionService: S3DeletionService,
  ) {}
}
```

### Step 3: Use the Service
```typescript
// For UPDATE operations
await this.s3DeletionService.deleteRemovedFiles(
  oldFiles,
  newFiles,
  'your-entity-type',
  'your-file-type',
);

// For DELETE operations
await this.s3DeletionService.deleteAllFiles(
  files,
  'your-entity-type',
  'your-file-type',
);
```

## Entity Types (Examples)
- `'room'`
- `'tenant'`
- `'bed'`
- `'employee'`
- `'visitor'`

## File Types (Examples)
- `'images'`
- `'documents'`
- `'proof documents'`
- `'profile pictures'`

## Error Handling

The service automatically throws `BadRequestException` if S3 deletion fails:

```typescript
try {
  await this.s3DeletionService.deleteRemovedFiles(
    oldImages,
    newImages,
    'tenant',
    'images',
  );
} catch (error) {
  // Error is automatically thrown as BadRequestException
  // with descriptive message
}
```

## What Gets Deleted

### deleteRemovedFiles()
- Only deletes files that were in `oldFiles` but NOT in `newFiles`
- Only processes S3 URLs (checks for `amazonaws.com`)
- Ignores empty strings and null values
- Returns array of deleted S3 keys

### deleteAllFiles()
- Deletes all files in the provided array
- Only processes S3 URLs (checks for `amazonaws.com`)
- Ignores empty strings and null values
- Returns array of deleted S3 keys

## Logging Output

All operations produce console logs:

```
Deleting removed tenant images from S3: ['path/to/image1.jpg', 'path/to/image2.jpg']
S3 tenant images deleted successfully: ['path/to/image1.jpg', 'path/to/image2.jpg']
```

## Return Value

Both methods return `Promise<string[]>` - an array of S3 keys that were successfully deleted.

```typescript
const deletedKeys = await this.s3DeletionService.deleteRemovedFiles(
  oldImages,
  newImages,
  'tenant',
  'images',
);

console.log('Deleted keys:', deletedKeys);
// Output: ['tenants/images/file1.jpg', 'tenants/images/file2.jpg']
```

## Common Patterns

### Pattern 1: Update with Image Changes
```typescript
async update(id: number, updateDto: UpdateDto) {
  const existing = await this.prisma.entity.findUnique({ where: { s_no: id } });
  
  // Handle image deletion
  if (updateDto.images !== undefined) {
    const oldImages = (Array.isArray(existing.images) ? existing.images : []) as string[];
    const newImages = (Array.isArray(updateDto.images) ? updateDto.images : []) as string[];
    
    await this.s3DeletionService.deleteRemovedFiles(
      oldImages,
      newImages,
      'entity-type',
      'images',
    );
  }
  
  // Update database
  return this.prisma.entity.update({
    where: { s_no: id },
    data: updateDto,
  });
}
```

### Pattern 2: Delete with Cleanup
```typescript
async delete(id: number) {
  const existing = await this.prisma.entity.findUnique({ where: { s_no: id } });
  
  // Delete all files
  if (existing.images && Array.isArray(existing.images) && existing.images.length > 0) {
    const images = (existing.images as string[]);
    await this.s3DeletionService.deleteAllFiles(
      images,
      'entity-type',
      'images',
    );
  }
  
  // Soft delete entity
  return this.prisma.entity.update({
    where: { s_no: id },
    data: { is_deleted: true },
  });
}
```

## Modules Currently Using S3DeletionService
- ✅ Tenant Module
- ✅ Room Module

## Ready to Use In
- Bed Module
- Employee Module
- Visitor Module
- Any other module with S3 file management
