# S3 Deletion Service Refactoring

## Overview
Created a common `S3DeletionService` to centralize S3 file deletion logic across all modules, eliminating code duplication and improving maintainability.

## New Files Created

### 1. `/api/src/modules/common/s3-deletion.service.ts`
A reusable service providing two main methods:

#### `deleteRemovedFiles()`
- Compares old and new file arrays
- Identifies removed files (S3 URLs only)
- Deletes removed files from S3
- Used during UPDATE operations

**Parameters:**
- `oldFiles: string[]` - Original file URLs
- `newFiles: string[]` - Updated file URLs
- `entityType: string` - Entity type for logging (e.g., 'room', 'tenant')
- `fileType: string` - File type for logging (e.g., 'images', 'documents')

**Example Usage:**
```typescript
await this.s3DeletionService.deleteRemovedFiles(
  oldImages,
  newImages,
  'tenant',
  'images',
);
```

#### `deleteAllFiles()`
- Deletes all files from S3
- Used during DELETE operations
- Handles entity deletion cleanup

**Parameters:**
- `files: string[]` - File URLs to delete
- `entityType: string` - Entity type for logging
- `fileType: string` - File type for logging

**Example Usage:**
```typescript
await this.s3DeletionService.deleteAllFiles(
  roomImages,
  'room',
  'images',
);
```

#### Helper Method: `extractS3KeyFromUrl()`
- Extracts S3 key from full URL
- Parses URL pathname
- Returns null for invalid URLs

## Modified Files

### 1. `/api/src/modules/common/common.module.ts`
**Changes:**
- Added `S3Module` import
- Added `S3DeletionService` to providers and exports
- Now provides S3 deletion functionality to all modules

```typescript
@Module({
  imports: [S3Module],
  providers: [PendingRentCalculatorService, S3DeletionService],
  exports: [PendingRentCalculatorService, S3DeletionService],
})
export class CommonModule {}
```

### 2. `/api/src/modules/tenant/tenant.service.ts`
**Changes:**
- Replaced `S3Service` with `S3DeletionService`
- Simplified image deletion logic (lines 651-675)
- Simplified proof document deletion logic (lines 664-675)
- Removed `extractS3KeyFromUrl()` helper method
- Removed direct S3 API calls

**Before (30+ lines):**
```typescript
// Handle S3 image deletion if images are being updated
if (updateTenantDto.images !== undefined) {
  const oldImages = (Array.isArray(existingTenant.images) ? existingTenant.images : []) as string[];
  const newImages = (Array.isArray(updateTenantDto.images) ? updateTenantDto.images : []) as string[];
  
  const removedImages = oldImages.filter((oldUrl: string) => 
    !newImages.includes(oldUrl) && oldUrl && oldUrl.includes('amazonaws.com')
  );

  if (removedImages.length > 0) {
    try {
      const keysToDelete = removedImages
        .map((imageUrl: string) => this.extractS3KeyFromUrl(imageUrl))
        .filter((key: string | null): key is string => key !== null);

      if (keysToDelete.length > 0) {
        console.log('Deleting removed tenant images from S3:', keysToDelete);
        await this.s3Service.deleteMultipleFiles({
          keys: keysToDelete,
          bucket: process.env.AWS_S3_BUCKET_NAME || 'indianpgmanagement',
        });
        console.log('S3 tenant images deleted successfully:', keysToDelete);
      }
    } catch (error) {
      console.error('Failed to delete S3 images during tenant update:', error);
      throw new BadRequestException(`Failed to delete tenant images from cloud storage: ${error.message}`);
    }
  }
}
```

**After (10 lines):**
```typescript
// Handle S3 image deletion if images are being updated
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

### 3. `/api/src/modules/tenant/tenant.module.ts`
**Changes:**
- Removed `S3Module` import
- S3 functionality now provided through `CommonModule`

### 4. `/api/src/modules/room/room.service.ts`
**Changes:**
- Replaced `S3Service` with `S3DeletionService`
- Simplified update method deletion logic (lines 230-241)
- Simplified delete method deletion logic (lines 303-310)
- Removed `extractS3KeyFromUrl()` helper method

**Before (update method - 30+ lines):**
```typescript
// Handle S3 image deletion if images are being updated
if (updateRoomDto.images !== undefined) {
  const oldImages = (Array.isArray(existingRoom.images) ? existingRoom.images : []) as string[];
  const newImages = (Array.isArray(updateRoomDto.images) ? updateRoomDto.images : []) as string[];
  
  const removedImages = oldImages.filter((oldUrl: string) => 
    !newImages.includes(oldUrl) && oldUrl && oldUrl.includes('amazonaws.com')
  );

  if (removedImages.length > 0) {
    try {
      const keysToDelete = removedImages
        .map((imageUrl: string) => this.extractS3KeyFromUrl(imageUrl))
        .filter((key: string | null): key is string => key !== null);

      if (keysToDelete.length > 0) {
        console.log('Deleting removed images from S3:', keysToDelete);
        await this.s3Service.deleteMultipleFiles({
          keys: keysToDelete,
          bucket: process.env.AWS_S3_BUCKET_NAME || 'indianpgmanagement',
        });
        console.log('S3 images deleted successfully:', keysToDelete);
      }
    } catch (error) {
      console.error('Failed to delete S3 images during room update:', error);
      throw new BadRequestException(`Failed to delete room images from cloud storage: ${error.message}`);
    }
  }
}
```

**After (update method - 10 lines):**
```typescript
// Handle S3 image deletion if images are being updated
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

**Before (delete method - 20+ lines):**
```typescript
// Delete S3 images before soft deleting room
if (existingRoom.images && Array.isArray(existingRoom.images) && existingRoom.images.length > 0) {
  try {
    const keysToDelete = existingRoom.images
      .map((imageUrl: string) => this.extractS3KeyFromUrl(imageUrl))
      .filter((key: string | null): key is string => key !== null);

    if (keysToDelete.length > 0) {
      console.log('Deleting room images from S3:', keysToDelete);
      await this.s3Service.deleteMultipleFiles({
        keys: keysToDelete,
        bucket: process.env.AWS_S3_BUCKET_NAME || 'indianpgmanagement',
      });
      console.log('S3 room images deleted successfully:', keysToDelete);
    }
  } catch (error) {
    console.error('Failed to delete S3 images during room deletion:', error);
    throw new BadRequestException(`Failed to delete room images from cloud storage: ${error.message}`);
  }
}
```

**After (delete method - 7 lines):**
```typescript
// Delete S3 images before soft deleting room
if (existingRoom.images && Array.isArray(existingRoom.images) && existingRoom.images.length > 0) {
  const roomImages = (existingRoom.images as string[]);
  await this.s3DeletionService.deleteAllFiles(
    roomImages,
    'room',
    'images',
  );
}
```

### 5. `/api/src/modules/room/room.module.ts`
**Changes:**
- Replaced `S3Module` with `CommonModule` import
- S3 functionality now provided through `CommonModule`

## Benefits

✅ **Code Reusability**
- Single source of truth for S3 deletion logic
- Eliminates code duplication across modules

✅ **Maintainability**
- Bug fixes only need to be made in one place
- Consistent error handling across all modules
- Centralized logging

✅ **Scalability**
- Easy to add new modules with S3 deletion support
- Just inject `S3DeletionService` and call methods

✅ **Reduced Code**
- ~50% reduction in S3 deletion code per module
- Cleaner, more readable service files

✅ **Better Testing**
- Can test S3 deletion logic independently
- Easier to mock in unit tests

## Usage in Other Modules

To use `S3DeletionService` in any module:

1. **Import CommonModule:**
```typescript
@Module({
  imports: [PrismaModule, CommonModule],
  // ...
})
export class YourModule {}
```

2. **Inject S3DeletionService:**
```typescript
constructor(
  private s3DeletionService: S3DeletionService,
) {}
```

3. **Use the methods:**
```typescript
// For UPDATE operations
await this.s3DeletionService.deleteRemovedFiles(
  oldFiles,
  newFiles,
  'your-entity',
  'file-type',
);

// For DELETE operations
await this.s3DeletionService.deleteAllFiles(
  files,
  'your-entity',
  'file-type',
);
```

## Error Handling

Both methods throw `BadRequestException` if S3 deletion fails:
- Logs error details to console
- Includes descriptive error message
- Prevents entity update/deletion if S3 cleanup fails

## Logging

All operations are logged with entity and file type information:
- `Deleting removed {entityType} {fileType} from S3: [keys]`
- `S3 {entityType} {fileType} deleted successfully: [keys]`
- `Failed to delete S3 {entityType} {fileType}: [error]`
