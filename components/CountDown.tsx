import React, { useState, useEffect } from 'react';

const CountDown: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      // Targets: 5 AM and 5 PM
      const target1 = new Date(now);
      target1.setHours(5, 0, 0, 0);
      
      const target2 = new Date(now);
      target2.setHours(17, 0, 0, 0);

      let target = target1;
      
      if (now > target1 && now < target2) {
        target = target2;
      } else if (now > target2) {
        target = target1;
        target.setDate(target.getDate() + 1);
      }

      const diff = target.getTime() - now.getTime();
      
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    setTimeLeft(calculateTimeLeft());

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-end">
      <span className="text-xs md:text-[10px] text-gray-500 uppercase tracking-widest">下一次自动扫描倒计时</span>
      <span className="text-3xl md:text-2xl font-cyber text-fuchsia-500 tabular-nums neon-text-pink">
        {timeLeft}
      </span>
    </div>
  );
};

export default CountDown;