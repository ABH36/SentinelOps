import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1701076800000 implements MigrationInterface {
  name = 'InitialSchema1701076800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tenants table
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL UNIQUE,
        "domain" varchar,
        "isActive" boolean DEFAULT true,
        "settings" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      )
    `);

    // Roles table
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "description" varchar,
        "isActive" boolean DEFAULT true,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_roles_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Permissions table
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "description" varchar,
        "resource" varchar NOT NULL,
        "action" varchar NOT NULL,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      )
    `);

    // Role-Permission junction table
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "roleId" uuid NOT NULL,
        "permissionId" uuid NOT NULL,
        PRIMARY KEY ("roleId", "permissionId"),
        CONSTRAINT "fk_rp_role" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_rp_permission" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);

    // Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL,
        "passwordHash" varchar NOT NULL,
        "isMfaEnabled" boolean DEFAULT false,
        "mfaSecret" varchar,
        "isActive" boolean DEFAULT true,
        "firstName" varchar,
        "lastName" varchar,
        "metadata" json,
        "lastLoginAt" timestamp,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_users_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_users_email_tenant" UNIQUE ("email", "tenantId")
      )
    `);

    // User-Role junction table
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "userId" uuid NOT NULL,
        "roleId" uuid NOT NULL,
        PRIMARY KEY ("userId", "roleId"),
        CONSTRAINT "fk_ur_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ur_role" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `);

    // Employees table
    await queryRunner.query(`
      CREATE TABLE "employees" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employeeId" varchar NOT NULL,
        "firstName" varchar,
        "lastName" varchar,
        "email" varchar,
        "department" varchar,
        "position" varchar,
        "isActive" boolean DEFAULT true,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_employees_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_employees_employeeId_tenant" UNIQUE ("employeeId", "tenantId")
      )
    `);

    // Devices table
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "deviceId" varchar NOT NULL UNIQUE,
        "deviceName" varchar NOT NULL,
        "platform" varchar NOT NULL CHECK (platform IN ('WINDOWS', 'ANDROID')),
        "osVersion" varchar,
        "status" varchar NOT NULL DEFAULT 'ENROLLING' CHECK (status IN ('ENROLLING', 'ACTIVE', 'OFFLINE', 'LOCKED', 'RETIRED')),
        "lastSeenAt" timestamp,
        "ipAddress" varchar,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "tenantId" uuid NOT NULL,
        "assignedEmployeeId" uuid,
        CONSTRAINT "fk_devices_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_devices_employee" FOREIGN KEY ("assignedEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for devices
    await queryRunner.query(`CREATE INDEX "idx_devices_tenant_status" ON "devices" ("tenantId", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_devices_tenant_platform" ON "devices" ("tenantId", "platform")`);

    // Device Enrollments table
    await queryRunner.query(`
      CREATE TABLE "device_enrollments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "enrollmentToken" varchar NOT NULL UNIQUE,
        "status" varchar NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED')),
        "expiresAt" timestamp,
        "enrolledAt" timestamp,
        "revokedAt" timestamp,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "deviceId" uuid NOT NULL,
        CONSTRAINT "fk_enrollments_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_enrollments_deviceId" ON "device_enrollments" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "idx_enrollments_status" ON "device_enrollments" ("status")`);

    // Device Credentials table
    await queryRunner.query(`
      CREATE TABLE "device_credentials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "deviceKey" varchar NOT NULL,
        "deviceSecret" varchar NOT NULL,
        "keyFingerprint" varchar,
        "isActive" boolean DEFAULT true,
        "expiresAt" timestamp,
        "rotatedAt" timestamp,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "enrollmentId" uuid NOT NULL,
        CONSTRAINT "fk_credentials_enrollment" FOREIGN KEY ("enrollmentId") REFERENCES "device_enrollments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_credentials_enrollmentId" ON "device_credentials" ("enrollmentId")`);

    // Device Inventories table
    await queryRunner.query(`
      CREATE TABLE "device_inventories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "hardware" json NOT NULL,
        "operatingSystem" json NOT NULL,
        "network" json NOT NULL,
        "software" json,
        "security" json,
        "agent" json,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "deviceId" uuid NOT NULL,
        CONSTRAINT "fk_inventories_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_inventories_deviceId" ON "device_inventories" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "idx_inventories_deviceId_createdAt" ON "device_inventories" ("deviceId", "createdAt")`);

    // Device Heartbeats table
    await queryRunner.query(`
      CREATE TABLE "device_heartbeats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "health" json NOT NULL,
        "connectivity" json,
        "agent" json,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "deviceId" uuid NOT NULL,
        CONSTRAINT "fk_heartbeats_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_heartbeats_deviceId" ON "device_heartbeats" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "idx_heartbeats_deviceId_createdAt" ON "device_heartbeats" ("deviceId", "createdAt")`);

    // Audit Events table
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "eventType" varchar NOT NULL,
        "description" text,
        "details" json,
        "ipAddress" varchar,
        "userAgent" varchar,
        "requestId" varchar,
        "previousHash" varchar,
        "eventHash" varchar NOT NULL,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "tenantId" uuid NOT NULL,
        "userId" uuid,
        "deviceId" uuid,
        CONSTRAINT "fk_audit_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_audit_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_audit_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_audit_tenantId" ON "audit_events" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_tenant_eventType" ON "audit_events" ("tenantId", "eventType")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_tenant_createdAt" ON "audit_events" ("tenantId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_userId" ON "audit_events" ("userId")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_deviceId" ON "audit_events" ("deviceId")`);

    // Insert default permissions
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description", "resource", "action") VALUES
      ('users.read', 'Read Users', 'View user information', 'users', 'read'),
      ('users.write', 'Write Users', 'Create and update users', 'users', 'write'),
      ('users.delete', 'Delete Users', 'Delete users', 'users', 'delete'),
      ('devices.read', 'Read Devices', 'View device information', 'devices', 'read'),
      ('devices.write', 'Write Devices', 'Manage devices', 'devices', 'write'),
      ('devices.delete', 'Delete Devices', 'Delete devices', 'devices', 'delete'),
      ('devices.enroll', 'Enroll Devices', 'Enroll new devices', 'devices', 'enroll'),
      ('devices.remote', 'Remote Control', 'Execute remote actions on devices', 'devices', 'remote'),
      ('inventory.read', 'Read Inventory', 'View device inventory', 'inventory', 'read'),
      ('audit.read', 'Read Audit Logs', 'View audit logs', 'audit', 'read'),
      ('settings.write', 'Write Settings', 'Modify system settings', 'settings', 'write'),
      ('roles.manage', 'Manage Roles', 'Create and manage roles', 'roles', 'manage')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_heartbeats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_inventories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_enrollments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employees"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
