import React, { useState, useEffect } from 'react';
import { Repo } from '../types';
import { generateRepoImage } from '../services/geminiService';

interface RepoCardProps {
  repo: Repo;
  index: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  googleApiKey?: string;
}

const RepoCard: React.FC<RepoCardProps> = ({ repo, index, isFavorite, onToggleFavorite, googleApiKey }) => {
  const [imageError, setImageError] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Construct GitHub OpenGraph Image URL
  const standardImageUrl = `https://opengraph.githubassets.com/1/${repo.name}`;

  // Reset error state when repo changes
  useEffect(() => {
    setImageError(false);
    setAiImage(null);
    setIsGenerating(false);
  }, [repo.name]);

  const handleImageError = async () => {
    setImageError(true);
    // Only attempt AI generation if we have a key and aren't already generating
    if (!aiImage && !isGenerating && googleApiKey) {
      setIsGenerating(true);
      try {
        const generatedUrl = await generateRepoImage(repo.name, repo.description, googleApiKey);
        if (generatedUrl) {
          setAiImage(generatedUrl);
        }
      } catch (e) {
        console.error("Failed to generate fallback image");
      } finally {
        setIsGenerating(false);
      }
    }
  };

  // Advanced Status Logic - 7 Tiers
  const getStatusInfo = () => {
    // Priority 1: Frozen/Archived
    if (repo.isArchived) {
      return { 
        label: '已归档 (FROZEN)', 
        color: 'text-fuchsia-300', 
        dot: 'bg-fuchsia-500', 
        border: 'border-fuchsia-500/40 bg-fuchsia-900/20 shadow-[0_0_8px_rgba(217,70,239,0.2)]' 
      };
    }

    // Priority 2: Rate Limited (New)
    if (repo.isRateLimited) {
      return { 
        label: '加密通道 (SECURE)', 
        color: 'text-indigo-400', 
        dot: 'bg-indigo-500 animate-pulse', 
        border: 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_8px_rgba(99,102,241,0.2)]' 
      };
    }
    
    // Priority 3: Missing Data (Real error)
    if (!repo.lastPushedAt) {
      return { 
        label: '信号丢失 (UNKNOWN)', 
        color: 'text-gray-500', 
        dot: 'bg-gray-600', 
        border: 'border-gray-700 bg-gray-900/20' 
      };
    }

    const lastPush = new Date(repo.lastPushedAt);
    const now = new Date();
    const diffMs = now.getTime() - lastPush.getTime();
    const daysSincePush = Math.floor(diffMs / (1000 * 3600 * 24));

    // Tier 1: Hyper Active (< 3 days)
    if (daysSincePush <= 3) {
      return { 
        label: '极度活跃 (CRITICAL)', 
        color: 'text-cyan-400', 
        dot: 'bg-cyan-400 animate-ping', 
        border: 'border-cyan-400/50 bg-cyan-900/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
      };
    } 
    // Tier 2: Active (< 7 days)
    else if (daysSincePush <= 7) {
      return { 
        label: '在线 (ONLINE)', 
        color: 'text-green-400', 
        dot: 'bg-green-500 animate-pulse', 
        border: 'border-green-500/40 bg-green-900/20 shadow-[0_0_5px_rgba(34,197,94,0.25)]' 
      };
    } 
    // Tier 3: Stable (< 30 days)
    else if (daysSincePush <= 30) {
      return { 
        label: '稳定 (STABLE)', 
        color: 'text-emerald-400', 
        dot: 'bg-emerald-500', 
        border: 'border-emerald-600/30 bg-emerald-900/10' 
      };
    } 
    // Tier 4: Idle (< 90 days)
    else if (daysSincePush <= 90) {
      return { 
        label: '待机 (IDLE)', 
        color: 'text-yellow-400', 
        dot: 'bg-yellow-500', 
        border: 'border-yellow-500/30 bg-yellow-900/10' 
      };
    } 
    // Tier 5: Decay (< 180 days)
    else if (daysSincePush <= 180) {
      return { 
        label: '衰退 (DECAY)', 
        color: 'text-orange-500', 
        dot: 'bg-orange-600', 
        border: 'border-orange-600/30 bg-orange-900/10' 
      };
    } 
    // Tier 6: Offline (> 180 days)
    else {
      return { 
        label: '离线 (OFFLINE)', 
        color: 'text-red-500', 
        dot: 'bg-red-600', 
        border: 'border-red-600/30 bg-red-900/10 shadow-[0_0_5px_rgba(220,38,38,0.2)]' 
      };
    }
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return '刚刚';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分钟前`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}小时前`;
    if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)}天前`;
    return date.toLocaleDateString();
  };

  const status = getStatusInfo();

  return (
    <div 
      className={`group relative transition-all duration-300 flex flex-col h-full border
        ${isFavorite 
          ? 'bg-fuchsia-950/20 border-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.25)] scale-[1.01] z-10' 
          : 'bg-black/60 border-cyan-900/50 hover:border-cyan-400/80 hover:bg-black/80 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)]'}
      `}
      style={{
        clipPath: 'polygon(0 0, 100% 0, 100% 95%, 95% 100%, 0 100%)'
      }}
    >
      <style>{`
        @keyframes glitch-text {
          0% { text-shadow: 2px 0 rgba(255,0,255,0.7), -2px 0 rgba(0,255,255,0.7); }
          25% { text-shadow: -2px 2px rgba(255,0,255,0.7), 2px -2px rgba(0,255,255,0.7); }
          50% { text-shadow: 2px -2px rgba(255,0,255,0.7), -2px 2px rgba(0,255,255,0.7); }
          75% { text-shadow: -1px -1px rgba(255,0,255,0.7), 1px 1px rgba(0,255,255,0.7); }
          100% { text-shadow: 2px 0 rgba(255,0,255,0.7), -2px 0 rgba(0,255,255,0.7); }
        }
        .animate-glitch:hover {
          animation: glitch-text 0.3s infinite;
        }
        @keyframes holographic-scan {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
        .holographic-bg {
          background: linear-gradient(90deg, 
            rgba(0,0,0,0) 0%, 
            rgba(34,211,238,0.05) 25%, 
            rgba(34,211,238,0.1) 50%, 
            rgba(34,211,238,0.05) 75%, 
            rgba(0,0,0,0) 100%
          );
          background-size: 200% 100%;
          animation: holographic-scan 3s linear infinite;
        }
      `}</style>

      {/* Decorative corner */}
      <div className={`absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 transition-colors z-10
         ${isFavorite ? 'border-fuchsia-500 bg-fuchsia-500/20' : 'border-cyan-500/30 group-hover:border-cyan-400'}
      `}></div>
      
      {/* Image Preview Area */}
      <div className={`relative w-full h-32 overflow-hidden border-b bg-black
          ${isFavorite ? 'border-fuchsia-500/30' : 'border-cyan-900/30'}
      `}>
        <div className="absolute inset-0 bg-transparent md:bg-cyan-900/20 md:mix-blend-overlay md:group-hover:bg-transparent transition-all duration-500 z-20 pointer-events-none"></div>
        
        {!imageError && (
          <img 
            src={standardImageUrl} 
            alt={`${repo.name} preview`}
            className="w-full h-full object-cover transition-all duration-500 
                       opacity-100 md:opacity-80 md:group-hover:opacity-100 
                       grayscale-0 md:grayscale md:group-hover:grayscale-0 
                       group-hover:scale-105"
            onError={handleImageError}
            loading="lazy"
          />
        )}

        {imageError && (
          <div className="absolute inset-0 w-full h-full bg-[#080808] flex items-center justify-center overflow-hidden">
            <div 
              className="absolute inset-0 z-0 opacity-20" 
              style={{ 
                backgroundImage: 'linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)', 
                backgroundSize: '20px 20px' 
              }}
            ></div>
            
            {isGenerating && (
              <div className="relative z-10 flex flex-col items-center justify-center">
                 <div className="w-8 h-8 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-2 shadow-[0_0_10px_rgba(217,70,239,0.4)]"></div>
                 <span className="text-xs font-mono text-fuchsia-400 animate-pulse tracking-widest font-bold">NEURAL RENDERING...</span>
              </div>
            )}

            {!isGenerating && aiImage && (
              <>
                <img 
                  src={aiImage} 
                  alt="AI Generated Preview"
                  loading="lazy"
                  className="relative z-10 w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute bottom-0 right-0 z-20 bg-black/80 px-2 py-0.5 text-[10px] text-fuchsia-500 font-mono border-tl border-fuchsia-500/30 backdrop-blur-sm">
                  AI GENERATED
                </div>
              </>
            )}

            {!isGenerating && !aiImage && (
               <div className="z-10 text-cyan-900/40 text-4xl">NO_SIGNAL</div>
            )}
          </div>
        )}

        {/* Scanline */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-30 bg-[length:100%_2px,3px_100%] pointer-events-none"></div>
      </div>

      <div className="p-4 md:p-5 flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3 overflow-hidden flex-1">
            <span className={`text-2xl font-cyber font-bold flex-shrink-0 ${isFavorite ? 'text-fuchsia-500' : 'text-cyan-500'}`}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="relative overflow-hidden group/title">
              <h3 className={`text-xl md:text-lg font-bold font-mono tracking-tight transition-colors truncate w-full pr-2 animate-glitch cursor-default
                ${isFavorite ? 'text-fuchsia-100' : 'text-gray-100 group-hover/title:text-cyan-300'}
              `}>
                {repo.name.split('/')[1] || repo.name}
              </h3>
            </div>
          </div>
          
          <button 
            onClick={onToggleFavorite}
            className="flex-shrink-0 p-1 md:p-0 group/star focus:outline-none touch-manipulation z-20"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
             <svg 
               xmlns="http://www.w3.org/2000/svg" 
               className={`w-8 h-8 md:w-6 md:h-6 transition-all duration-300
                 ${isFavorite 
                   ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] scale-110' 
                   : 'text-gray-700 fill-transparent hover:text-cyan-400 hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]'
                 }
               `}
               viewBox="0 0 24 24" 
               stroke="currentColor" 
               strokeWidth={isFavorite ? 0 : 2}
             >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.545.044.77.77.349 1.132l-4.252 3.638a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.252-3.638a.563.563 0 01.349-1.132l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </button>
        </div>

        {/* Status Bar */}
        <div className={`flex items-center justify-between px-2 py-2 mb-3 rounded-sm border transition-all duration-300 ${status.border}`}>
            <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shadow-[0_0_5px_currentColor] ${status.dot}`}></span>
                <span className={`text-xs font-mono font-bold uppercase tracking-wide ${status.color}`}>
                    {status.label}
                </span>
            </div>
            {repo.lastPushedAt && !repo.isRateLimited && (
                <span className="text-xs font-mono text-gray-400 font-medium whitespace-nowrap ml-2">
                    {formatRelativeTime(repo.lastPushedAt)}
                </span>
            )}
            {repo.isRateLimited && (
               <span className="text-xs font-mono text-indigo-400/70 font-medium whitespace-nowrap ml-2">
                   PRIVACY: ON
               </span>
            )}
        </div>

        {/* Stats Badge */}
        <div className="mb-3 flex flex-wrap gap-2">
             <span className="inline-block text-xs font-mono font-medium text-fuchsia-400 border border-fuchsia-900/50 px-2 py-1 bg-fuchsia-900/10">
              {repo.starsTrend}
            </span>
            {repo.starsCount !== undefined && (
                 <span className="inline-block text-xs font-mono font-medium text-yellow-500/80 border border-yellow-900/30 px-2 py-1 bg-yellow-900/5">
                  ★ {repo.starsCount.toLocaleString()}
                </span>
            )}
            {repo.language && (
                 <span className="inline-block text-xs font-mono font-medium text-cyan-500/80 border border-cyan-900/30 px-2 py-1 bg-cyan-900/5">
                  {repo.language}
                </span>
            )}
        </div>

        {/* Owner/Url Info */}
        <div className="mb-3 font-mono text-xs text-gray-500 truncate">
          <span className="text-cyan-700 select-none">{'>'} </span>
          <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors">{repo.name}</a>
        </div>

        {/* Description */}
        <div className="relative overflow-hidden mb-4 border-l-2 border-gray-800 group-hover:border-cyan-500/50 transition-colors rounded-sm bg-gray-900/20">
          <div className="absolute inset-0 holographic-bg pointer-events-none"></div>
          <p className="relative z-10 text-gray-300 md:text-gray-400 text-base md:text-sm leading-relaxed p-3 font-mono h-auto md:h-20 md:overflow-y-auto scrollbar-hide">
            {repo.description}
          </p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4 mt-auto">
          {repo.tags.map((tag, i) => (
            <span key={i} className="text-xs uppercase px-2 py-1 md:py-0.5 border border-green-900/50 text-green-500 bg-green-900/10">
              #{tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className={`flex gap-2 pt-2 border-t ${isFavorite ? 'border-fuchsia-500/30' : 'border-gray-800'}`}>
          <a 
            href={repo.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex-1 text-center py-3 md:py-2 text-sm md:text-xs font-bold bg-cyan-900/20 text-cyan-400 hover:bg-cyan-500 hover:text-black transition-colors uppercase tracking-widest"
          >
            访问
          </a>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(`git clone ${repo.url}`);
            }}
            className="flex-1 text-center py-3 md:py-2 text-sm md:text-xs font-bold bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors uppercase tracking-widest"
          >
            克隆
          </button>
        </div>
      </div>
    </div>
  );
};

export default RepoCard;