import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  DeleteObjectCommandOutput,
  DeleteObjectsCommandOutput,
} from '@aws-sdk/client-s3';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

@Injectable()
export class S3Service {
  private s3Client: S3Client;

  constructor() {
    // Configure AWS S3 from environment variables
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'AKIA5QELDK32OFK7YBRL';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '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';
    const region = process.env.AWS_REGION || 'ap-south-1';

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    
    console.log('S3 Service initialized:', {
      region,
      accessKeyId: accessKeyId.substring(0, 10) + '...',
      bucket: 'indianpgmanagement'
    });
  }

  async uploadFile(uploadData: {
    key: string;
    contentType: string;
    fileData: string;
    isPublic: boolean;
    bucket: string;
  }): Promise<{ Location: string; ETag?: string; Bucket: string; Key: string }> {
    const { key, contentType, fileData, bucket } = uploadData;

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // ACL removed - bucket doesn't support ACLs, uses default permissions
    });

    console.log('Uploading to S3:', { bucket, key, contentType, size: buffer.length });

    const response = await this.s3Client.send(command);
    
    // Return v2-compatible response format
    return {
      Location: `https://${bucket}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`,
      ETag: response.ETag,
      Bucket: bucket,
      Key: key,
    };
  }

  async deleteFile(deleteData: {
    key: string;
    bucket: string;
  }): Promise<DeleteObjectCommandOutput> {
    const { key, bucket } = deleteData;

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    console.log('Deleting from S3:', { bucket, key });

    try {
      const response = await this.s3Client.send(command);
      console.log('S3 delete response:', { 
        DeleteMarker: response.DeleteMarker, 
        VersionId: response.VersionId,
        key 
      });
      return response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code = isRecord(error) ? (error as Record<string, unknown>).code : undefined;
      const meta = isRecord(error) ? (error as Record<string, unknown>).$metadata : undefined;
      console.error('S3 delete failed with error:', {
        message,
        code,
        statusCode: isRecord(meta) ? (meta as Record<string, unknown>).httpStatusCode : undefined,
        key,
        bucket
      });
      throw error;
    }
  }

  async deleteMultipleFiles(deleteData: {
    keys: string[];
    bucket: string;
  }): Promise<DeleteObjectsCommandOutput> {
    const { keys, bucket } = deleteData;

    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map(key => ({ Key: key })),
      },
    });

    console.log('Bulk deleting from S3:', { bucket, keys });

    return this.s3Client.send(command);
  }

  async fileExists(query: {
    key: string;
    bucket: string;
  }): Promise<boolean> {
    const { key, bucket } = query;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}
