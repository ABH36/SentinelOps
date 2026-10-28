'use client';

import { useState } from 'react';
import Layout from '@/components/layout';
import {
  Shield,
  Copy,
  Check,
  QrCode,
  Terminal,
  Clock,
  Key,
  Monitor,
  Smartphone,
  ExternalLink,
  AlertCircle,
  Printer,
  Download,
  Link as LinkIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';
import InstallLinkGenerator from '@/components/InstallLinkGenerator';

export default function EnrollmentPage() {
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');
  const [expiresHours, setExpiresHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateToken = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.post('/enrollment/token', {
        expiresHours: Number(expiresHours),
      });

      setCreatedToken(res.data.token);
      setExpiresAt(res.data.expiresAt);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const windowsCmd = createdToken
    ? `iex (iwr '${apiUrl.replace('/api', '')}/install/windows-ps1?token=${createdToken}' -UseBasicParsing).Content`
    : '';

  // Simple install QR - just download link
  const simpleInstallPayload = createdToken
    ? `${apiUrl.replace('/api', '')}/install/android?token=${createdToken}`
    : '';

  // DPC provisioning QR - full zero-touch compliant JSON
  const dpcProvisioningUrl = createdToken
    ? `${apiUrl}/enrollment/android-qr/${createdToken}`
    : '';

  if (activeTab === 'advanced') {
    return (
      <Layout>
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex items-center gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('simple')}
              className="px-4 py-3 text-sm font-semibold text-gray-600 hover:text-gray-900 border-b-2 border-transparent"
            >
              Simple Token Generator
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className="px-4 py-3 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600 flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              Install Link Generator
            </button>
          </div>

          <InstallLinkGenerator />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        {/* Tab Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('simple')}
              className="px-4 py-3 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600"
            >
              Simple Token Generator
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className="px-4 py-3 text-sm font-semibold text-gray-600 hover:text-gray-900 border-b-2 border-transparent flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              Install Link Generator
            </button>
          </div>
          
          {createdToken && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors print:hidden"
            >
              <Printer className="w-4 h-4" />
              Print QR Cards
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2 print:hidden">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Generation Config Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5 print:hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Generate Token</h2>
                <p className="text-xs text-gray-500">Cryptographic one-time onboarding token</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Token Expiration
              </label>
              <select
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value={8}>8 Hours (Single shift)</option>
                <option value={24}>24 Hours (Standard)</option>
                <option value={72}>72 Hours (Weekend / Staged rollouts)</option>
                <option value={168}>7 Days (Batch deployments)</option>
              </select>
            </div>

            <button
              onClick={handleGenerateToken}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              {loading ? 'Generating...' : 'Create Enrollment Token'}
            </button>

            <div className="pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-2">
              <div className="flex items-center gap-2 font-medium text-gray-700">
                <Shield className="w-4 h-4 text-emerald-600" />
                Zero-Trust Guarantee
              </div>
              <p>
                Tokens expire automatically upon first successful device registration. Device secret keys are never
                re-used.
              </p>
            </div>
          </div>

          {/* Active Enrollment Result */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            {!createdToken ? (
              <div className="py-20 text-center print:hidden">
                <Terminal className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-800">No active token created yet</h3>
                <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                  Select your desired expiration window on the left and click Generate to produce one-click installation
                  scripts and Android QR provisioning payloads.
                </p>
              </div>
            ) : (
              <>
                <div className="print:hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      One-Time Enrollment Token
                    </span>
                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Valid until {new Date(expiresAt!).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="font-mono text-sm text-gray-800 break-all select-all flex-1">
                      {createdToken}
                    </span>
                    <button
                      onClick={() => copyToClipboard(createdToken, 'token')}
                      className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Copy Token"
                    >
                      {copiedType === 'token' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Windows 1-Click Instructions */}
                <div className="space-y-2 print:hidden">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <Monitor className="w-4 h-4 text-blue-600" />
                      Windows Deployment (PowerShell One-Liner)
                    </span>
                    <button
                      onClick={() => copyToClipboard(windowsCmd, 'windows')}
                      className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                    >
                      {copiedType === 'windows' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Script</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-3 bg-gray-900 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto select-all">
                    {windowsCmd}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Run as Administrator. Downloads installer, enrolls device, and starts service automatically.
                  </p>
                </div>

                {/* Android Enterprise Provisioning - TWO QR CODES */}
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-4">
                    <Smartphone className="w-5 h-5 text-emerald-600" />
                    Android Enrollment Options
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* LEFT QR: Simple Install (Existing Devices) */}
                    <div className="border-2 border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-center">
                        <div className="p-3 bg-white rounded-lg shadow-sm">
                          <QRCodeSVG value={simpleInstallPayload} size={160} level="H" />
                        </div>
                      </div>
                      <div className="text-center space-y-1">
                        <div className="flex items-center justify-center gap-1.5">
                          <Download className="w-4 h-4 text-blue-600" />
                          <h3 className="text-sm font-bold text-blue-900">Existing Devices</h3>
                        </div>
                        <p className="text-xs text-blue-700 leading-relaxed">
                          Scan with camera app to download and install SentinelOps Agent on already-configured devices.
                        </p>
                      </div>
                    </div>

                    {/* RIGHT QR: DPC Zero-Touch (New/Factory Reset Devices) */}
                    <div className="border-2 border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-center">
                        <div className="p-3 bg-white rounded-lg shadow-sm">
                          <QRCodeSVG value={dpcProvisioningUrl} size={160} level="H" />
                        </div>
                      </div>
                      <div className="text-center space-y-1">
                        <div className="flex items-center justify-center gap-1.5">
                          <Shield className="w-4 h-4 text-emerald-600" />
                          <h3 className="text-sm font-bold text-emerald-900">New/Factory Reset</h3>
                        </div>
                        <p className="text-xs text-emerald-700 leading-relaxed">
                          Tap welcome screen 6 times, scan this QR for full Device Owner mode zero-touch provisioning.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <strong className="font-semibold">⚠️ Important:</strong> For maximum control (kiosk mode, camera
                      disable, uninstall prevention), use the <strong>right QR code</strong> during Android device setup.
                      The left QR is for standard app installation on existing devices.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Print-only version with better layout */}
        {createdToken && (
          <div className="hidden print:block mt-8 space-y-6">
            <div className="text-center border-b-2 border-gray-300 pb-4">
              <h1 className="text-3xl font-bold text-gray-900">SentinelOps Device Enrollment</h1>
              <p className="text-sm text-gray-600 mt-2">
                Token: <span className="font-mono font-semibold">{createdToken}</span>
              </p>
              <p className="text-xs text-gray-500">Valid until {new Date(expiresAt!).toLocaleString()}</p>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="text-center border-2 border-blue-400 rounded-lg p-6">
                <div className="inline-block p-4 bg-white">
                  <QRCodeSVG value={simpleInstallPayload} size={200} level="H" />
                </div>
                <h2 className="text-xl font-bold text-blue-900 mt-4">Existing Android Devices</h2>
                <p className="text-sm text-gray-700 mt-2">
                  Scan with camera to download and install agent
                </p>
              </div>

              <div className="text-center border-2 border-emerald-400 rounded-lg p-6">
                <div className="inline-block p-4 bg-white">
                  <QRCodeSVG value={dpcProvisioningUrl} size={200} level="H" />
                </div>
                <h2 className="text-xl font-bold text-emerald-900 mt-4">New/Factory Reset Devices</h2>
                <p className="text-sm text-gray-700 mt-2">
                  Tap welcome screen 6×, scan for zero-touch provisioning
                </p>
              </div>
            </div>

            <div className="border-t-2 border-gray-300 pt-4 text-center text-xs text-gray-600">
              <p>Generated on {new Date().toLocaleString()} • SentinelOps MDM Platform</p>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 20px;
          }
          .print\\:hidden {
            display: none !important;
          }
          .hidden.print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </Layout>
  );
}
