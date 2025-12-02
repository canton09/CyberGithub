
import React, { useState, useEffect, useRef } from 'react';
import { Repo, TimeFrame, AppStatus } from './types';
import { fetchTrendingRepos } from './services/geminiService';
import CyberButton from './components/CyberButton';
import RepoCard from './components/RepoCard';
import SystemLog from './components/SystemLog';
import CountDown from './components/CountDown';

const CACHE_PREFIX = 'cybergit_cache_';
const FAV_STORAGE_KEY = 'cybergit_fav_vault'; // New key for full object storage

type ViewMode = 'scanner' | 'vault';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('scanner');
  const [activeTab, setActiveTab] = useState<TimeFrame>('3d');
  const activeTabRef = useRef<TimeFrame>('3d');
  
  const [repos, setRepos] = useState<Repo[]>([]);
  const [favorites, setFavorites] = useState<Repo[]>([]); // Now stores full objects
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
    c1.setHours(5, 0, 0, 0); 
    const c2 = new Date(now);
    c2.setHours(17, 0, 0, 0); 

    if (now.getTime() < c1.getTime()) {
      const yesterday17 = new Date(now);
      yesterday17.setDate(yesterday17.getDate() - 1);
      yesterday17.setHours(17, 0, 0, 0);
      return yesterday17.getTime();
    }
    if (now.getTime() < c2.getTime()) {
      return c1.getTime();
    }
    return c2.getTime();
  };

  const loadCache = (frame: TimeFrame): { data: Repo[], timestamp: number } | null => {
    try {
      const stored = localStorage.getItem(CACHE_PREFIX + frame);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      if (!parsed.data || !parsed.timestamp) return null;

      const checkpoint = getLatestCheckpoint();
      if (parsed.timestamp < checkpoint) {
        addLog(`缓存数据已过期 (上次更新: ${new Date(parsed.timestamp).toLocaleTimeString()})`);
        return null; 
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
    if (activeTabRef.current === frame) {
      setLastUpdated(timestamp);
    }
  };

  const handleScan = async (frame: TimeFrame, forceRefresh: boolean = false) => {
    setActiveTab(frame);
    activeTabRef.current = frame;
    
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

    setStatus(AppStatus.SCANNING);
    const timeLabel = frame === '3d' ? '3天' : frame === '7d' ? '7天' : '14天';
    
    if (forceRefresh) {
      addLog(`指令: 强制刷新数据流...`);
    } else {
      addLog(`启动扫描序列 - 目标范围: 近${timeLabel}...`);
    }
    
    setRepos([]); 

    try {
      const start = Date.now();
      const results = await fetchTrendingRepos(frame);
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      
      if (activeTabRef.current !== frame) {
        console.log(`Scan for ${frame} completed but tab changed. Discarding.`);
        return;
      }

      setRepos(results);
      saveCache(frame, results);
      setStatus(AppStatus.COMPLETE);
      
      addLog(`扫描完成，耗时 ${duration}秒。锁定 ${results.length} 个目标。`);
    } catch (error: any) {
      if (activeTabRef.current !== frame) return;

      console.error(error);
      setStatus(AppStatus.ERROR);
      addLog(`严重错误: ${error.message || '未知网络故障'}`);
      
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
    const targetRepos = currentView === 'vault' ? favorites : repos;
    
    if (targetRepos.length === 0) {
      addLog('错误: 无数据可导出。');
      return;
    }
    
    const date = new Date().toLocaleDateString('zh-CN');
    const title = currentView === 'vault' ? 'CyberGit 收藏库' : 'CyberGit 每日精选';
    let report = `🤖 *${title} (${date})*\n\n`;
    
    targetRepos.forEach((repo, i) => {
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

  // Toggle Favorite (Stores Full Object)
  const toggleFavorite = (repo: Repo) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.name === repo.name);
      let newFavs;
      
      if (exists) {
        newFavs = prev.filter(f => f.name !== repo.name);
        addLog(`已从收藏库移除: ${repo.name}`);
      } else {
        newFavs = [...prev, repo];
        addLog(`已写入数据保险库: ${repo.name}`);
      }
      
      localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(newFavs));
      return newFavs;
    });
  };

  // Initial load effect
  useEffect(() => {
    addLog('中枢接口已加载。就绪。');
    
    // Load favorites from Vault
    const storedFavs = localStorage.getItem(FAV_STORAGE_KEY);
    if (storedFavs) {
      try {
        const parsed = JSON.parse(storedFavs);
        // Handle migration from old string[] version to Repo[] version
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          // Old version detected, clear it to avoid crashes or handle gracefully
          console.warn("Detected legacy favorites format. Clearing.");
          localStorage.removeItem(FAV_STORAGE_KEY);
        } else {
          setFavorites(parsed);
        }
      } catch(e) { console.error('Fav parse error'); }
    }

    // Load default tab
    handleScan('3d', false);
  }, []);

  const formatLastUpdated = (ts: number | null) => {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // Determine what to display based on view
  const displayedRepos = currentView === 'vault' ? favorites : repos;

  return (
    <div className="min-h-screen flex flex-col max-w-7xl mx-auto px-4 py-6 md:px-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-end border-b-2 border-cyan-900/50 pb-6 mb-8 gap-4">
        <div>
          <h1 className="text-5xl md:text-6xl font-cyber font-bold italic tracking-tighter text-white">
            CYBER<span className="text-cyan-400 neon-text-cyan">GIT</span>
            <span className="text-fuchsia-500 text-2xl align-top ml-2">v2.1</span>
          </h1>
          <p className="font-mono text-cyan-700 mt-2 text-base md:text-sm uppercase tracking-widest">
            // 全自动开源情报猎杀系统
          </p>
        </div>
        
        {/* View Switcher Navigation */}
        <div className="flex bg-black/50 border border-gray-800 p-1 gap-1 rounded-sm">
           <button 
             onClick={() => setCurrentView('scanner')}
             className={`px-4 py-2 font-mono text-xs uppercase flex items-center gap-2 transition-all
               ${currentView === 'scanner' ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'text-gray-500 hover:text-gray-300'}
             `}
           >
             <span>📡</span> 信号扫描
           </button>
           <button 
             onClick={() => setCurrentView('vault')}
             className={`px-4 py-2 font-mono text-xs uppercase flex items-center gap-2 transition-all
               ${currentView === 'vault' ? 'bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-500/50 shadow-[0_0_10px_rgba(217,70,239,0.3)]' : 'text-gray-500 hover:text-gray-300'}
             `}
           >
             <span>💾</span> 数据保险库 ({favorites.length})
           </button>
        </div>

        <CountDown />
      </header>

      {/* Control Panel (Only visible in Scanner View) */}
      {currentView === 'scanner' && (
        <div className="flex flex-col md:flex-row gap-6 mb-8 items-end animate-fade-in">
          {/* Tabs */}
          <div className="flex gap-2 bg-gray-900/50 p-1 border border-gray-800 rounded-sm w-full md:w-auto overflow-x-auto">
            {(['3d', '7d', '14d'] as TimeFrame[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  handleScan(tab, false);
                }}
                className={`
                  flex-1 md:flex-none px-4 md:px-6 py-3 md:py-2 font-mono font-bold text-base md:text-sm transition-all whitespace-nowrap
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
              <span className="text-xs text-gray-500 uppercase">上次同步时间</span>
              <span className="text-xs font-mono text-cyan-500/80 font-bold">
                 {formatLastUpdated(lastUpdated)}
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex-1 flex justify-end items-center gap-4 w-full md:w-auto">
            <CyberButton 
              onClick={handleCopyReport}
              variant="green"
              disabled={repos.length === 0}
              className="flex-1 md:flex-none"
            >
              复制简报
            </CyberButton>
            
            {status === AppStatus.SCANNING && (
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.8)]"></span>
              </div>
            )}

            <CyberButton 
              onClick={() => handleScan(activeTab, true)}
              disabled={status === AppStatus.SCANNING}
              variant="pink"
              className="flex-1 md:flex-none w-full md:w-auto"
            >
              {status === AppStatus.SCANNING ? '系统扫描中...' : '立即精选更新'}
            </CyberButton>
          </div>
        </div>
      )}

      {/* Vault Controls (Only visible in Vault View) */}
      {currentView === 'vault' && (
        <div className="flex justify-between items-center mb-8 border-b border-fuchsia-900/30 pb-4 animate-fade-in">
           <div>
             <h2 className="text-2xl font-cyber text-fuchsia-500">DATA VAULT // 收藏空间</h2>
             <p className="font-mono text-xs text-fuchsia-900/80 mt-1">存储的神经元网络链接</p>
           </div>
           <CyberButton 
              onClick={handleCopyReport}
              variant="green"
              disabled={favorites.length === 0}
            >
              导出收藏目录
            </CyberButton>
        </div>
      )}

      {/* Main Content Grid */}
      <main className="flex-1 relative min-h-[400px]">
        {/* Loading Overlay */}
        {currentView === 'scanner' && status === AppStatus.SCANNING && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/80 backdrop-blur-sm transition-opacity duration-300">
            <div className="text-center">
              <div className="inline-block w-16 h-16 border-4 border-t-cyan-500 border-r-transparent border-b-fuchsia-500 border-l-transparent rounded-full animate-spin mb-4"></div>
              <div className="font-cyber text-xl animate-pulse text-cyan-400">正在接入主网...</div>
              <div className="font-mono text-xs text-gray-500 mt-2">解密 GitHub API 信号流</div>
            </div>
          </div>
        )}

        {/* Empty States */}
        {displayedRepos.length === 0 && status !== AppStatus.SCANNING && status !== AppStatus.ERROR && (
          <div className="h-full flex flex-col items-center justify-center text-gray-700 border-2 border-dashed border-gray-900 rounded-lg p-12">
            {currentView === 'scanner' ? (
               <>
                <div className="text-6xl mb-4 opacity-20">📡</div>
                <p className="font-mono text-lg">未检测到数据</p>
                <p className="font-mono text-sm mt-2">请点击上方按钮以获取目标。</p>
               </>
            ) : (
               <>
                <div className="text-6xl mb-4 opacity-20 text-fuchsia-900">💾</div>
                <p className="font-mono text-lg text-fuchsia-900/60">数据保险库为空</p>
                <p className="font-mono text-sm mt-2 text-gray-600">在扫描器中点击星标以保存项目。</p>
               </>
            )}
          </div>
        )}
        
        {/* Error State */}
        {currentView === 'scanner' && status === AppStatus.ERROR && (
           <div className="h-full flex flex-col items-center justify-center text-red-500 border-2 border-red-900/50 bg-red-900/10 p-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="font-mono text-lg font-bold">系统故障</p>
            <p className="font-mono text-sm mt-2">连接已断开。请检查 API 密钥或网络。</p>
          </div>
        )}

        {/* The Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedRepos.map((repo, index) => (
            <RepoCard 
              key={`${repo.name}-${index}`} 
              repo={repo} 
              index={index}
              isFavorite={favorites.some(f => f.name === repo.name)}
              onToggleFavorite={() => toggleFavorite(repo)}
            />
          ))}
        </div>
      </main>

      {/* Footer / Logs */}
      <footer className="mt-12">
        <SystemLog status={status} logs={logs} />
        <div className="flex justify-between items-center text-xs text-gray-500 font-mono mt-2 uppercase">
          <span>安全连接：已加密</span>
          <span>CYBERGIT_HUNTER © 2077</span>
        </div>
      </footer>
    </div>
  );
};

export default App;