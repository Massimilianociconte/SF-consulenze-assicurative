import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyValueButtonProps {
  value: string;
  label?: string;
  compact?: boolean;
  className?: string;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  // Fallback per browser meno recenti o contesti HTTP locali.
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy_failed');
}

export const CopyValueButton: React.FC<CopyValueButtonProps> = ({
  value,
  label = 'Copia',
  compact = false,
  className = '',
}) => {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await copyText(value);
      setState('copied');
    } catch {
      setState('error');
    }
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setState('idle'), 1800);
  };

  const text = state === 'copied' ? 'Copiato' : state === 'error' ? 'Riprova' : label;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        className={
          compact
            ? 'inline-flex items-center gap-1 text-[0.74rem] font-bold text-[#64748b] hover:text-[#0f172a] disabled:opacity-40'
            : 'btn btn-outline btn-sm'
        }
        aria-label={`${label}: ${value}`}
      >
        {state === 'copied' ? <Check size={compact ? 13 : 15} /> : <Copy size={compact ? 13 : 15} />}
        {text}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied'
          ? 'Codice fiscale copiato negli appunti.'
          : state === 'error'
            ? 'Copia non riuscita.'
            : ''}
      </span>
    </span>
  );
};

export default CopyValueButton;
