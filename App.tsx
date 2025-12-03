import React, { useState, useEffect, useRef } from 'react';
import { Repo, TimeFrame, AppStatus } from './types';
import { fetchTrendingRepos, validateGeminiKey } from './services/geminiService';
import { fetchDeepSeekTrendingRepos, validateDeepSeekKey } from './services/deepseekService';
import CyberButton from './components/CyberButton';
import RepoCard from './components/RepoCard';
import SystemLog from './components/SystemLog';
import CountDown from './components/CountDown';
import BackToTop from './components/BackToTop';

const CACHE_PREFIX = 'cybergit_cache_';
const FAV_STORAGE_KEY = 'cybergit_fav_vault';
const DEEPSEEK_KEY_STORAGE = 'cybergit_ds_key';
const GOOGLE_KEY_STORAGE = 'cybergit_google_key';

type ViewMode = 'scanner' | 'vault';
type AIProvider = 'google' | 'deepseek';
type ConnectionStatus = 'idle' | 'checking' | 'success' | 'error';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('scanner');
  const [aiProvider, setAiProvider] = useState<AIProvider>('deepseek'); 
  const [activeTab, setActiveTab] = useState<TimeFrame>('3d');
  const activeTabRef = useRef<TimeFrame>('3d');
  
  const [repos, setRepos] = useState<Repo[]>([]);
  const [favorites, setFavorites] = useState<Repo[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [logs, setLogs] = useState<string[]>(['系统初始化完成...', '等待指令...']);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Connection Status State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');

  // DeepSeek Key Management
  const [deepseekKey, setDeepseekKey] = useState<string>(() => {
      return localStorage.getItem(DEEPSEEK_KEY_STORAGE) || '';
  });
  
  // Google Key Management
  const [googleKey, setGoogleKey] = useState<string>(() => {
    return localStorage.getItem(GOOGLE_KEY_STORAGE) || '';
  });
  
  // Use Refs to avoid stale closures in setTimeout/async calls
  const deepseekKeyRef = useRef(deepseekKey);
  const googleKeyRef = useRef(googleKey);
  
  useEffect(() => {
    deepseekKeyRef.current = deepseekKey;
  }, [deepseekKey]);

  useEffect(() => {
    googleKeyRef.current = googleKey;
  }, [googleKey]);

  const [showKeyModal, setShowKeyModal] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  // Verify connection for current provider
  const verifyCurrentConnection = async (key: string, provider: AIProvider) => {
    setConnectionStatus('checking');
    let isValid = false;

    if (provider === 'google') {
        isValid = await validateGeminiKey(key);
    } else {
        isValid = await validateDeepSeekKey(key);
    }

    if (isValid) {
        setConnectionStatus('success');
        addLog(`[系统] ${provider === 'google' ? 'Google' : 'DeepSeek'} API 链路连接成功。`);
    } else {
        setConnectionStatus('error');
        addLog(`[警告] ${provider === 'google' ? 'Google' : 'DeepSeek'} API 连接失败，请检查密钥。`);
    }
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

  const saveKey = async () => {
    if (keyInputRef.current) {
        const val = keyInputRef.current.value.trim();
        
        if (aiProvider === 'deepseek') {
            setDeepseekKey(val);
            localStorage.setItem(DEEPSEEK_KEY_STORAGE, val);
        } else {
            setGoogleKey(val);
            localStorage.setItem(GOOGLE_KEY_STORAGE, val);
        }

        // Trigger validation immediately upon saving
        await verifyCurrentConnection(val, aiProvider);
        
        // Only close if successful (optional, currently closing to not block flow)
        // setShowKeyModal(false); 
        // For better UX, let user see the success status in modal
        if (connectionStatus === 'error') {
            // Keep open maybe? For now let's just log and user can see status
        }
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
    const providerLabel = aiProvider === 'google' ? 'Gemini 2.5' : 'DeepSeek V3.2';
    
    if (forceRefresh) {
      addLog(`指令: 强制刷新数据流 (${providerLabel})...`);
    } else {
      addLog(`启动扫描序列 - 目标: 近${timeLabel} (核心: ${providerLabel})...`);
    }
    
    setRepos([]); 

    try {
      const start = Date.now();
      let results: Repo[] = [];

      if (aiProvider === 'google') {
        const currentGoogleKey = googleKeyRef.current;
        if (!currentGoogleKey) {
            throw new Error("Google API Key 未配置。请点击 'KEY' 按钮设置。");
        }
        // Verify connection silently before heavy lifting
        await verifyCurrentConnection(currentGoogleKey, 'google');
        results = await fetchTrendingRepos(frame, currentGoogleKey);
      } else {
        addLog("接入 DeepSeek V3.2 神经网络...");
        const currentDsKey = deepseekKeyRef.current;
        if (!currentDsKey) {
             throw new Error("DeepSeek API Key 未配置。请点击 'KEY' 按钮设置。");
        }
        // Verify connection silently before heavy lifting
        await verifyCurrentConnection(currentDsKey, 'deepseek');
        results = await fetchDeepSeekTrendingRepos(frame, currentDsKey);
      }
      
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
      
      // Auto-open key modal if key is missing/invalid
      if (error.message.includes('API Key') || error.message.includes('401')) {
         setConnectionStatus('error');
         setShowKeyModal(true);
      }

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
    const providerSign = aiProvider === 'google' ? 'Gemini Core' : 'DeepSeek V3.2';
    let report = `🤖 *${title} (${date})*\n[By ${providerSign}]\n\n`;
    
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

  // Initial load
  useEffect(() => {
    addLog('中枢接口已加载。默认接入: DeepSeek V3.2 Network。');
    
    // Favorites load
    const storedFavs = localStorage.getItem(FAV_STORAGE_KEY);
    if (storedFavs) {
      try {
        const parsed = JSON.parse(storedFavs);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          console.warn("Detected legacy favorites format. Clearing.");
          localStorage.removeItem(FAV_STORAGE_KEY);
        } else {
          setFavorites(parsed);
        }
      } catch(e) { console.error('Fav parse error'); }
    }

    // Verify default connection logic
    const initialKey = deepseekKeyRef.current;
    if (initialKey) {
        verifyCurrentConnection(initialKey, 'deepseek');
    }

    // Delay initial scan slightly
    setTimeout(() => handleScan('3d', false), 500);
  }, []);

  const switchProvider = () => {
    const next = aiProvider === 'google' ? 'deepseek' : 'google';
    setAiProvider(next);
    
    // Reset status check for new provider
    setConnectionStatus('idle');
    const nextKey = next === 'google' ? googleKeyRef.current : deepseekKeyRef.current;
    if (nextKey) {
        verifyCurrentConnection(nextKey, next);
    }
    
    addLog(`切换核心网络 -> ${next === 'google' ? 'Google Gemini' : 'DeepSeek V3.2'}`);
  };

  const formatLastUpdated = (ts: number | null) => {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const displayedRepos = currentView === 'vault' ? favorites : repos;

  // Render Status Badge
  const renderConnectionBadge = () => {
    if (connectionStatus === 'checking') {
        return <span className="text-yellow-400 animate-pulse text-[10px] ml-1">[连接中...]</span>;
    }
    if (connectionStatus === 'success') {
        return <span className="text-green-400 text-[10px] ml-1">[链路正常]</span>;
    }
    if (connectionStatus === 'error') {
        return <span className="text-red-500 text-[10px] ml-1">[链路断开]</span>;
    }
    return <span className="text-gray-600 text-[10px] ml-1">[未检测]</span>;
  };

  return (
    <div className="min-h-screen flex flex-col max-w-7xl mx-auto px-4 py-6 md:px-8 relative">
      
      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
           <div className={`bg-[#050505] border-2 w-full max-w-md p-6 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative transition-colors duration-500
                ${aiProvider === 'deepseek' ? 'border-indigo-500 shadow-indigo-500/30' : 'border-green-500 shadow-green-500/30'}
           `}>
              <h3 className={`text-xl font-cyber mb-4 tracking-wider flex items-center gap-2
                 ${aiProvider === 'deepseek' ? 'text-indigo-400' : 'text-green-400'}
              `}>
                <span className={`w-2 h-2 rounded-full animate-pulse
                    ${aiProvider === 'deepseek' ? 'bg-indigo-500' : 'bg-green-500'}
                `}></span>
                {aiProvider === 'deepseek' ? 'DEEPSEEK' : 'GOOGLE GEMINI'} 密钥配置
              </h3>
              <p className="text-xs text-gray-400 font-mono mb-4">
                 {aiProvider === 'deepseek' 
                    ? '请输入您的 API Key 以接入 DeepSeek V3.2 网络。密钥仅存储在本地浏览器中。'
                    : '请输入您的 Google Gemini API Key 以启用搜索和图像生成。密钥仅存储在本地浏览器中。'
                 }
              </p>
              <input 
                 ref={keyInputRef}
                 defaultValue={aiProvider === 'deepseek' ? deepseekKey : googleKey}
                 type="password"
                 placeholder={aiProvider === 'deepseek' ? "sk-..." : "AIzaSy..."}
                 className={`w-full bg-gray-900/50 border border-gray-700 font-mono text-sm p-3 mb-2 focus:outline-none transition-all placeholder-gray-700
                    ${aiProvider === 'deepseek' 
                        ? 'text-indigo-100 focus:border-indigo-500 focus:shadow-[0_0_10px_rgba(99,102,241,0.3)]' 
                        : 'text-green-100 focus:border-green-500 focus:shadow-[0_0_10px_rgba(34,197,94,0.3)]'}
                 `}
              />
              
              {/* Modal Status Feedback */}
              <div className="h-6 mb-4 flex items-center">
                 {connectionStatus === 'checking' && <span className="text-yellow-500 text-xs font-mono animate-pulse">正在验证密钥有效性...</span>}
                 {connectionStatus === 'success' && <span className="text-green-500 text-xs font-mono">√ 验证成功：API 连接已就绪</span>}
                 {connectionStatus === 'error' && <span className="text-red-500 text-xs font-mono">× 验证失败：无效的密钥或网络错误</span>}
              </div>

              <div className="flex gap-4">
                 <button 
                   onClick={() => setShowKeyModal(false)}
                   className="flex-1 py-2 font-mono text-xs uppercase text-gray-500 hover:text-white border border-transparent hover:border-gray-700 transition-all"
                 >
                   {connectionStatus === 'success' ? '关闭' : '取消'}
                 </button>
                 <button 
                   onClick={saveKey}
                   disabled={connectionStatus === 'checking'}
                   className={`flex-1 py-2 font-mono text-xs uppercase text-white transition-all shadow-[0_0_15px_rgba(0,0,0,0.4)]
                      ${aiProvider === 'deepseek' 
                        ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/30' 
                        : 'bg-green-600 hover:bg-green-500 shadow-green-500/30'}
                      ${connectionStatus === 'checking' ? 'opacity-50 cursor-not-allowed' : ''}
                   `}
                 >
                   {connectionStatus === 'checking' ? '验证中...' : '保存并验证'}
                 </button>
              </div>
           </div>
        </div>
      )}

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

          {/* AI Provider Switch & Last Updated */}
          <div className="hidden md:flex flex-col text-right mr-auto ml-4 mb-2">
            <div className="flex flex-col items-end mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">核心处理单元</span>
                <div className="flex gap-1 items-center">
                   <button 
                    onClick={switchProvider}
                    className={`text-xs font-mono px-2 py-0.5 border rounded-sm transition-all flex items-center gap-2
                        ${aiProvider === 'google' 
                            ? 'border-green-500/50 text-green-400 bg-green-900/10' 
                            : 'border-indigo-500/50 text-indigo-400 bg-indigo-900/10'}
                    `}
                    >
                    <span className={`w-1.5 h-1.5 rounded-full ${aiProvider === 'google' ? 'bg-green-500' : 'bg-indigo-500'}`}></span>
                    {aiProvider === 'google' ? 'GEMINI-2.5-FLASH' : 'DEEPSEEK-V3.2'}
                   </button>
                   
                   {/* Connection Badge */}
                   {renderConnectionBadge()}

                   {/* Key Config Button */}
                   <button 
                     onClick={() => setShowKeyModal(true)}
                     className={`text-[10px] font-mono px-2 py-0.5 border rounded-sm transition-colors ml-2
                        ${aiProvider === 'google'
                            ? 'border-green-500/30 text-green-300 hover:bg-green-500/20'
                            : 'border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20'}
                     `}
                     title="配置 API Key"
                   >
                     KEY
                   </button>
                </div>
            </div>
            <div>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-2">上次同步</span>
                <span className="text-xs font-mono text-cyan-500/80 font-bold">
                    {formatLastUpdated(lastUpdated)}
                </span>
            </div>
          </div>

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
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${aiProvider === 'deepseek' ? 'bg-indigo-400' : 'bg-fuchsia-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 shadow-[0_0_10px_rgba(217,70,239,0.8)] ${aiProvider === 'deepseek' ? 'bg-indigo-500' : 'bg-fuchsia-500'}`}></span>
              </div>
            )}

            <CyberButton 
              onClick={() => handleScan(activeTab, true)}
              disabled={status === AppStatus.SCANNING}
              variant={aiProvider === 'deepseek' ? 'cyan' : 'pink'}
              className="flex-1 md:flex-none w-full md:w-auto"
            >
              {status === AppStatus.SCANNING ? '系统扫描中...' : '立即精选更新'}
            </CyberButton>
          </div>
        </div>
      )}

      {/* Mobile Provider Switcher */}
      {currentView === 'scanner' && (
        <div className="md:hidden flex justify-between items-center mb-4 px-1">
             <span className="text-xs font-mono text-gray-500">{formatLastUpdated(lastUpdated)}</span>
             <div className="flex gap-2 items-center">
                 <button 
                    onClick={switchProvider}
                    className={`text-xs font-mono px-3 py-1 border rounded-sm transition-all flex items-center gap-2
                    ${aiProvider === 'google' 
                        ? 'border-green-500/50 text-green-400 bg-green-900/10' 
                        : 'border-indigo-500/50 text-indigo-400 bg-indigo-900/10'}
                    `}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${aiProvider === 'google' ? 'bg-green-500' : 'bg-indigo-500'}`}></span>
                    {aiProvider === 'google' ? 'GEMINI' : 'DEEPSEEK'}
                </button>
                 {renderConnectionBadge()}
                 <button 
                   onClick={() => setShowKeyModal(true)}
                   className={`text-xs font-mono px-3 py-1 border rounded-sm
                      ${aiProvider === 'google' 
                        ? 'border-green-500/30 text-green-300 hover:bg-green-500/20' 
                        : 'border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20'}
                   `}
                 >
                   KEY
                 </button>
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
              <div className={`inline-block w-16 h-16 border-4 border-t-transparent border-l-transparent rounded-full animate-spin mb-4
                 ${aiProvider === 'deepseek' ? 'border-indigo-500 border-b-indigo-300' : 'border-cyan-500 border-b-fuchsia-500'}
              `}></div>
              <div className={`font-cyber text-xl animate-pulse ${aiProvider === 'deepseek' ? 'text-indigo-400' : 'text-cyan-400'}`}>
                {aiProvider === 'deepseek' ? 'DEEPSEEK V3.2 扫描中...' : '正在接入主网...'}
              </div>
              <div className="font-mono text-xs text-gray-500 mt-2">
                {aiProvider === 'deepseek' ? '神经元网络分析 / 验证 GitHub 节点' : '解密 GitHub API 信号流'}
              </div>
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
            <p className="font-mono text-sm mt-2">连接已断开。请检查网络或 API 状态。</p>
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
              googleApiKey={googleKey}
            />
          ))}
        </div>
      </main>

      {/* Back To Top Button */}
      <BackToTop />

      {/* Footer / Logs */}
      <footer className="mt-12">
        <SystemLog status={status} logs={logs} />
        <div className="flex justify-between items-center text-xs text-gray-500 font-mono mt-2 uppercase">
          <span>安全连接：{aiProvider === 'deepseek' ? 'DEEPSEEK-V3.2 加密' : 'GOOGLE-GEMINI 加密'}</span>
          <span>CYBERGIT_HUNTER © 2077</span>
        </div>
      </footer>
    </div>
  );
};

export default App;