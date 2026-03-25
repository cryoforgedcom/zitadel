import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image
            src="/docs/logos/zitadel-logo.svg"
            alt="Zitadel"
            width={120}
            height={30}
            className="block"
            priority
          />
        </>
      ),
    },
    links: [],
  };
}
