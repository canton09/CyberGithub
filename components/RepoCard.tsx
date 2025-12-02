import React, { useState, useEffect } from 'react';
import { Repo } from '../types';

interface RepoCardProps {
  repo: Repo;
  index: number;
}

const RepoCard: React.FC<RepoCardProps> = ({ repo, index }) => {
  const [imageError, setImageError] = useState(false);
  
  // Construct GitHub OpenGraph Image URL
  const imageUrl = `https://opengraph.githubassets.com/1/${repo.name}`;

  // Reset error state when repo changes (crucial for list virtualization/updates)
  useEffect(() => {
    setImageError(false);
  }, [repo.name]);

  return (
    <div 
      className="group relative bg-black/60 border border-cyan-900/50 hover:border-cyan-400/80 transition-all duration-300 flex flex-col h-full"
      style={{
        clipPath: 'polygon(0 0, 100% 0, 100% 95%, 95% 100%, 0 100%)'
      }}
    >
      {/* Decorative corner */}
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors z-10"></div>
      
      {/* Image Preview Area */}
      {!imageError && (
        <div className="relative w-full h-32 overflow-hidden border-b border-cyan-900/30">
          {/* Glitch Overlay */}
          <div className="absolute inset-0 bg-cyan-900/20 mix-blend-overlay group-hover:bg-transparent transition-all duration-500 z-10"></div>
          <img 
            src={imageUrl} 
            alt={`${repo.name} preview`}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500 grayscale group-hover:grayscale-0"
            onError={() => setImageError(true)}
            loading="lazy"
          />
          {/* Scanline on image */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] pointer-events-none"></div>
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-2xl font-cyber text-cyan-500 font-bold flex-shrink-0">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="text-lg font-bold text-gray-100 font-mono tracking-tight group-hover:text-cyan-300 transition-colors truncate w-full">
              {repo.name.split('/')[1] || repo.name}
            </h3>
          </div>
        </div>

        {/* Stats Badge */}
        <div className="mb-3">
             <span className="inline-block text-xs font-mono text-fuchsia-400 border border-fuchsia-900/50 px-2 py-1 bg-fuchsia-900/10">
              {repo.starsTrend}
            </span>
        </div>

        {/* Owner/Url Info */}
        <div className="mb-3 font-mono text-xs text-gray-500 truncate">
          <span className="text-cyan-700 select-none">{'>'} </span>
          <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors">{repo.name}</a>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono border-l-2 border-gray-800 pl-3 group-hover:border-cyan-500/50 transition-colors h-20 overflow-y-auto scrollbar-hide">
          {repo.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4 mt-auto">
          {repo.tags.map((tag, i) => (
            <span key={i} className="text-[10px] uppercase px-2 py-0.5 border border-green-900/50 text-green-500 bg-green-900/10">
              #{tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <a 
            href={repo.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex-1 text-center py-1.5 text-xs font-bold bg-cyan-900/20 text-cyan-400 hover:bg-cyan-500 hover:text-black transition-colors uppercase tracking-widest"
          >
            访问
          </a>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(`git clone ${repo.url}`);
            }}
            className="flex-1 text-center py-1.5 text-xs font-bold bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors uppercase tracking-widest"
          >
            克隆
          </button>
        </div>
      </div>
    </div>
  );
};

export default RepoCard;