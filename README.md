# SentinelOps Enterprise

Enterprise device management platform for company-owned Windows laptops and Android smartphones.

## Overview

SentinelOps Enterprise provides centralized visibility and control over company-issued devices, including:

- Device inventory and health monitoring
- Secure enrollment and credential management
- Remote diagnostics and maintenance
- Application usage analytics (where supported)
- Policy compliance tracking
- Audit logging and evidence collection
- Role-based access control

## Architecture

- **Frontend**: Next.js + TypeScript
- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis
- **Windows Agent**: C#/.NET Windows service
- **Android Agent**: Kotlin (future)

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker and Docker Compose (for local development)
- .NET SDK >= 7.0 (for Windows agent development)

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start infrastructure services:
   ```bash
   npm run docker:up
   ```
4. Run development servers:
   ```bash
   npm run dev
   ```

The frontend will be available at http://localhost:3000
The backend API will be available at http://localhost:3001

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## Project Structure

```
sentinelops-enterprise/
├── frontend/          # Next.js admin dashboard
├── backend/           # NestJS API server
├── windows-agent/     # C#/.NET Windows service
├── android-agent/     # Kotlin Android application (future)
├── shared/            # Shared TypeScript types
├── infrastructure/    # Docker, CI/CD configs
├── docker-compose.yml # Local development environment
└── package.json       # Monorepo configuration
```

## Documentation

- [API Documentation](./docs/API.md)
- [Windows Agent Installation](./docs/WINDOWS_AGENT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Security Model](./docs/SECURITY.md)

## Security

This platform handles sensitive device and employee data. Key security features:

- Multi-factor authentication for administrators
- Role-based access control
- TLS encryption for all communications
- Signed agent releases
- Audit logging with tamper evidence
- Tenant data isolation

## License

Proprietary - All rights reserved
