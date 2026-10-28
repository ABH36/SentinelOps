# SentinelOps Enterprise: Security Model, Privacy & Legal Review

**Document Version:** 1.0.0  
**Classification:** Enterprise IT & Legal Compliance Reference  

---

## 1. Security Architecture & Threat Model

SentinelOps Enterprise manages corporate-owned endpoints and sensitive employee productivity telemetry. The platform adheres to **Zero-Trust**, **Least Privilege**, and **Defense-in-Depth** principles.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEFENSE IN DEPTH MATRIX                         │
├───────────────────┬────────────────────────────────────────────────────┤
│ Perimeter & Admin │ TLS 1.3, MFA (TOTP), Session Revocation, RBAC       │
├───────────────────┼────────────────────────────────────────────────────┤
│ Device Lifecycle  │ Ephemeral One-Time Tokens, Key+Secret Rotation     │
├───────────────────┼────────────────────────────────────────────────────┤
│ Remote Operations │ Dual-Control (2-Admin Approval) for Destructive Cmd│
├───────────────────┼────────────────────────────────────────────────────┤
│ Telemetry & Audit │ Cryptographic SHA-256 Hash Chaining Provenance     │
├───────────────────┼────────────────────────────────────────────────────┤
│ Data Isolation    │ Multi-Tenant Partitioning, Tenant ID Enforced      │
└───────────────────┴────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Authorization

### 2.1 Administrator Identity & MFA
- All administrative accounts require **Multi-Factor Authentication (MFA)** powered by RFC 6238 Time-based One-Time Password (TOTP) standards via Speakeasy.
- Passwords are salted and hashed using **bcrypt** with a minimum work factor of 10.
- Sessions issue short-lived JWT access tokens (8 hours) with refresh token rotation.

### 2.2 Device Authentication (Agent-to-Cloud)
- Device onboarding requires a cryptographic 32-byte hex token with strict expiration windows (8h, 24h, 72h).
- Upon enrollment, a unique `X-Device-Key` (16 bytes) and `X-Device-Secret` (32 bytes) are securely provisioned to the agent and salted in the backend.
- Agent transmissions must pass mutual credential verification. Revoking a device key immediately terminates all communication.

---

## 3. Remote Operations & Dual-Control Security

Certain remote actions carry severe operational consequences (e.g., factory reset/wipe, workstation lock, employee offboarding). To prevent insider threat, privilege escalation, or accidental data destruction, SentinelOps enforces **Dual-Control Approval (Two-Person Rule)**:

| Operation | Risk Level | Authorization Model | Execution Confirmation |
|---|---|---|---|
| **Inventory Refresh** | Low | Single Admin | Immediate queue dispatch |
| **Diagnostics Bundle** | Low | Single Admin | Immediate queue dispatch |
| **Workstation Lock** | Medium | Single Admin | Immediate queue dispatch with agent lock callback |
| **System Restart** | Medium | Single Admin | 60-second graceful user notification |
| **Retire Device** | High | Dual Admin Approval | Certificate revocation & agent self-removal |
| **Remote Factory Wipe** | Critical | Dual Admin Approval + Re-Auth | Full cryptographically verified device wipe |

*Rule:* An administrator who initiates a high-risk action **cannot** approve their own request.

---

## 4. Evidence Integrity & Cryptographic Provenance

A core business problem addressed by SentinelOps is obtaining **verifiable, legally defensible evidence** of compliance or policy violations.

### 4.1 SHA-256 Hash Chaining
Every audit log and application usage telemetry event is cryptographically linked to the preceding record:

$$\text{EventHash}_n = \text{SHA-256}(\text{Payload}_n \parallel \text{Timestamp}_n \parallel \text{EventHash}_{n-1})$$

- If any record is modified, backdated, or deleted in the database, the hash chain breaks immediately.
- The administrator dashboard includes a continuous verification engine (`GET /audit/verify`) proving ledger integrity.

### 4.2 Objective Facts vs. Subjective Inferences
The system explicitly separates:
1. **Measured Facts:** Foreground process name, window title, duration in seconds, input idle time (keyboard/mouse).
2. **Contextual Analysis:** Training, approved breaks, background indexing, testing, and multi-monitor setups must be considered before concluding employee misconduct.

---

## 5. PRD Section 8: Technical & Legal Review

### 1. Background Monitoring vs. Covert / Secret Monitoring
- **Policy:** Covert (hidden) monitoring without employee disclosure creates severe legal liabilities under GDPR, CCPA, and labor laws in most jurisdictions.
- **Implementation:** The SentinelOps Agent runs as a transparent, signed system service (`SentinelOps Agent`). While unobtrusive in daily CPU/RAM usage, it is visible in the Windows Services console and Android Settings, maintaining regulatory transparency.

### 2. Available Usage Metrics by OS
- **Windows 10/11:** Foreground window title and process duration via Win32 `GetForegroundWindow` / `GetWindowThreadProcessId`. User idle duration via `GetLastInputInfo`.
- **Android 11+:** Managed app inventory and usage stats via Android Enterprise `UsageStatsManager` (where authorized by enterprise policy). Universal keystroke tracking across personal apps is intentionally unsupported to protect user privacy.

### 3. Remote Support & Screen Sharing
- Remote support sessions require explicit authorization and a visible desktop indicator to ensure the employee is aware of active assistance. Unannounced screen takeover is restricted.

### 4. Tamper Resistance
- If an employee attempts to terminate the agent service:
  1. Service recovery settings automatically restart the service.
  2. The backend heartbeat timeout detector flags the device as `OFFLINE` within 10 minutes.
  3. A `DEVICE_OFFLINE` alert is raised in the Admin Console.
