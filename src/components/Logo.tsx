import React from 'react';
import logoImg from '../assets/logo.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md', showText = false }) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10 sm:w-11 sm:h-11',
    lg: 'w-12 h-12 sm:w-14 sm:h-14',
    xl: 'w-16 h-16 sm:w-20 sm:h-20'
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Official Circular Logo Frame */}
      <div 
        className={`${sizeClasses[size]} rounded-full overflow-hidden bg-white border-2 border-[#c5a059] shadow-md flex items-center justify-center p-[2px] transition-transform duration-300 hover:scale-105 shrink-0`}
      >
        <img 
          src={logoImg} 
          alt="S.F. Consulenze Assicurative Logo" 
          className="w-full h-full object-contain rounded-full"
        />
      </div>

      {showText && (
        <div className="flex flex-col min-w-0">
          <span className="font-extrabold text-white tracking-tight text-sm sm:text-base lg:text-lg leading-tight truncate">
            S.F. Consulenze Assicurative
          </span>
          <span className="text-[10px] sm:text-[11px] text-[#c5a059] font-semibold tracking-wide truncate">
            Simone Facchi • Rho (MI)
          </span>
        </div>
      )}
    </div>
  );
};
