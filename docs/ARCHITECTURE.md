# SentinelOps Enterprise Architecture

## System Overview

SentinelOps Enterprise is a multi-tier device management platform consisting of:

1. **Frontend Dashboard** - Next.js-based admin interface
2. **Backend API** - NestJS REST API with business logic
3. **Windows Agent** - C#/.NET Windows service for device management
4. **Android Agent** - Kotlin application (future)
5. **Database** - PostgreSQL for persistent storage
6. **Cache/Queue** - Redis for caching and job processing

## Architecture Diagram

```
┌─────────────────┐
│   Admin User    │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                      │
│              (Dashboard, Reports, UI)                    │
└────────┬────────────────────────────────────────────────┘
         │ HTTPS (JWT Auth)
         ▼
┌─────────────────────────────────────────────────────────┐
│                     NestJS Backend                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  Auth    │  │ Devices  │  │Enrollment│  │ Audit  │ │
│  │ Module   │  │ Module   │  │  Module  │  │ Module │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Inventory│  │Heartbeat │  │   Jobs   │              │
│  │ Module   │  │ Module   │  │  Module  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└────────┬────────────────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│PostgreSQL│ │ Redis  │
│ Database │ │ Cache  │
└────────┘ └────────┘
         │
         │ HTTPS (Device Credentials)
         ▼
┌─────────────────────────────────────────────────────────┐
│              Windows Agent Service                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │Enrollment│  │Inventory │  │Heartbeat │              │
│  │ Manager  │  │Collector │  │ Manager  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────────────────────────────────────────┐       │
│  │         Communication Client                 │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Component Details

### Frontend (Next.js)

**Technology Stack:**
- Next.js 14 with App Router
- React 18
- TypeScript
- Tailwind CSS
- Zustand for state management
- React Hook Form with Zod validation
- Axios for API calls

**Key Features:**
- Responsive admin dashboard
- Device inventory management
- Enrollment token generation
- Audit log viewer
- Role-based UI access control
- Real-time updates (future: WebSockets)

**File Structure:**
```
frontend/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/             # Utilities and API client
│   ├── types/           # TypeScript types
│   └── hooks/           # Custom React hooks
```

### Backend (NestJS)

**Technology Stack:**
- NestJS 10
- TypeScript
- TypeORM
- PostgreSQL
- Redis (Bull for job queues)
- Passport.js for authentication
- JWT for token management
- Speakeasy for MFA

**Module Architecture:**

```
backend/src/
├── auth/              # Authentication & authorization
│   ├── strategies/    # Passport strategies (JWT, Local)
│   ├── guards/        # Route guards (Roles, Permissions)
│   └── decorators/    # Custom decorators
├── users/             # User management
├── devices/           # Device management
├── enrollment/        # Device enrollment flow
├── inventory/         # Device inventory collection
├── heartbeat/         # Device health monitoring
├── audit/             # Audit logging
├── jobs/              # Background job processing
├── database/          # Database entities & migrations
├── common/            # Shared utilities
└── config/            # Configuration
```

**Key Modules:**

1. **Auth Module**
   - JWT token generation and validation
   - MFA (TOTP) setup and verification
   - Role-based access control (RBAC)
   - Permission-based access control

2. **Devices Module**
   - Device CRUD operations
   - Device status management
   - Device assignment to employees
   - Platform-specific filtering

3. **Enrollment Module**
   - Secure token generation
   - Device enrollment flow
   - Credential generation
   - Token expiration and cleanup

4. **Inventory Module**
   - Hardware/software inventory collection
   - Inventory history tracking
   - Device health metrics

5. **Heartbeat Module**
   - Real-time health monitoring
   - Offline detection
   - Performance metrics collection

6. **Audit Module**
   - Immutable audit logging
   - Event chain verification
   - Tamper evidence via hash chains

7. **Jobs Module**
   - Scheduled tasks (cron jobs)
   - Heartbeat timeout detection
   - Enrollment token cleanup
   - Audit log archival

### Windows Agent (C#/.NET)

**Technology Stack:**
- .NET 7.0
- C#
- Windows Service
- System.Management (WMI)
- Serilog for logging
- HttpClient for API communication

**Architecture:**

```
windows-agent/
├── Service/           # Windows service implementation
├── Enrollment/       # Device enrollment logic
├── Inventory/        # Hardware/software collection
├── Heartbeat/         # Health monitoring
├── Security/         # Communication and credentials
└── Config/           # Configuration management
```

**Key Components:**

1. **AgentService**
   - Windows service entry point
   - Coordinates enrollment, inventory, and heartbeat
   - Manages service lifecycle

2. **EnrollmentManager**
   - Hardware fingerprint generation
   - Enrollment token validation
   - Credential storage

3. **InventoryCollector**
   - WMI-based hardware collection
   - Software inventory
   - Network information
   - Security status

4. **HeartbeatManager**
   - Performance counters
   - Battery status
   - Network connectivity
   - Agent health

5. **CommunicationClient**
   - HTTP client with auth headers
   - Retry logic
   - Error handling

## Data Flow

### Device Enrollment Flow

1. Admin generates enrollment token via dashboard
2. Token stored in database with expiration
3. Windows agent installed on device
4. Agent prompts for enrollment token
5. Agent sends enrollment request with hardware info
6. Backend validates token and creates device record
7. Backend generates device credentials
8. Agent stores credentials locally
9. Agent starts sending heartbeats and inventory

### Heartbeat Flow

1. Agent collects health metrics (CPU, RAM, battery)
2. Agent sends heartbeat with device credentials
3. Backend validates credentials
4. Backend stores heartbeat record
5. Backend updates device last seen timestamp
6. Background job detects offline devices
7. Offline devices marked as OFFLINE status

### Inventory Collection Flow

1. Agent collects hardware/software info via WMI
2. Agent sends inventory with device credentials
3. Backend validates credentials
4. Backend stores inventory record
5. Backend updates device last seen timestamp
6. Admin can view inventory history via dashboard

## Security Architecture

### Authentication

- **Admin Users**: JWT tokens with MFA support
- **Devices**: Device key/secret pair (mutual auth in production)

### Authorization

- **Role-Based Access Control (RBAC)**
  - Roles: Admin, Operator, Viewer
  - Permissions: Granular resource-action pairs
  - Guards enforce permissions on API endpoints

### Data Protection

- **In Transit**: TLS 1.3 for all communications
- **At Rest**: Encrypted secrets (future: vault integration)
- **Audit Logs**: Hash chain for tamper evidence

### Tenant Isolation

- Multi-tenant architecture
- Tenant ID in all database queries
- Tenant-scoped data access
- Cross-tenant access prevention

## Scalability Considerations

### Horizontal Scaling

- **Backend**: Stateless API servers behind load balancer
- **Frontend**: Static hosting with CDN
- **Database**: Read replicas for reporting
- **Redis**: Cluster mode for high availability

### Performance Optimization

- Database indexing on tenant_id, device_id, timestamps
- Redis caching for dashboard summaries
- Async job processing for long-running tasks
- Connection pooling for database and Redis

### Monitoring

- Application performance monitoring (APM)
- Log aggregation (ELK stack)
- Metrics collection (Prometheus/Grafana)
- Alerting on critical failures

## Deployment Architecture

### Development

```
Docker Compose
├── PostgreSQL (single instance)
├── Redis (single instance)
├── Backend (hot reload)
└── Frontend (hot reload)
```

### Production

```
Kubernetes Cluster
├── PostgreSQL (HA with streaming replication)
├── Redis (cluster mode with sentinel)
├── Backend (multiple replicas with HPA)
├── Frontend (static hosting with CDN)
└── Ingress Controller (TLS termination)
```

## Future Enhancements

### Phase 2 (Planned)
- Policy engine implementation
- Software deployment
- Compliance checking
- Advanced reporting

### Phase 3 (Planned)
- Usage analytics
- Evidence collection
- Retention policies
- Advanced audit features

### Phase 4 (Planned)
- Remote support integration
- Screen sharing
- Remote command execution
- File transfer

### Phase 5 (Planned)
- Android agent
- SSO integration
- AI-assisted troubleshooting
- High availability setup
