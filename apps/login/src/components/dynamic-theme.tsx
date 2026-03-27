"use client";

import { Logo } from "@/components/logo";
import { useResponsiveLayout } from "@/lib/theme-hooks";
import { APPEARANCE_STYLES, getThemeConfig } from "@/lib/theme";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import React, { Children, ReactNode } from "react";
import { Card } from "./card";
import { ThemeWrapper } from "./theme-wrapper";

function BrandingLogo({
  branding,
  height = 150,
  width = 150,
}: {
  branding?: BrandingSettings;
  height?: number;
  width?: number;
}) {
  if (!branding) return null;
  return (
    <Logo
      lightSrc={branding.lightTheme?.logoUrl}
      darkSrc={branding.darkTheme?.logoUrl}
      height={height}
      width={width}
    />
  );
}

/**
 * DynamicTheme component handles layout switching based on
 * NEXT_PUBLIC_THEME_LAYOUT and NEXT_PUBLIC_THEME_APPEARANCE.
 *
 * Children convention (all layouts):
 * - First child: title/description content
 * - Second child: form/action content
 * - Single child: backwards-compatible, placed in the form area
 */
export function DynamicTheme({
  branding,
  children,
}: {
  children: ReactNode | ((isSideBySide: boolean) => ReactNode);
  branding?: BrandingSettings;
}) {
  const { isSideBySide } = useResponsiveLayout();
  const themeConfig = getThemeConfig();
  const isZitadel = themeConfig.appearance === "zitadel";

  const actualChildren: ReactNode = React.useMemo(() => {
    if (typeof children === "function") {
      return (children as (isSideBySide: boolean) => ReactNode)(isSideBySide);
    }
    return children;
  }, [children, isSideBySide]);

  // Split children once — used by all layout variants
  const childArray = Children.toArray(actualChildren);
  const titleContent = childArray[0] || null;
  const formContent = childArray[1] || null;
  const hasTwoChildren = childArray.length === 2;

  let content: ReactNode;

  if (isZitadel && isSideBySide) {
    // Zitadel side-by-side: gradient card left, form right
    const gradientClasses = APPEARANCE_STYLES.zitadel.gradientCard;
    content = (
      <div className="relative mx-auto flex w-full max-w-[67.5rem] flex-col items-center justify-center gap-10 px-4 py-8 md:px-8 md:py-16 lg:flex-row lg:items-stretch lg:px-0 xl:gap-16 2xl:gap-28">
        <div
          className={`flex w-full flex-col justify-between overflow-hidden rounded-2xl p-3 lg:w-[57%] lg:self-stretch lg:p-4 ${gradientClasses} min-h-[220px] lg:min-h-[560px]`}
        >
          <div />
          <div className="flex flex-col gap-2 p-3 lg:p-4">
            <div className="mb-6">
              <BrandingLogo branding={branding} height={80} width={200} />
            </div>
            {hasTwoChildren && (
              <div className="space-y-4 [&_h1]:font-[family-name:var(--font-heading)] [&_h1]:text-left [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h1]:text-white [&_h1]:md:text-5xl [&_p]:text-left [&_p]:text-sm [&_p]:leading-5 [&_p]:text-gray-300 [&_p]:md:text-xl [&_p]:md:leading-8">
                {titleContent}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col items-center justify-center gap-6 px-4 md:px-0 lg:w-[43%] lg:items-end lg:self-stretch 2xl:gap-10">
          <div className="flex w-full max-w-[440px] flex-col gap-4">
            <div className="space-y-6 text-white [&_.ztdl-p]:text-gray-400">
              {hasTwoChildren ? formContent : titleContent}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (isZitadel) {
    // Zitadel stacked: everything wrapped in gradient card
    const gradientClasses = APPEARANCE_STYLES.zitadel.gradientCard;
    content = (
      <div className="relative mx-auto w-full max-w-[440px] px-4 py-4">
        <div className={`overflow-hidden rounded-2xl p-6 py-8 ${gradientClasses}`}>
          <div className="mx-auto flex flex-col items-center space-y-8">
            <div className="relative -mb-4 flex flex-row items-center justify-center">
              <BrandingLogo branding={branding} />
            </div>

            {hasTwoChildren ? (
              <>
                <div className="mb-4 flex w-full flex-col items-center text-center text-white [&_.ztdl-p]:text-gray-400 [&_h1]:font-[family-name:var(--font-heading)]">
                  {titleContent}
                </div>
                <div className="w-full text-white [&_.ztdl-p]:text-gray-400">{formContent}</div>
              </>
            ) : (
              <div className="w-full text-white [&_.ztdl-p]:text-gray-400">{actualChildren}</div>
            )}
          </div>
        </div>
      </div>
    );
  } else if (isSideBySide) {
    // Default side-by-side: card with gradient left panel
    content = (
      <div className="relative mx-auto w-full max-w-[1100px] px-8 py-4">
        <Card>
          <div className="flex min-h-[400px]">
            <div className="from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 flex w-1/2 flex-col justify-center bg-gradient-to-br p-4 lg:p-8">
              <div className="mx-auto max-w-[440px] space-y-8">
                <BrandingLogo branding={branding} />
                {hasTwoChildren && (
                  <div className="flex flex-col items-start space-y-4 text-left">
                    <div className="space-y-6 [&_h1]:text-left [&_h1]:text-4xl [&_h1]:leading-tight [&_h1]:text-gray-900 [&_h1]:dark:text-white [&_h1]:lg:text-4xl [&_p]:text-left [&_p]:leading-relaxed [&_p]:text-gray-700 [&_p]:dark:text-gray-300">
                      {titleContent}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex w-1/2 items-center justify-center p-4 lg:p-8">
              <div className="w-full max-w-[440px]">
                <div className="space-y-6">{hasTwoChildren ? formContent : titleContent}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  } else {
    // Default top-to-bottom: centered card
    content = (
      <div className="relative mx-auto w-full max-w-[440px] px-4 py-4">
        <Card>
          <div className="mx-auto flex flex-col items-center space-y-8">
            <div className="relative -mb-4 flex flex-row items-center justify-center">
              <BrandingLogo branding={branding} />
            </div>

            {hasTwoChildren ? (
              <>
                <div className="mb-4 flex w-full flex-col items-center text-center">{titleContent}</div>
                <div className="w-full">{formContent}</div>
              </>
            ) : (
              <div className="w-full">{actualChildren}</div>
            )}

            <div className="flex flex-row justify-between"></div>
          </div>
        </Card>
      </div>
    );
  }

  return <ThemeWrapper branding={branding}>{content}</ThemeWrapper>;
}

