import React, { useState, useEffect } from 'react';

const BackToTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <div 
      className={`fixed bottom-8 right-5 z-50 transition-all duration-500 transform
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}
      `}
    >
      <button
        onClick={scrollToTop}
        aria-label="Back to top"
        className="bg-black/90 border border-cyan-500 text-cyan-400 p-3 md:p-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] backdrop-blur-md group hover:bg-cyan-900/40 hover:border-cyan-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] hover:text-cyan-200 transition-all active:scale-95"
        style={{
          clipPath: 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)'
        }}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-6 w-6 md:h-5 md:w-5 group-hover:-translate-y-1 transition-transform duration-300" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 11l7-7 7 7M12 19V4" />
        </svg>
      </button>
    </div>
  );
};

export default BackToTop;