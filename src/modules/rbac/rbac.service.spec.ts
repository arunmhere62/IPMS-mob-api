import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RbacService } from './rbac.service';

describe('RbacService.checkAuthorization', () => {
  const activeUser = {
    role_id: 3,
    organization_id: 10,
    is_deleted: false,
    status: 'ACTIVE',
    roles: { role_name: 'ADMIN' },
  };

  let prisma: any;
  let service: RbacService;

  beforeEach(() => {
    prisma = {
      users: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(activeUser) },
      permissions_master: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ s_no: 7 }) },
      user_permission_overrides: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
      role_permissions: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ s_no: 1 }) },
    };
    service = new RbacService(prisma, {} as any);
  });

  it('allows a permission granted to the user role', async () => {
    await expect(service.checkAuthorization(89, 10, 'room_view')).resolves.toEqual({
      roleName: 'ADMIN',
      isSuperAdmin: false,
      allowed: true,
    });
    expect(prisma.permissions_master.findFirst).toHaveBeenCalledWith({
      where: { screen_name: 'room', action: 'VIEW' },
      select: { s_no: true },
    });
  });

  it('honors an active deny override over a role grant', async () => {
    prisma.user_permission_overrides.findUnique.mockResolvedValue({
      effect: 'DENY',
      expires_at: null,
    });

    await expect(service.checkAuthorization(89, 10, 'room_view')).resolves.toMatchObject({
      allowed: false,
    });
    expect(prisma.role_permissions.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the role grant after an override expires', async () => {
    prisma.user_permission_overrides.findUnique.mockResolvedValue({
      effect: 'DENY',
      expires_at: new Date(Date.now() - 1000),
    });

    await expect(service.checkAuthorization(89, 10, 'room_view')).resolves.toMatchObject({
      allowed: true,
    });
    expect(prisma.role_permissions.findUnique).toHaveBeenCalled();
  });

  it('denies permissions absent from the catalog', async () => {
    prisma.permissions_master.findFirst.mockResolvedValue(null);

    await expect(service.checkAuthorization(89, 10, 'visitor_view')).resolves.toMatchObject({
      allowed: false,
    });
    expect(prisma.role_permissions.findUnique).not.toHaveBeenCalled();
  });

  it('allows Super Admin without a catalog grant', async () => {
    prisma.users.findUnique.mockResolvedValue({
      ...activeUser,
      roles: { role_name: 'SUPER_ADMIN' },
    });

    await expect(service.checkAuthorization(89, 10, 'visitor_view')).resolves.toMatchObject({
      roleName: 'SUPER_ADMIN',
      isSuperAdmin: true,
      allowed: true,
    });
    expect(prisma.permissions_master.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a mismatched organization context', async () => {
    await expect(service.checkAuthorization(89, 11, 'room_view')).rejects.toThrow(
      'Authenticated organization does not match the user',
    );
  });
});
