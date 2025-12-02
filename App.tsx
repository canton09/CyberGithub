import React, { useState, useEffect, useRef } from 'react';
import { Repo, TimeFrame, AppStatus } from './types';
import { fetchTrendingRepos } from './services/geminiService';
import CyberButton from './components/CyberButton';
import RepoCard from './components/RepoCard';
import SystemLog from './components/SystemLog';
import CountDown from './components/CountDown';

const CACHE_PREFIX = 'cybergit_cache_';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TimeFrame>('3d');
  // Use a ref to track the latest requested tab to handle async race conditions
  const activeTabRef = useRef<TimeFrame>('3d');
  
  const [repos, setRepos] = useState<Repo[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [logs, setLogs] = useState<string[]>(['系统初始化完成...', '等待指令...']);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  // Helper: Get the most recent 5:00 AM or 5:00 PM timestamp
  const getLatestCheckpoint = (): number => {
    const now = new Date();
    const c1 = new Date(now);
    c1.setHours(5, 0, 0, 0); // Today 05:00
    
    const c2 = new Date(now);
    c2.setHours(17, 0, 0, 0); // Today 17:00

    // If now is before 05:00, the last checkpoint was yesterday 17:00
    if (now.getTime() < c1.getTime()) {
      const yesterday17 = new Date(now);
      yesterday17.setDate(yesterday17.getDate() - 1);
      yesterday17.setHours(17, 0, 0, 0);
      return yesterday17.getTime();
    }
    
    // If now is between 05:00 and 17:00, last checkpoint is Today 05:00
    if (now.getTime() < c2.getTime()) {
      return c1.getTime();
    }

    // If now is after 17:00, last checkpoint is Today 17:00
    return c2.getTime();
  };

  const loadCache = (frame: TimeFrame): { data: Repo[], timestamp: number } | null => {
    try {
      const stored = localStorage.getItem(CACHE_PREFIX + frame);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      if (!parsed.data || !parsed.timestamp) return null;

      // Check Expiration
      const checkpoint = getLatestCheckpoint();
      if (parsed.timestamp < checkpoint) {
        addLog(`缓存数据已过期 (上次更新: ${new Date(parsed.timestamp).toLocaleTimeString()})`);
        return null; // Cache is stale
      }

      return parsed;
    } catch (e) {
      console.error('Cache load error', e);
      return null;
    }
  };

  const saveCache = (frame: TimeFrame, data: Repo[]) => {
    const timestamp = Date.now();
    localStorage.setItem(CACHE_PREFIX + frame, JSON.stringify({ data, timestamp }));
    // Only update UI timestamp if this frame is still active
    if (activeTabRef.current === frame) {
      setLastUpdated(timestamp);
    }
  };

  const handleScan = async (frame: TimeFrame, forceRefresh: boolean = false) => {
    // Update active tab pointers immediately
    setActiveTab(frame);
    activeTabRef.current = frame;
    
    // 1. Try Cache First (if not forced)
    if (!forceRefresh) {
      const cached = loadCache(frame);
      if (cached) {
        setRepos(cached.data);
        setLastUpdated(cached.timestamp);
        setStatus(AppStatus.COMPLETE);
        addLog(`[本地缓存] 加载 ${frame} 数据成功。`);
        return;
      }
    }

    // 2. Fetch from API
    setStatus(AppStatus.SCANNING);
    const timeLabel = frame === '3d' ? '3天' : frame === '7d' ? '7天' : '14天';
    
    if (forceRefresh) {
      addLog(`指令: 强制刷新数据流...`);
    } else {
      addLog(`启动扫描序列 - 目标范围: 近${timeLabel}...`);
    }
    
    // Clear current view while loading to indicate activity
    setRepos([]); 

    try {
      const start = Date.now();
      const results = await fetchTrendingRepos(frame);
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      
      // CRITICAL: Check if the user has switched tabs while we were fetching
      if (activeTabRef.current !== frame) {
        console.log(`Scan for ${frame} completed but tab changed to ${activeTabRef.current}. Discarding.`);
        return;
      }

      setRepos(results);
      saveCache(frame, results); // Save to cache
      setStatus(AppStatus.COMPLETE);
      
      addLog(`扫描完成，耗时 ${duration}秒。锁定 ${results.length} 个目标。`);
    } catch (error: any) {
      // Check if we are still on the relevant tab
      if (activeTabRef.current !== frame) return;

      console.error(error);
      setStatus(AppStatus.ERROR);
      addLog(`严重错误: ${error.message || '未知网络故障'}`);
      
      // If error, try to restore old cache even if stale so user sees something
      const staleCache = localStorage.getItem(CACHE_PREFIX + frame);
      if (staleCache) {
        const parsed = JSON.parse(staleCache);
        setRepos(parsed.data);
        setLastUpdated(parsed.timestamp);
        addLog('恢复旧版本缓存数据以维持显示。');
      }
    }
  };

  const handleCopyReport = () => {
    if (repos.length === 0) {
      addLog('错误: 无数据可导出。');
      return;
    }
    
    const date = new Date().toLocaleDateString('zh-CN');
    let report = `🤖 *CyberGit 每日精选 (${date})*\n\n`;
    
    repos.forEach((repo, i) => {
      report += `**${i + 1}. ${repo.name.split('/')[1] || repo.name}**\n`;
      report += `⭐ 趋势: ${repo.starsTrend}\n`;
      report += `🔗 ${repo.url}\n`;
      report += `💡 ${repo.description}\n\n`;
    });
    
    report += `— 由 CyberGit Hunter 自动生成`;
    
    navigator.clipboard.writeText(report);
    addLog('简报已复制到剪贴板。');
    alert('精选简报已复制！');
  };

  // Initial load effect
  useEffect(() => {
    addLog('中枢接口已加载。就绪。');
    // Load default tab (3d)
    handleScan('3d', false);
  }, []);

  const formatLastUpdated = (ts: number | null) => {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col max-w-7xl mx-auto px-4 py-6 md:px-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-end border-b-2 border-cyan-900/50 pb-6 mb-8 gap-4">
        <div>
          <h1 className="text-4xl md:text-6xl font-cyber font-bold italic tracking-tighter text-white">
            CYBER<span className="text-cyan-400 neon-text-cyan">GIT</span>
            <span className="text-fuchsia-500 text-2xl align-top ml-2">v2.1</span>
          </h1>
          <p className="font-mono text-cyan-700 mt-2 text-sm uppercase tracking-widest">
            // 全自动开源情报猎杀系统
          </p>
        </div>
        <CountDown />
      </header>

      {/* Control Panel */}
      <div className="flex flex-col md:flex-row gap-6 mb-8 items-end">
        {/* Tabs */}
        <div className="flex gap-2 bg-gray-900/50 p-1 border border-gray-800 rounded-sm">
          {(['3d', '7d', '14d'] as TimeFrame[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                handleScan(tab, false); // Switch tab uses cache if available
              }}
              className={`
                px-6 py-2 font-mono font-bold text-sm transition-all
                ${activeTab === tab 
                  ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}
              `}
            >
              {tab === '3d' ? '近3日' : tab === '7d' ? '近7日' : '近14日'}
            </button>
          ))}
        </div>

        {/* Last Updated Badge */}
        {lastUpdated && (
          <div className="hidden md:flex flex-col text-right mr-auto ml-4 mb-2">
            <span className="text-[10px] text-gray-600 uppercase">上次同步时间</span>
            <span className="text-xs font-mono text-cyan-500/80 font-bold">
               {formatLastUpdated(lastUpdated)}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex-1 flex justify-end gap-4 w-full md:w-auto">
          <CyberButton 
            onClick={handleCopyReport}
            variant="green"
            disabled={repos.length === 0}
            className="hidden md:block"
          >
            复制简报
          </CyberButton>
          
          <CyberButton 
            onClick={() => handleScan(activeTab, true)} // Force refresh
            disabled={status === AppStatus.SCANNING}
            variant="pink"
            className="w-full md:w-auto"
          >
            {status === AppStatus.SCANNING ? '系统扫描中...' : '立即精选更新'}
          </CyberButton>
        </div>
      </div>

      {/* Main Content Grid */}
      <main className="flex-1 relative min-h-[400px]">
        {status === AppStatus.SCANNING && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/80 backdrop-blur-sm transition-opacity duration-300">
            <div className="text-center">
              <div className="inline-block w-16 h-16 border-4 border-t-cyan-500 border-r-transparent border-b-fuchsia-500 border-l-transparent rounded-full animate-spin mb-4"></div>
              <div className="font-cyber text-xl animate-pulse text-cyan-400">正在接入主网...</div>
              <div className="font-mono text-xs text-gray-500 mt-2">解密 GitHub API 信号流</div>
            </div>
          </div>
        )}

        {repos.length === 0 && status !== AppStatus.SCANNING && status !== AppStatus.ERROR && (
          <div className="h-full flex flex-col items-center justify-center text-gray-700 border-2 border-dashed border-gray-900 rounded-lg p-12">
            <div className="text-6xl mb-4 opacity-20">📡</div>
            <p className="font-mono text-lg">未检测到数据</p>
            <p className="font-mono text-sm mt-2">请点击上方按钮以获取目标。</p>
          </div>
        )}
        
        {status === AppStatus.ERROR && (
           <div className="h-full flex flex-col items-center justify-center text-red-500 border-2 border-red-900/50 bg-red-900/10 p-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="font-mono text-lg font-bold">系统故障</p>
            <p className="font-mono text-sm mt-2">连接已断开。请检查 API 密钥或网络。</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repos.map((repo, index) => (
            // Use name+index as key to ensure fresh render on list update
            <RepoCard key={`${repo.name}-${index}`} repo={repo} index={index} />
          ))}
        </div>
      </main>

      {/* Footer / Logs */}
      <footer className="mt-12">
        <SystemLog status={status} logs={logs} />
        <div className="flex justify-between items-center text-[10px] text-gray-600 font-mono mt-2 uppercase">
          <span>安全连接：已加密</span>
          <span>CYBERGIT_HUNTER © 2077</span>
        </div>
      </footer>
    </div>
  );
};

export default App;