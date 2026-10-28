import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2Schema1701076900000 implements MigrationInterface {
  name = 'Phase2Schema1701076900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Device Policies table
    await queryRunner.query(`
      CREATE TABLE "device_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "description" varchar,
        "policyType" varchar NOT NULL CHECK (policyType IN ('DEVICE', 'SOFTWARE', 'SECURITY', 'NETWORK', 'COMPLIANCE')),
        "severity" varchar NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        "status" varchar NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED')),
        "rules" json NOT NULL,
        "metadata" json,
        "version" varchar,
        "versionHistory" json,
        "isDefault" boolean DEFAULT true,
        "effectiveFrom" timestamp,
        "effectiveUntil" timestamp,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "createdBy" uuid,
        "updatedBy" uuid,
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_policies_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_policies_tenant_status" ON "device_policies" ("tenantId", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_policies_tenant_type" ON "device_policies" ("tenantId", "policyType")`);

    // Policy Assignments table
    await queryRunner.query(`
      CREATE TABLE "policy_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "scope" varchar NOT NULL CHECK (scope IN ('ALL_DEVICES', 'SPECIFIC_DEVICES', 'SPECIFIC_EMPLOYEES', 'DEVICE_GROUP', 'EMPLOYEE_GROUP')),
        "status" varchar NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED')),
        "targetCriteria" json,
        "overrideSettings" json,
        "priority" integer,
        "expiresAt" timestamp,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "assignedBy" uuid,
        "assignedAt" timestamp,
        "policyId" uuid NOT NULL,
        "deviceId" uuid,
        "employeeId" uuid,
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_assignments_policy" FOREIGN KEY ("policyId") REFERENCES "device_policies"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_assignments_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_assignments_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_assignments_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_assignments_policyId" ON "policy_assignments" ("policyId")`);
    await queryRunner.query(`CREATE INDEX "idx_assignments_tenant_status" ON "policy_assignments" ("tenantId", "status")`);

    // Software Packages table
    await queryRunner.query(`
      CREATE TABLE "software_packages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "version" varchar NOT NULL,
        "description" varchar,
        "packageType" varchar NOT NULL CHECK (packageType IN ('INSTALLER', 'SCRIPT', 'CONFIGURATION', 'UPDATE')),
        "platform" varchar NOT NULL CHECK (platform IN ('WINDOWS', 'ANDROID', 'CROSS_PLATFORM')),
        "status" varchar NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY', 'DEPRECATED', 'ARCHIVED')),
        "publisher" varchar,
        "metadata" json NOT NULL,
        "compatibility" json,
        "downloadCount" integer DEFAULT 0,
        "deploymentCount" integer DEFAULT 0,
        "successRate" numeric DEFAULT 0,
        "versionHistory" json,
        "effectiveFrom" timestamp,
        "effectiveUntil" timestamp,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "createdBy" uuid,
        "updatedBy" uuid,
        "tenantId" uuid NOT NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_packages_tenant_status" ON "software_packages" ("tenantId", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_packages_tenant_platform" ON "software_packages" ("tenantId", "platform")`);

    // Software Deployments table
    await queryRunner.query(`
      CREATE TABLE "software_deployments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "status" varchar NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SCHEDULED', 'DOWNLOADING', 'INSTALLING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ROLLBACK')),
        "priority" varchar NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
        "scheduledAt" timestamp,
        "startedAt" timestamp,
        "completedAt" timestamp,
        "progress" json,
        "result" json,
        "failureDetails" json,
        "retryCount" integer DEFAULT 0,
        "maxRetries" integer DEFAULT 3,
        "overrideSettings" json,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "deployedBy" uuid,
        "packageId" uuid NOT NULL,
        "deviceId" uuid NOT NULL,
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_deployments_package" FOREIGN KEY ("packageId") REFERENCES "software_packages"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_deployments_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_deployments_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_deployments_packageId" ON "software_deployments" ("packageId")`);
    await queryRunner.query(`CREATE INDEX "idx_deployments_deviceId" ON "software_deployments" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "idx_deployments_tenant_status" ON "software_deployments" ("tenantId", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_deployments_tenant_scheduled" ON "software_deployments" ("tenantId", "scheduledAt")`);

    // Alerts table
    await queryRunner.query(`
      CREATE TABLE "alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar NOT NULL,
        "description" text,
        "severity" varchar NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
        "status" varchar NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED', 'ESCALATED')),
        "category" varchar NOT NULL CHECK (category IN ('DEVICE_OFFLINE', 'POLICY_VIOLATION', 'SECURITY', 'PERFORMANCE', 'DEPLOYMENT', 'COMPLIANCE', 'SYSTEM')),
        "details" json,
        "metrics" json,
        "remediation" json,
        "notificationSettings" json,
        "acknowledgedBy" uuid,
        "acknowledgedAt" timestamp,
        "acknowledgmentNote" text,
        "resolvedBy" uuid,
        "resolvedAt" timestamp,
        "resolutionNote" text,
        "escalation" json,
        "occurrenceHistory" json,
        "occurrenceCount" integer DEFAULT 1,
        "firstOccurrenceAt" timestamp,
        "lastOccurrenceAt" timestamp,
        "metadata" json,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now(),
        "deviceId" uuid,
        "policyId" uuid,
        "tenantId" uuid NOT NULL,
        CONSTRAINT "fk_alerts_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_alerts_policy" FOREIGN KEY ("policyId") REFERENCES "device_policies"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_alerts_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_alerts_tenant_status" ON "alerts" ("tenantId", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_alerts_tenant_severity" ON "alerts" ("tenantId", "severity")`);
    await queryRunner.query(`CREATE INDEX "idx_alerts_deviceId" ON "alerts" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "idx_alerts_policyId" ON "alerts" ("policyId")`);
    await queryRunner.query(`CREATE INDEX "idx_alerts_createdAt" ON "alerts" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "software_deployments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "software_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "policy_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_policies"`);
  }
}
