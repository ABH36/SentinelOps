import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );
    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Admin role has universal permission access
    const isAdmin = (user.roles || []).some(
      (r: any) =>
        r.name?.toLowerCase() === 'admin' ||
        r.name?.toLowerCase() === 'superadmin' ||
        r.name?.toLowerCase() === 'administrator',
    );
    if (isAdmin) {
      return true;
    }

    const userPermissions = (user.permissions || []).map((p: any) => p.code || p);
    return requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );
  }
}
