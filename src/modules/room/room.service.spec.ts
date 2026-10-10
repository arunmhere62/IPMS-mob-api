import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../../prisma/prisma.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { RoomService } from './room.service';

describe('RoomService.findAll', () => {
  it('returns actual room numbers even when database IDs have gaps', async () => {
    const rooms = {
      findMany: jest.fn<() => Promise<unknown[]>>(),
    };
    const service = new RoomService(
      { rooms } as unknown as PrismaService,
      {} as S3DeletionService,
    );
    rooms.findMany.mockResolvedValue([
      { s_no: 116, pg_id: 7, room_no: 'RM116', beds: [], pg_locations: null },
      { s_no: 118, pg_id: 7, room_no: 'RM118', beds: [], pg_locations: null },
    ]);

    const response = await service.findAll({ pg_id: 7, page: 1, limit: 100 });

    const data = response.data as { data: Array<{ room_no: string }> };
    expect(data.data.map((room) => room.room_no)).toEqual(['RM116', 'RM118']);
  });
});
