import React, { useEffect, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  decimals?: number;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  prefix = '',
  decimals = 0,
}) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const startVal = display;
    const endVal = Number.isFinite(value) ? value : 0;
    if (startVal === endVal) return;

    const duration = 420;
    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startVal + (endVal - startVal) * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplay(endVal);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  const formatted =
    decimals > 0
      ? display.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(display).toLocaleString();

  return (
    <span className="tabular-nums">
      {prefix}
      {formatted}
    </span>
  );
};
