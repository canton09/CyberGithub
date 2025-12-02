import React, { useEffect, useRef } from 'react';
import { AppStatus } from '../types';

interface SystemLogProps {
  status: AppStatus;
  logs: string[];
}

const SystemLog: React.FC<SystemLogProps> = ({ status, logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getStatusColor = () => {
    switch (status) {
      case AppStatus.SCANNING: return 'text-yellow-400 animate-pulse';
      case AppStatus.ERROR: return 'text-red-500';
      case AppStatus.COMPLETE: return 'text-green-400';
      default: return 'text-cyan-600';
    }
  };

  const getStatusText = () => {
     switch (status) {
      case AppStatus.SCANNING: return '扫描中';
      case AppStatus.ERROR: return '错误';
      case AppStatus.COMPLETE: return '就绪';
      default: return '待机';
    }
  }

  return (
    <div className="font-mono text-xs border-t-2 border-gray-800 bg-black p-4 h-32 overflow-y-auto w-full">
      <div className="flex justify-between items-center mb-2 sticky top-0 bg-black/90 pb-2 border-b border-gray-900">
        <span className="text-gray-500 uppercase">系统日志终端</span>
        <span className={`uppercase font-bold ${getStatusColor()}`}>
          [{getStatusText()}]
        </span>
      </div>
      <div className="space-y-1">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600">[{new Date().toLocaleTimeString('en-US', {hour12: false})}]</span>
            <span className="text-cyan-700">{'>'}</span>
            <span className="text-cyan-300/80">{log}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default SystemLog;