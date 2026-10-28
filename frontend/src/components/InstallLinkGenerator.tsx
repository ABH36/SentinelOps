'use client';

import { useState } from 'react';
import {
  Shield,
  Copy,
  Check,
  Terminal,
  Clock,
  Link as LinkIcon,
  Mail,
  Monitor,
  Smartphone,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';

interface InstallLinkData {
  token: string;
  expiresAt: string;
  maxUses?: number;
  links: {
    windows: string;
    android: string;
    universal: string;
    windowsScript: string;
  };
  qrCodes: {
    simpleInstall: string;
    deviceOwner: string;
  };
  powershellOneLiner: string;
  emailTemplate: string;
}

export default function InstallLinkGenerator() {
  const [label, setLabel] = useState('');
  const [expiresHours, setExpiresHours] = useState(24);
  const [maxUses, setMaxUses] = useState<number | undefined>(undefined);
  const [platform, setPlatform] = useState<'windows' | 'android' | 'both'>('both');
  const [loading, setLoading] = useState(false);
  const [installLink, setInstallLink] = useState<InstallLinkData | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await api.post('/enrollment/generate-install-link', {
        label: label || undefined,
        expiresHours: Number(expiresHours),
        maxUses: maxUses || undefined,
        platform,
      });

      setInstallLink(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate install link');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 3000);
  };

  const CopyButton = ({ text, type, label }: { text: string; type: string; label: string }) => (
    <button
      onClick={() => copyToClipboard(text, type)}
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
    >
      {copiedType === type ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-emerald-600">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Install Link Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate shareable installation links with QR codes, PowerShell commands, and email templates.
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Configuration</h2>
              <p className="text-xs text-gray-500">Customize deployment link</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Label (Optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Q4 2024 Deployment"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as any)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="both">Windows + Android</option>
              <option value="windows">Windows Only</option>
              <option value="android">Android Only</option>
            </select>
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
              <option value={8}>8 Hours</option>
              <option value={24}>24 Hours</option>
              <option value={72}>72 Hours</option>
              <option value={168}>7 Days</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Max Uses (Optional)
            </label>
            <input
              type="number"
              value={maxUses || ''}
              onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Unlimited"
              min="1"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for unlimited uses</p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            {loading ? 'Generating...' : 'Generate Install Link'}
          </button>

          <div className="pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-2">
            <div className="flex items-center gap-2 font-medium text-gray-700">
              <Shield className="w-4 h-4 text-emerald-600" />
              Secure Distribution
            </div>
            <p>
              Links contain cryptographically secure enrollment tokens. Share via email or print QR codes for physical distribution.
            </p>
          </div>
        </div>

        {/* Results Card */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          {!installLink ? (
            <div className="py-20 text-center">
              <Terminal className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-800">No install link generated yet</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Configure your deployment settings and click Generate to create shareable installation links, QR codes, and email templates.
              </p>
            </div>
          ) : (
            <>
              {/* Token Info */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Enrollment Token
                  </span>
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Valid until {new Date(installLink.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="font-mono text-sm text-gray-800 break-all select-all flex-1">
                    {installLink.token}
                  </span>
                  <CopyButton text={installLink.token} type="token" label="Copy" />
                </div>
              </div>

              {/* Installation Links */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-800">📦 Direct Download Links</h3>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-900">Windows Installer</span>
                    </div>
                    <CopyButton text={installLink.links.windows} type="windows-link" label="Copy Link" />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-900">Android APK</span>
                    </div>
                    <CopyButton text={installLink.links.android} type="android-link" label="Copy Link" />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-semibold text-purple-900">Universal Link (Auto-detect)</span>
                    </div>
                    <CopyButton text={installLink.links.universal} type="universal-link" label="Copy Link" />
                  </div>
                </div>
              </div>

              {/* PowerShell One-Liner */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">💻 PowerShell One-Liner</h3>
                  <CopyButton text={installLink.powershellOneLiner} type="ps1" label="Copy Command" />
                </div>
                <div className="p-3 bg-gray-900 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto select-all">
                  {installLink.powershellOneLiner}
                </div>
                <p className="text-xs text-gray-500">
                  Run as Administrator on target Windows machines for automatic installation and enrollment.
                </p>
              </div>

              {/* QR Codes */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-800">📱 QR Codes</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 text-center space-y-2">
                    <QRCodeSVG value={installLink.qrCodes.simpleInstall} size={120} level="H" className="mx-auto" />
                    <p className="text-xs font-semibold text-blue-900">Simple Install</p>
                    <p className="text-xs text-blue-700">Existing devices</p>
                  </div>
                  <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 text-center space-y-2">
                    <QRCodeSVG value={installLink.qrCodes.deviceOwner} size={120} level="H" className="mx-auto" />
                    <p className="text-xs font-semibold text-emerald-900">DPC Zero-Touch</p>
                    <p className="text-xs text-emerald-700">Factory reset devices</p>
                  </div>
                </div>
              </div>

              {/* Email Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">📧 Email Template</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowEmailPreview(!showEmailPreview)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      {showEmailPreview ? 'Hide' : 'Preview'}
                    </button>
                    <CopyButton text={installLink.emailTemplate} type="email" label="Copy HTML" />
                  </div>
                </div>
                
                {showEmailPreview && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div
                      className="max-h-96 overflow-y-auto p-4 bg-white"
                      dangerouslySetInnerHTML={{ __html: installLink.emailTemplate }}
                    />
                  </div>
                )}
                
                <p className="text-xs text-gray-500">
                  Copy the HTML template and paste it into your email client for professional deployment emails.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
