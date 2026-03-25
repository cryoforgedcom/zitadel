'use client';

import React, { useRef, useEffect, useState } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

const LOGO_WIDTH = 120;
const LOGO_HEIGHT = 30;

export function AnimatedLogo() {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [animationData, setAnimationData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    // Load the Lottie JSON statically from public/
    fetch('/docs/logos/zitadel-logo-animated.json')
      .then(res => res.json())
      .then(data => setAnimationData(data))
      .catch(() => {
        // Silently fail — static SVG fallback is rendered below
      });
  }, []);

  const handleMouseEnter = () => {
    lottieRef.current?.play();
  };

  const handleMouseLeave = () => {
    lottieRef.current?.pause();
    lottieRef.current?.goToAndStop(0, true);
  };

  // While loading or on failure, show the static SVG
  if (!animationData) {
    return (
      <img
        src="/docs/logos/zitadel-logo.svg"
        alt="Zitadel"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="nav-logo"
      />
    );
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="nav-logo"
      style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop
        autoplay={false}
        style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}
        aria-label="Zitadel logo"
      />
    </div>
  );
}
