import React from 'react';

interface CyberButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'cyan' | 'pink' | 'green';
  disabled?: boolean;
  className?: string;
}

const CyberButton: React.FC<CyberButtonProps> = ({ 
  onClick, 
  children, 
  variant = 'cyan', 
  disabled = false,
  className = ''
}) => {
  const colors = {
    cyan: 'border-cyan-400 text-cyan-400 hover:bg-cyan-900/30 shadow-[0_0_10px_rgba(34,211,238,0.3)]',
    pink: 'border-fuchsia-500 text-fuchsia-500 hover:bg-fuchsia-900/30 shadow-[0_0_10px_rgba(217,70,239,0.3)]',
    green: 'border-green-500 text-green-500 hover:bg-green-900/30 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative px-6 py-2 border-2 font-mono uppercase tracking-widest text-sm
        transition-all duration-200 transform
        clip-path-polygon
        ${colors[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
        ${className}
      `}
      style={{
        clipPath: 'polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%)'
      }}
    >
      <span className="relative z-10 flex items-center gap-2">
        {children}
      </span>
    </button>
  );
};

export default CyberButton;
