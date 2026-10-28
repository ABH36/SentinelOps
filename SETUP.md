# SentinelOps Enterprise - Setup Guide

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker and Docker Compose
- .NET SDK >= 7.0 (for Windows agent development)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Agent
```

2. Install dependencies:
```bash
npm install
```

3. Start infrastructure services:
```bash
npm run docker:up
```

4. Run database migrations:
```bash
cd backend
npm run migration:run
cd ..
```

5. Start development servers:
```bash
npm run dev
```

The services will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Initial Setup

### Create First User

1. Navigate to http://localhost:3000
2. You'll be redirected to the login page
3. Register a new account (this will create a default tenant)
4. After registration, you'll be logged in automatically

### Enable MFA (Recommended)

1. Click on your profile in the sidebar
2. Navigate to Settings
3. Click "Setup MFA"
4. Scan the QR code with your authenticator app
5. Enter the verification code to enable MFA

### Enroll a Device

1. Navigate to the Enrollment page
2. Click "Generate Enrollment Token"
3. Copy the token
4. Install the Windows agent on the target device
5. Run the enrollment command with the token
6. The device will appear in the Devices page

## Development

### Backend Development

```bash
cd backend
npm run start:dev  # Hot reload enabled
```

### Frontend Development

```bash
cd frontend
npm run dev  # Hot reload enabled
```

### Windows Agent Development

```bash
cd windows-agent
dotnet build
dotnet run  # Run as console app for development
```

To install as a Windows service:
```bash
sc create "SentinelOps Agent" binPath= "C:\path\to\SentinelOpsAgent.exe"
sc start "SentinelOps Agent"
```

## Testing

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### Windows Agent Tests

```bash
cd windows-agent
dotnet test
```

## Environment Variables

### Backend (.env)

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=sentinelops
DATABASE_PASSWORD=sentinelops_dev_password
DATABASE_NAME=sentinelops
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=8h
PORT=3001
NODE_ENV=development
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Windows Agent (appsettings.json)

```json
{
  "Agent": {
    "ApiUrl": "http://localhost:3001/api",
    "HeartbeatIntervalSeconds": 300,
    "InventoryIntervalSeconds": 3600
  }
}
```

## Production Deployment

### Build Backend

```bash
cd backend
npm run build
```

### Build Frontend

```bash
cd frontend
npm run build
```

### Build Windows Agent

```bash
cd windows-agent
dotnet publish -c Release -r win-x64 --self-contained
```

### Docker Deployment

```bash
docker-compose up -d
```

For production, modify `docker-compose.yml` to use production-ready settings:
- Change database passwords
- Use production JWT secrets
- Configure proper SSL/TLS
- Set resource limits
- Use health checks

## Troubleshooting

### Database Connection Issues

Ensure PostgreSQL is running:
```bash
docker-compose ps postgres
```

Check logs:
```bash
docker-compose logs postgres
```

### Redis Connection Issues

Ensure Redis is running:
```bash
docker-compose ps redis
```

### Backend Won't Start

Check if port 3001 is already in use:
```bash
# Windows
netstat -ano | findstr :3001

# Linux/Mac
lsof -i :3001
```

### Frontend Won't Start

Check if port 3000 is already in use:
```bash
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000
```

### Windows Agent Won't Enroll

1. Verify the enrollment token is valid
2. Check that the API URL is accessible
3. Review agent logs in `C:\ProgramData\SentinelOps Agent\logs\`
4. Check Windows Event Viewer for errors

## Additional Resources

- [API Documentation](./docs/API.md)
- [Windows Agent Installation](./docs/WINDOWS_AGENT.md)
- [Architecture Documentation](./docs/ARCHITECTURE.md)
- [Product Requirements](./PRD.md)

## Support

For issues or questions:
1. Check the documentation
2. Review the troubleshooting section
3. Check GitHub issues
4. Contact support
