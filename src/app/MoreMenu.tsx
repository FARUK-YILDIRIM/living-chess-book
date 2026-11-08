import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from './I18nContext';

/** Keeps occasional actions out of the way. Closes on Escape, or a click anywhere else. */
export function MoreMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const { t } = useI18n();
  return (
    <PopoverButton label="⋯" ariaLabel={t('More options')} className="more-button">
      {children}
    </PopoverButton>
  );
}

export function PopoverButton(props: { label: string; ariaLabel?: string; className?: string; children: (close: () => void) => ReactNode }) {
  const { label, ariaLabel, className, children } = props;
  const [isOpen, setIsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div
      className="more"
      ref={root}
      onBlur={(event) => {
        // Tabbing out of the menu closes it too.
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={`quiet${className ? ` ${className}` : ''}`}
        aria-label={ariaLabel ?? label}
        title={ariaLabel ?? label}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {label}
      </button>
      {isOpen && (
        <div className="more-list">
          {children(() => {
            setIsOpen(false);
            button.current?.focus();
          })}
        </div>
      )}
    </div>
  );
}
