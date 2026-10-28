import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { databaseConfig } from '../../config/database.config';

// Entities
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { Employee } from '../entities/employee.entity';
import { Device } from '../entities/device.entity';
import { DeviceEnrollment } from '../entities/device-enrollment.entity';
import { DeviceCredential } from '../entities/device-credential.entity';
import { DeviceInventory } from '../entities/device-inventory.entity';
import { DeviceHeartbeat } from '../entities/device-heartbeat.entity';
import { DeviceUsageEvent } from '../entities/device-usage-event.entity';
import { DevicePolicy } from '../entities/device-policy.entity';
import { PolicyAssignment, AssignmentScope, AssignmentStatus } from '../entities/policy-assignment.entity';
import { Alert } from '../entities/alert.entity';
import { AuditEvent } from '../entities/audit-event.entity';
import { RemoteAction } from '../entities/remote-action.entity';
import { DevicePlatform, DeviceStatus } from '@shared/types/device.types';
import { EnrollmentStatus } from '@shared/types/enrollment.types';
import { AuditEventType } from '@shared/types/audit.types';
import { PolicyType, PolicySeverity, PolicyStatus as PolStatus } from '@shared/types/policy.types';
import { AlertSeverity, AlertStatus as AlStatus, AlertCategory } from '@shared/types/alert.types';
import { SessionActivityState } from '@shared/types/usage.types';

export async function runSeed() {
  console.log('🚀 Initializing SentinelOps Enterprise Seed Runner...');

  const config = databaseConfig();
  const dataSource = new DataSource({
    ...(config as any),
    entities: [
      Tenant,
      User,
      Role,
      Permission,
      Employee,
      Device,
      DeviceEnrollment,
      DeviceCredential,
      DeviceInventory,
      DeviceHeartbeat,
      DeviceUsageEvent,
      DevicePolicy,
      PolicyAssignment,
      Alert,
      AuditEvent,
      RemoteAction,
    ],
    synchronize: true, // Auto sync schema during seed in development
  });

  await dataSource.initialize();
  console.log('✅ Connected to database successfully.');

  try {
    const tenantRepo = dataSource.getRepository(Tenant);
    const userRepo = dataSource.getRepository(User);
    const roleRepo = dataSource.getRepository(Role);
    const permRepo = dataSource.getRepository(Permission);
    const empRepo = dataSource.getRepository(Employee);
    const devRepo = dataSource.getRepository(Device);
    const enrollRepo = dataSource.getRepository(DeviceEnrollment);
    const credRepo = dataSource.getRepository(DeviceCredential);
    const invRepo = dataSource.getRepository(DeviceInventory);
    const hbRepo = dataSource.getRepository(DeviceHeartbeat);
    const usageRepo = dataSource.getRepository(DeviceUsageEvent);
    const policyRepo = dataSource.getRepository(DevicePolicy);
    const assignRepo = dataSource.getRepository(PolicyAssignment);
    const alertRepo = dataSource.getRepository(Alert);
    const auditRepo = dataSource.getRepository(AuditEvent);

    // 1. Create or Find Tenant
    let tenant = await tenantRepo.findOne({ where: { name: 'Acme Global Enterprise' } });
    if (!tenant) {
      tenant = tenantRepo.create({
        name: 'Acme Global Enterprise',
        domain: 'acme.com',
        isActive: true,
        settings: {
          sessionTimeoutMinutes: 60,
          requireMfa: true,
          evidenceRetentionDays: 365,
        },
      });
      tenant = await tenantRepo.save(tenant);
      console.log('🏢 Tenant created:', tenant.name);
    }

    // 2. Default Permissions
    const defaultPermissions = [
      { code: 'users.read', name: 'Read Users', resource: 'users', action: 'read' },
      { code: 'users.write', name: 'Write Users', resource: 'users', action: 'write' },
      { code: 'users.delete', name: 'Delete Users', resource: 'users', action: 'delete' },
      { code: 'devices.read', name: 'Read Devices', resource: 'devices', action: 'read' },
      { code: 'devices.write', name: 'Write Devices', resource: 'devices', action: 'write' },
      { code: 'devices.delete', name: 'Delete Devices', resource: 'devices', action: 'delete' },
      { code: 'devices.enroll', name: 'Enroll Devices', resource: 'devices', action: 'enroll' },
      { code: 'devices.remote', name: 'Remote Control', resource: 'devices', action: 'remote' },
      { code: 'inventory.read', name: 'Read Inventory', resource: 'inventory', action: 'read' },
      { code: 'audit.read', name: 'Read Audit Logs', resource: 'audit', action: 'read' },
      { code: 'settings.write', name: 'Write Settings', resource: 'settings', action: 'write' },
      { code: 'roles.manage', name: 'Manage Roles', resource: 'roles', action: 'manage' },
    ];

    const allPerms: Permission[] = [];
    for (const p of defaultPermissions) {
      let perm = await permRepo.findOne({ where: { code: p.code } });
      if (!perm) {
        perm = permRepo.create(p);
        perm = await permRepo.save(perm);
      }
      allPerms.push(perm);
    }
    console.log(`🔐 Ensured ${allPerms.length} permissions exist.`);

    // 3. Admin Role
    let adminRole = await roleRepo.findOne({ where: { name: 'Admin', tenantId: tenant.id } });
    if (!adminRole) {
      adminRole = roleRepo.create({
        name: 'Admin',
        description: 'Full organizational administrator with device control and policy authorization',
        tenantId: tenant.id,
        permissions: allPerms,
      });
      adminRole = await roleRepo.save(adminRole);
      console.log('🛡️ Admin role created.');
    }

    // 4. Admin User
    const adminEmail = 'admin@sentinelops.com';
    let adminUser = await userRepo.findOne({ where: { email: adminEmail } });
    if (!adminUser) {
      const passwordHash = await bcrypt.hash('password123', 10);
      adminUser = userRepo.create({
        email: adminEmail,
        passwordHash,
        firstName: 'Sarah',
        lastName: 'Connor',
        isMfaEnabled: false,
        isActive: true,
        tenantId: tenant.id,
        roles: [adminRole],
      });
      adminUser = await userRepo.save(adminUser);
      console.log(`👤 Admin user created: ${adminEmail} (Password: password123)`);
    }

    // 5. Employees
    const sampleEmployees = [
      { employeeId: 'EMP-1001', firstName: 'John', lastName: 'Doe', email: 'john.doe@acme.com', department: 'Engineering', position: 'Lead Software Architect' },
      { employeeId: 'EMP-1002', firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@acme.com', department: 'Finance', position: 'Senior Risk Analyst' },
      { employeeId: 'EMP-1003', firstName: 'Alex', lastName: 'Wong', email: 'alex.wong@acme.com', department: 'Field Operations', position: 'Operations Manager' },
    ];

    const savedEmployees: Employee[] = [];
    for (const empData of sampleEmployees) {
      let emp = await empRepo.findOne({ where: { employeeId: empData.employeeId, tenantId: tenant.id } });
      if (!emp) {
        emp = empRepo.create({ ...empData, tenantId: tenant.id });
        emp = await empRepo.save(emp);
      }
      savedEmployees.push(emp);
    }
    console.log(`👥 Created/verified ${savedEmployees.length} employee records.`);

    // 6. Sample Devices
    const sampleDevices = [
      {
        deviceId: 'WIN-DEV-001',
        deviceName: 'CORP-W11-JOHN',
        platform: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11 Enterprise (Build 22631.3007)',
        status: DeviceStatus.ACTIVE,
        ipAddress: '192.168.1.145',
        assignedEmployeeId: savedEmployees[0].id,
      },
      {
        deviceId: 'WIN-FIN-002',
        deviceName: 'DELL-LATITUDE-JANE',
        platform: DevicePlatform.WINDOWS,
        osVersion: 'Windows 10 Enterprise (Build 19045.3930)',
        status: DeviceStatus.ACTIVE,
        ipAddress: '192.168.1.189',
        assignedEmployeeId: savedEmployees[1].id,
      },
      {
        deviceId: 'DROID-CORP-003',
        deviceName: 'PIXEL-7-PRO-ALEX',
        platform: DevicePlatform.ANDROID,
        osVersion: 'Android 14 (UP1A.231205.018)',
        status: DeviceStatus.ACTIVE,
        ipAddress: '10.0.4.52',
        assignedEmployeeId: savedEmployees[2].id,
      },
      {
        deviceId: 'WIN-IDLE-004',
        deviceName: 'THINKPAD-OFFLINE',
        platform: DevicePlatform.WINDOWS,
        osVersion: 'Windows 11 Pro (Build 22621)',
        status: DeviceStatus.OFFLINE,
        ipAddress: '192.168.1.205',
        assignedEmployeeId: undefined,
      },
    ];

    const savedDevices: Device[] = [];
    for (const devData of sampleDevices) {
      let dev = await devRepo.findOne({ where: { deviceId: devData.deviceId, tenantId: tenant.id } });
      if (!dev) {
        dev = devRepo.create({
          ...devData,
          tenantId: tenant.id,
          lastSeenAt: devData.status === DeviceStatus.ACTIVE ? new Date() : new Date(Date.now() - 48 * 3600 * 1000),
          metadata: {
            secureBoot: true,
            bitLocker: true,
            enrolledVia: 'AUTOMATED_MSI',
          },
        });
        dev = await devRepo.save(dev);
      }
      savedDevices.push(dev);
    }
    console.log(`💻 Created/verified ${savedDevices.length} endpoint devices.`);

    // 7. Credentials & Enrollments for devices
    const primaryDev = savedDevices[0]; // WIN-DEV-001
    let primaryEnroll = await enrollRepo.findOne({ where: { deviceId: primaryDev.id } });
    if (!primaryEnroll) {
      primaryEnroll = enrollRepo.create({
        enrollmentToken: 'token_sample_win_001',
        status: EnrollmentStatus.ACTIVE,
        deviceId: primaryDev.id,
        enrolledAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      });
      primaryEnroll = await enrollRepo.save(primaryEnroll);

      const cred = credRepo.create({
        deviceKey: 'win_corp_key_001',
        deviceSecret: 'win_corp_secret_001_secure_dev',
        keyFingerprint: 'sha256_mock_fingerprint_001',
        isActive: true,
        enrollmentId: primaryEnroll.id,
      });
      await credRepo.save(cred);
      console.log('🔑 Provisioned device key/secret for simulator: [win_corp_key_001]');
    }

    // 8. Device Telemetry & Inventory
    const existingHb = await hbRepo.findOne({ where: { deviceId: primaryDev.id } });
    if (!existingHb) {
      const hb = hbRepo.create({
        deviceId: primaryDev.id,
        health: {
          cpuUsage: 28.4,
          memoryUsage: 64.2,
          diskUsage: 42.0,
          batteryLevel: 94,
          batteryStatus: 'Charging',
          uptime: 86400 * 3, // 3 days
        },
        connectivity: {
          isConnected: true,
          connectionType: 'WiFi 6 (802.11ax)',
          latency: 8.5,
          networkSpeed: 1200,
        },
        agent: {
          status: 'healthy',
          lastCommand: 'none',
          pendingCommands: 0,
        },
      });
      await hbRepo.save(hb);

      const inv = invRepo.create({
        deviceId: primaryDev.id,
        hardware: {
          manufacturer: 'Dell Inc.',
          model: 'Precision 5570',
          serialNumber: '8F9X204-CONF',
          cpu: '12th Gen Intel(R) Core(TM) i7-12800H',
          cpuCores: 14,
          ram: 32,
          storage: 1024,
          storageType: 'NVMe SSD',
        },
        operatingSystem: {
          name: 'Windows',
          version: 'Windows 11 Enterprise',
          build: '22631.3007',
          architecture: 'x64',
        },
        network: {
          hostname: primaryDev.deviceName,
          macAddress: '00:1A:2B:3C:4D:5E',
          ipAddress: primaryDev.ipAddress || '192.168.1.145',
        },
        security: {
          antivirus: 'Windows Defender (Up to Date)',
          firewallEnabled: true,
          encryptionEnabled: true,
        },
        software: {
          installedApplications: [
            { name: 'Microsoft Visual Studio Enterprise 2022', version: '17.8.3', publisher: 'Microsoft Corporation' },
            { name: 'Google Chrome Enterprise', version: '122.0.6261.95', publisher: 'Google LLC' },
            { name: 'Microsoft Teams Enterprise', version: '24033.811', publisher: 'Microsoft Corporation' },
            { name: 'Slack', version: '4.36.140', publisher: 'Slack Technologies' },
            { name: 'Docker Desktop', version: '4.27.2', publisher: 'Docker Inc.' },
            { name: 'Postman', version: '10.23.0', publisher: 'Postman, Inc.' },
          ],
        },
        agent: {
          version: '1.0.0-enterprise',
          installDate: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        },
      });
      await invRepo.save(inv);
      console.log('📊 Hardware & Software inventory seeded.');
    }

    // 9. Realistic Application Usage Events with SHA-256 Chaining
    const existingUsage = await usageRepo.findOne({ where: { deviceId: primaryDev.id } });
    if (!existingUsage) {
      console.log('📈 Generating verifiable application activity timeline...');
      const sampleApps = [
        { proc: 'devenv.exe', title: 'SentinelOps.sln - Microsoft Visual Studio', activeSec: 3600, idleSec: 120 },
        { proc: 'chrome.exe', title: 'SentinelOps Dashboard - Google Chrome', activeSec: 1800, idleSec: 60 },
        { proc: 'teams.exe', title: 'Daily Standup | Microsoft Teams', activeSec: 1200, idleSec: 0 },
        { proc: 'slack.exe', title: '#engineering-general - Slack', activeSec: 900, idleSec: 300 },
        { proc: 'idle.exe', title: 'Workstation Locked / Lunch Break', activeSec: 0, idleSec: 3600 },
        { proc: 'devenv.exe', title: 'ActivityTracker.cs - Microsoft Visual Studio', activeSec: 4200, idleSec: 180 },
      ];

      let parentHash = 'INITIAL_GENESIS_SEED_HASH';
      for (let i = 0; i < sampleApps.length; i++) {
        const app = sampleApps[i];
        const eventTime = new Date(Date.now() - (sampleApps.length - i) * 3600 * 1000);

        const payloadString = JSON.stringify({
          deviceId: primaryDev.id,
          tenantId: tenant.id,
          proc: app.proc,
          title: app.title,
          activeDuration: app.activeSec,
          idleDuration: app.idleSec,
          timestamp: eventTime.toISOString(),
          parentHash,
        });

        const currentHash = crypto.createHash('sha256').update(payloadString).digest('hex');

        const usageEv = usageRepo.create({
          deviceId: primaryDev.id,
          tenantId: tenant.id,
          employeeId: savedEmployees[0].id,
          activeWindowProcess: app.proc,
          activeWindowTitle: app.title,
          activeDurationSeconds: app.activeSec,
          idleDurationSeconds: app.idleSec,
          activityState: app.idleSec > 600 ? SessionActivityState.IDLE : SessionActivityState.ACTIVE,
          isWorkHours: true,
          timestamp: eventTime,
          provenanceHash: currentHash,
          previousHash: parentHash,
        });

        await usageRepo.save(usageEv);
        parentHash = currentHash;
      }
      console.log('⛓️ Cryptographically linked 6 telemetry events.');
    }

    // 10. Default Policies
    let baselinePolicy = await policyRepo.findOne({ where: { name: 'Corporate Device Inactivity Policy', tenantId: tenant.id } });
    if (!baselinePolicy) {
      const createdPolicy = policyRepo.create({
        name: 'Corporate Device Inactivity Policy',
        description: 'Enforces screen lock after 15 minutes of idle time and flags non-work activity during core hours',
        policyType: PolicyType.DEVICE,
        severity: PolicySeverity.MEDIUM,
        status: PolStatus.ACTIVE,
        isDefault: true,
        tenantId: tenant.id,
        rules: {
          conditions: [
            {
              field: 'idleMinutes',
              operator: 'gt',
              value: 15,
            },
          ],
          actions: [
            {
              type: 'ALERT',
              parameters: { message: 'Device idle limit exceeded' },
            },
          ],
          evaluationCriteria: {
            requireAllConditions: true,
            evaluationFrequency: 'HOURLY',
          },
        },
      } as any);
      baselinePolicy = await policyRepo.save(createdPolicy as any);

      const assignment = assignRepo.create({
        scope: AssignmentScope.ALL_DEVICES,
        status: AssignmentStatus.ACTIVE,
        policyId: (baselinePolicy as any).id,
        tenantId: tenant.id,
      });
      await assignRepo.save(assignment);
      console.log('📜 Default Device Inactivity policy created.');
    }

    // 11. Sample Alerts
    const existingAlert = await alertRepo.findOne({ where: { tenantId: tenant.id } });
    if (!existingAlert) {
      const alert1 = alertRepo.create({
        title: 'Endpoint THINKPAD-OFFLINE missed scheduled heartbeats',
        description: 'Device has been unresponsive for more than 48 hours without authorized downtime request.',
        severity: AlertSeverity.WARNING,
        status: AlStatus.OPEN,
        category: AlertCategory.DEVICE_OFFLINE,
        deviceId: savedDevices[3].id,
        tenantId: tenant.id,
        occurrenceCount: 3,
        firstOccurrenceAt: new Date(Date.now() - 48 * 3600 * 1000),
        lastOccurrenceAt: new Date(),
      });
      await alertRepo.save(alert1);
      console.log('🚨 Sample alert created.');
    }

    // 12. Audit Event
    let seedAudit = await auditRepo.findOne({ where: { tenantId: tenant.id } });
    if (!seedAudit) {
      const auditPayload = JSON.stringify({
        eventType: AuditEventType.SETTINGS_CHANGED,
        tenantId: tenant.id,
        userId: adminUser.id,
        timestamp: new Date().toISOString(),
        details: { action: 'SEED_INITIALIZATION', version: '1.0.0' },
        previousHash: 'GENESIS',
      });
      const eventHash = crypto.createHash('sha256').update(auditPayload).digest('hex');

      const auditRecord = auditRepo.create({
        eventType: AuditEventType.SETTINGS_CHANGED,
        tenantId: tenant.id,
        userId: adminUser.id,
        description: 'System initialization',
        details: { action: 'SYSTEM_BOOTSTRAP', description: 'Enterprise platform database initialized with baseline policies' },
        eventHash,
        previousHash: 'GENESIS',
      } as any);
      await auditRepo.save(auditRecord as any);
      console.log('📑 Root tamper-evident audit record created.');
    }

    console.log('\n======================================================');
    console.log('✨ SentinelOps Enterprise Database Seed Complete! ✨');
    console.log('Admin Email:     admin@sentinelops.com');
    console.log('Admin Password:  password123');
    console.log('Organization:    Acme Global Enterprise');
    console.log('Active Devices:  4 (3 Windows, 1 Android)');
    console.log('Sim Key/Secret:  win_corp_key_001 / win_corp_secret_001_secure_dev');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Seed error:', err);
    throw err;
  } finally {
    await dataSource.destroy();
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
