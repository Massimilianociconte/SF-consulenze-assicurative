import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md', showText = false }) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Official Circular Logo Frame */}
      <div 
        className={`${sizeClasses[size]} rounded-full overflow-hidden bg-white border-2 border-[#c5a059] shadow-md flex items-center justify-center p-[2px] transition-transform duration-300 hover:scale-105 shrink-0`}
      >
        <img 
          src="/logo.png" 
          alt="S.F. Consulenze Assicurative Logo" 
          className="w-full h-full object-contain rounded-full"
        />
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className="font-extrabold text-white tracking-tight text-base sm:text-lg leading-tight">
            S.F. Consulenze Assicurative
          </span>
          <span className="text-[11px] text-[#c5a059] font-semibold tracking-wide">
            Simone Facchi • Rho (MI)
          </span>
        </div>
      )}
    </div>
  );
};
