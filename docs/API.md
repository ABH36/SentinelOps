# SentinelOps Enterprise API Documentation

## Base URL

```
http://localhost:3001/api
```

## Authentication

Most endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Device endpoints use device credentials via custom headers:

```
X-Device-Key: <device_key>
X-Device-Secret: <device_secret>
```

## Endpoints

### Authentication

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@company.com",
  "password": "password123",
  "mfaCode": "123456" // Required if MFA is enabled
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "admin@company.com",
    "firstName": "John",
    "lastName": "Doe",
    "isMfaEnabled": true,
    "tenantId": "uuid"
  }
}
```

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "admin@company.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "tenantId": "uuid" // Optional - creates default tenant if not provided
}
```

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Setup MFA
```http
POST /auth/mfa/setup
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,..."
}
```

#### Enable MFA
```http
POST /auth/mfa/enable
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "123456"
}
```

#### Disable MFA
```http
POST /auth/mfa/disable
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "123456"
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <access_token>
```

### Users

#### Create User
```http
POST /users
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "user@company.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith",
  "tenantId": "uuid"
}
```

**Permissions:** `users.write`

#### List Users
```http
GET /users
Authorization: Bearer <access_token>
```

**Permissions:** `users.read`

#### Get User
```http
GET /users/:id
Authorization: Bearer <access_token>
```

**Permissions:** `users.read`

#### Update User
```http
PUT /users/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Doe"
}
```

**Permissions:** `users.write`

#### Delete User
```http
DELETE /users/:id
Authorization: Bearer <access_token>
```

**Permissions:** `users.delete`

#### Assign Role
```http
POST /users/:id/roles/:roleId
Authorization: Bearer <access_token>
```

**Permissions:** `roles.manage`

#### Remove Role
```http
DELETE /users/:id/roles/:roleId
Authorization: Bearer <access_token>
```

**Permissions:** `roles.manage`

### Devices

#### Create Device
```http
POST /devices
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "deviceId": "device-uuid",
  "deviceName": "Laptop-001",
  "platform": "WINDOWS",
  "osVersion": "Windows 11",
  "tenantId": "uuid",
  "assignedEmployeeId": "uuid" // Optional
}
```

**Permissions:** `devices.write`

#### List Devices
```http
GET /devices?platform=WINDOWS&status=ACTIVE
Authorization: Bearer <access_token>
```

**Permissions:** `devices.read`

#### Get Device
```http
GET /devices/:id
Authorization: Bearer <access_token>
```

**Permissions:** `devices.read`

#### Get Device by Device ID
```http
GET /devices/by-device-id/:deviceId
Authorization: Bearer <access_token>
```

**Permissions:** `devices.read`

#### Update Device
```http
PUT /devices/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "deviceName": "Laptop-001-Updated",
  "status": "ACTIVE"
}
```

**Permissions:** `devices.write`

#### Delete Device
```http
DELETE /devices/:id
Authorization: Bearer <access_token>
```

**Permissions:** `devices.delete`

### Enrollment

#### Create Enrollment Token
```http
POST /enrollment/token
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "deviceId": "device-uuid", // Optional
  "expiresHours": 24 // Optional, default 24
}
```

**Permissions:** `devices.enroll`

**Response:**
```json
{
  "token": "a1b2c3d4e5f6...",
  "expiresAt": "2024-01-02T00:00:00Z"
}
```

#### Enroll Device (Agent)
```http
POST /enrollment/enroll
Content-Type: application/json

{
  "token": "a1b2c3d4e5f6...",
  "deviceId": "generated-device-id",
  "deviceName": "Laptop-001",
  "platform": "WINDOWS",
  "osVersion": "Windows 11",
  "hardwareInfo": {
    "cpu": "Intel Core i7",
    "cpuCores": 8,
    "ram": 16,
    "manufacturer": "Dell",
    "model": "Latitude 7420"
  }
}
```

**Response:**
```json
{
  "deviceKey": "abc123...",
  "deviceSecret": "xyz789...",
  "deviceId": "uuid"
}
```

#### Revoke Enrollment Token
```http
DELETE /enrollment/token/:token
Authorization: Bearer <access_token>
```

**Permissions:** `devices.enroll`

#### Get Active Enrollment
```http
GET /enrollment/device/:deviceId
Authorization: Bearer <access_token>
```

### Inventory

#### Submit Inventory (Agent)
```http
POST /inventory/submit
X-Device-Key: <device_key>
X-Device-Secret: <device_secret>
Content-Type: application/json

{
  "hardware": {
    "manufacturer": "Dell",
    "model": "Latitude 7420",
    "serialNumber": "ABC123",
    "cpu": "Intel Core i7",
    "cpuCores": 8,
    "ram": 16,
    "storage": 512,
    "storageType": "SSD"
  },
  "operatingSystem": {
    "name": "Windows",
    "version": "Windows 11",
    "build": "22621",
    "architecture": "x64"
  },
  "network": {
    "macAddress": "00:11:22:33:44:55",
    "ipAddress": "192.168.1.100",
    "hostname": "LAPTOP-001"
  },
  "software": {
    "installedApplications": [...]
  },
  "security": {
    "antivirus": "Windows Defender",
    "firewallEnabled": true
  },
  "agent": {
    "version": "0.1.0",
    "installDate": "2024-01-01T00:00:00Z"
  }
}
```

#### Get Latest Inventory
```http
GET /inventory/device/:deviceId
Authorization: Bearer <access_token>
```

**Permissions:** `inventory.read`

#### Get Inventory History
```http
GET /inventory/device/:deviceId/history?limit=10&offset=0
Authorization: Bearer <access_token>
```

**Permissions:** `inventory.read`

### Heartbeat

#### Submit Heartbeat (Agent)
```http
POST /heartbeat/submit
X-Device-Key: <device_key>
X-Device-Secret: <device_secret>
Content-Type: application/json

{
  "health": {
    "cpuUsage": 25.5,
    "memoryUsage": 65.2,
    "diskUsage": 45.0,
    "batteryLevel": 85,
    "batteryStatus": "Charging",
    "uptime": 3600
  },
  "connectivity": {
    "latency": 10,
    "networkSpeed": 1000,
    "isConnected": true,
    "connectionType": "WiFi"
  },
  "agent": {
    "status": "healthy",
    "lastCommand": "none",
    "pendingCommands": 0
  }
}
```

#### Get Latest Heartbeat
```http
GET /heartbeat/device/:deviceId
Authorization: Bearer <access_token>
```

**Permissions:** `devices.read`

#### Get Heartbeat History
```http
GET /heartbeat/device/:deviceId/history?limit=100&offset=0
Authorization: Bearer <access_token>
```

**Permissions:** `devices.read`

### Audit Logs

#### List Audit Events
```http
GET /audit?eventType=USER_LOGIN&userId=uuid&startDate=2024-01-01&endDate=2024-01-31&limit=50&offset=0
Authorization: Bearer <access_token>
```

**Permissions:** `audit.read`

**Response:**
```json
{
  "events": [...],
  "total": 100
}
```

#### Verify Audit Chain
```http
GET /audit/verify
Authorization: Bearer <access_token>
```

**Permissions:** `audit.read`

**Response:**
```json
{
  "isValid": true,
  "brokenAt": null
}
```

## Error Responses

All endpoints may return error responses:

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

Common status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error
