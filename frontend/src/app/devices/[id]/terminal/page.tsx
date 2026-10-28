'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Terminal as TerminalIcon, ArrowLeft, X, Loader2, AlertCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import Layout from '@/components/layout';
import api from '@/lib/api';

interface TerminalLine {
  text: string;
  isError: boolean;
  timestamp: string;
}

/**
 * Real-time terminal page for executing commands and viewing live output.
 * Connects to backend WebSocket gateway to stream stdout/stderr line-by-line.
 */
export default function TerminalPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;

  const [device, setDevice] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [currentCommandId, setCurrentCommandId] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load device info
  useEffect(() => {
    const loadDevice = async () => {
      try {
        const response = await api.get(`/devices/${deviceId}`);
        setDevice(response.data);
      } catch (error) {
        console.error('Error loading device:', error);
      }
    };

    loadDevice();
  }, [deviceId]);

  // Setup WebSocket connection
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const wsUrl = apiUrl.replace('/api', '').replace('http', 'ws');

    // Connect to agent gateway as admin client
    const newSocket = io(`${wsUrl}/agent-gateway`, {
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('token'), // TODO: Replace with actual auth token
      },
      query: {
        tenantId: localStorage.getItem('tenantId') || 'default', // TODO: Get from auth context
      },
      extraHeaders: {
        Authorization: `Bearer ${localStorage.getItem('token') || 'dev-token'}`,
      },
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected to agent gateway');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setConnected(false);
    });

    newSocket.on('connection:ack', (data) => {
      console.log('Connection acknowledged:', data);
    });

    // Listen for terminal output lines
    newSocket.on('terminal:line', (data: any) => {
      console.log('Terminal line received:', data);
      setTerminalLines((prev) => [
        ...prev,
        {
          text: data.line,
          isError: data.isError || false,
          timestamp: data.timestamp,
        },
      ]);
    });

    // Listen for terminal completion
    newSocket.on('terminal:complete', (data: any) => {
      console.log('Terminal command completed:', data);
      setIsExecuting(false);
      setExitCode(data.exitCode);
      setTerminalLines((prev) => [
        ...prev,
        {
          text: `\n[Process exited with code ${data.exitCode}]`,
          isError: data.exitCode !== 0,
          timestamp: data.timestamp,
        },
      ]);
    });

    // Listen for terminal activity (all commands on this device)
    newSocket.on('terminal:activity', (data: any) => {
      console.log('Terminal activity:', data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Auto-scroll terminal to bottom when new lines appear
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // Execute command
  const executeCommand = async () => {
    if (!commandInput.trim() || isExecuting) return;

    try {
      setIsExecuting(true);
      setExitCode(null);
      setTerminalLines([
        ...terminalLines,
        {
          text: `$ ${commandInput}`,
          isError: false,
          timestamp: new Date().toISOString(),
        },
      ]);

      // Create EXECUTE_COMMAND remote action
      const response = await api.post(`/remote-actions`, {
        deviceId: deviceId,
        actionType: 'EXECUTE_COMMAND',
        priority: 'NORMAL',
        payload: {
          command: commandInput,
          streamOutput: true, // Enable line-by-line streaming
        },
      });

      const commandId = response.data.id;
      setCurrentCommandId(commandId);

      // Join terminal room to receive output
      if (socket && connected) {
        socket.emit('terminal:join', { commandId }, (response: any) => {
          console.log('Joined terminal room:', response);
        });
      }

      setCommandInput('');

    } catch (error: any) {
      console.error('Error executing command:', error);
      setTerminalLines((prev) => [
        ...prev,
        {
          text: `Error: ${error.response?.data?.message || error.message}`,
          isError: true,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsExecuting(false);
    }
  };

  // Interrupt running command (Ctrl+C)
  const interruptCommand = () => {
    if (!currentCommandId || !socket || !connected) return;

    socket.emit('terminal:interrupt', {
      commandId: currentCommandId,
      deviceId: deviceId,
    }, (response: any) => {
      console.log('Interrupt sent:', response);
      setTerminalLines((prev) => [
        ...prev,
        {
          text: '^C',
          isError: false,
          timestamp: new Date().toISOString(),
        },
      ]);
    });
  };

  // Clear terminal
  const clearTerminal = () => {
    setTerminalLines([]);
    setExitCode(null);
    setCurrentCommandId(null);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      interruptCommand();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearTerminal();
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link
                  href={`/devices/${deviceId}`}
                  className="text-gray-600 hover:text-gray-900 transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <div className="flex items-center gap-3">
                    <TerminalIcon className="w-6 h-6 text-gray-700" />
                    <h1 className="text-2xl font-bold text-gray-900">Terminal</h1>
                  </div>
                  {device && (
                    <p className="text-sm text-gray-600 mt-1">
                      {device.deviceName} ({device.platform})
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Connection status */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      connected ? 'bg-green-500' : 'bg-red-500'
                    } animate-pulse`}
                  ></div>
                  <span className="text-sm text-gray-600">
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                <button
                  onClick={clearTerminal}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition"
                  disabled={terminalLines.length === 0}
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Terminal Container */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
            {/* Terminal Output */}
            <div
              ref={terminalRef}
              className="h-[600px] overflow-y-auto p-4 font-mono text-sm"
              style={{ fontFamily: '"Fira Code", "Courier New", monospace' }}
            >
              {terminalLines.length === 0 && (
                <div className="text-gray-500">
                  <p>SentinelOps Remote Terminal</p>
                  <p className="mt-2">
                    Type a command and press Enter to execute on {device?.deviceName || 'device'}
                  </p>
                  <p className="mt-1 text-xs">
                    Ctrl+C to interrupt • Ctrl+L to clear
                  </p>
                </div>
              )}

              {terminalLines.map((line, index) => (
                <div
                  key={index}
                  className={`${
                    line.isError ? 'text-red-400' : 'text-green-400'
                  } whitespace-pre-wrap break-words`}
                >
                  {line.text}
                </div>
              ))}

              {isExecuting && (
                <div className="flex items-center gap-2 text-yellow-400 mt-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Executing...</span>
                </div>
              )}
            </div>

            {/* Terminal Input */}
            <div className="bg-gray-800 border-t border-gray-700 p-4">
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-mono">$</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter command..."
                  disabled={isExecuting || !connected}
                  className="flex-1 bg-transparent text-green-400 font-mono outline-none placeholder-gray-600 disabled:text-gray-600"
                  autoFocus
                />
                {isExecuting && (
                  <button
                    onClick={interruptCommand}
                    className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition"
                  >
                    Stop (Ctrl+C)
                  </button>
                )}
                {!isExecuting && (
                  <button
                    onClick={executeCommand}
                    disabled={!commandInput.trim() || !connected}
                    className="px-4 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Execute
                  </button>
                )}
              </div>

              {!connected && (
                <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>WebSocket disconnected. Reconnecting...</span>
                </div>
              )}
            </div>
          </div>

          {/* Help Text */}
          <div className="mt-4 text-sm text-gray-600">
            <h3 className="font-semibold mb-2">Example Commands:</h3>
            <ul className="space-y-1">
              <li>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                  ping google.com -n 5
                </code>{' '}
                - Network connectivity test
              </li>
              <li>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                  Get-Service | Where-Object Status -eq 'Running'
                </code>{' '}
                - List running services (PowerShell)
              </li>
              <li>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                  systemctl status sentinel-agent
                </code>{' '}
                - Check agent status (Linux)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
