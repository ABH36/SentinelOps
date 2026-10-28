# SentinelOps Android Agent (Android Enterprise DPC)

## Overview

The SentinelOps Android Agent is an enterprise Device Policy Controller (DPC) designed for company-owned Android smartphones (Android 10+).

## Management Modes

1. **Fully Managed Device (Device Owner):**
   - For dedicated company-issued smartphones.
   - Enrolled via 6-tap QR code or Zero-Touch.
   - Central control over device lock, wipe, compliance, and managed apps.

2. **Work Profile (Profile Owner):**
   - For BYOD / corporate-owned with personal privacy.
   - Isolates company data in a dedicated encrypted container.
   - Personal applications and personal activity cannot be monitored.

## Key Capabilities

- **Device Policy Enforcement:** Screen lock complexity, biometric requirements, encryption.
- **Inventory & Telemetry:** Battery level, storage, OS build, and managed app versions.
- **Remote Commands:** Immediate lock, remote wipe, and policy synchronization.
- **Compliance Monitoring:** Flags rooted devices (SafetyNet/Play Integrity), outdated OS versions, or disabled policies.

## Enrollment Instructions

1. On a new or factory-reset device, tap the welcome screen 6 times.
2. Scan the QR code generated in the SentinelOps Enrollment Hub (`/enrollment`).
3. Follow the Android Enterprise onboarding wizard.
4. The device is automatically registered and reports back to the SentinelOps control plane.
