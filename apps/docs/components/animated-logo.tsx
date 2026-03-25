'use client';

import React, { useRef, useEffect, useState } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

export function AnimatedLogo() {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [animationData, setAnimationData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/docs/logos/zitadel-logo-animated.json')
      .then(res => res.json())
      .then(data => setAnimationData(data))
      .catch(() => {});
  }, []);

  const handleMouseEnter = () => {
    lottieRef.current?.play();
  };

  const handleMouseLeave = () => {
    lottieRef.current?.pause();
    lottieRef.current?.goToAndStop(0, true);
  };

  if (!animationData) {
    return (
      <img
        src="/docs/logos/zitadel-logo.svg"
        alt="Zitadel"
        style={{ width: 140, height: 'auto' }}
        className="nav-logo"
      />
    );
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="nav-logo"
      style={{ width: 140, height: 'auto' }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop
        autoplay={false}
        style={{ width: 140, height: 'auto' }}
        aria-label="Zitadel logo"
      />
    </div>
  );
}
