import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';
import { CreatePgLocationDto } from './create-pg-location.dto';
import { UpdatePgLocationDto } from './update-pg-location.dto';

const createDto = (pincode?: string) =>
  Object.assign(new CreatePgLocationDto(), {
    locationName: 'Green Valley PG',
    address: '123 Main Street',
    stateId: 1,
    cityId: 1,
    pincode,
  });

const updateDto = (pincode?: string) =>
  Object.assign(new UpdatePgLocationDto(), { pincode });

describe('PG location PIN code validation', () => {
  it.each(['560001', '110001'])('accepts valid six-digit PIN code %s', async (pincode: string) => {
    const [createErrors, updateErrors] = await Promise.all([
      validate(createDto(pincode)),
      validate(updateDto(pincode)),
    ]);

    expect(createErrors.find((error) => error.property === 'pincode')).toBeUndefined();
    expect(updateErrors.find((error) => error.property === 'pincode')).toBeUndefined();
  });

  it.each(['1234', '1234567', '12a456', '000000'])('rejects invalid PIN code %s', async (pincode: string) => {
    const [createErrors, updateErrors] = await Promise.all([
      validate(createDto(pincode)),
      validate(updateDto(pincode)),
    ]);

    expect(createErrors.find((error) => error.property === 'pincode')).toBeDefined();
    expect(updateErrors.find((error) => error.property === 'pincode')).toBeDefined();
  });

  it('allows an omitted optional PIN code', async () => {
    const [createErrors, updateErrors] = await Promise.all([
      validate(createDto()),
      validate(updateDto()),
    ]);

    expect(createErrors.find((error) => error.property === 'pincode')).toBeUndefined();
    expect(updateErrors.find((error) => error.property === 'pincode')).toBeUndefined();
  });
});
