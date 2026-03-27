"use client";

import { Logo } from "@/components/logo";
import { useResponsiveLayout } from "@/lib/theme-hooks";
import { APPEARANCE_STYLES, getThemeConfig } from "@/lib/theme";
import { BrandingSettings } from "@zitadel/proto/zitadel/settings/v2/branding_settings_pb";
import React, { Children, ReactNode } from "react";
import { Card } from "./card";
import { ThemeWrapper } from "./theme-wrapper";

/**
 * DynamicTheme component handles layout switching between traditional top-to-bottom
 * and modern side-by-side layouts based on NEXT_PUBLIC_THEME_LAYOUT.
 *
 * For side-by-side layout:
 * - First child: Goes to left side (title, description, etc.)
 * - Second child: Goes to right side (forms, buttons, etc.)
 * - Single child: Falls back to right side for backward compatibility
 *
 * For top-to-bottom layout:
 * - All children rendered in traditional centered layout
 *
 * For zitadel appearance:
 * - Side-by-side: gradient card on left with logo/title, form fields on right
 * - Non-side-by-side / mobile: everything wrapped in gradient card
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
  const isZitadelAppearance = themeConfig.appearance === "zitadel";

  // Resolve children immediately to avoid passing functions through React
  const actualChildren: ReactNode = React.useMemo(() => {
    if (typeof children === "function") {
      return (children as (isSideBySide: boolean) => ReactNode)(isSideBySide);
    }
    return children;
  }, [children, isSideBySide]);

  // ZITADEL appearance: gradient card layout inspired by admin register page
  if (isZitadelAppearance) {
    const childArray = Children.toArray(actualChildren);
    const leftContent = childArray[0] || null;
    const rightContent = childArray[1] || null;
    const hasLeftRightStructure = childArray.length === 2;
    const gradientClasses =
      APPEARANCE_STYLES.zitadel.gradientCard;

    if (isSideBySide) {
      // Side-by-side: gradient card on left, form on right
      return (
        <ThemeWrapper branding={branding}>
          <div className="relative mx-auto flex w-full max-w-[67.5rem] flex-col items-center justify-center gap-10 px-4 py-8 md:px-8 md:py-16 lg:flex-row lg:items-stretch lg:px-0 xl:gap-16 2xl:gap-28">
            {/* Left: Gradient card with logo + title */}
            <div
              className={`flex w-full flex-col justify-between overflow-hidden rounded-2xl p-3 lg:w-[57%] lg:self-stretch lg:p-4 ${gradientClasses} min-h-[220px] lg:min-h-[560px]`}
            >
              <div /> {/* Spacer for top */}
              <div className="flex flex-col gap-2 p-3 lg:p-4">
                {branding && (
                  <div className="mb-6">
                    <Logo
                      lightSrc={branding.lightTheme?.logoUrl}
                      darkSrc={branding.darkTheme?.logoUrl}
                      height={80}
                      width={200}
                    />
                  </div>
                )}
                {hasLeftRightStructure && (
                  <div className="space-y-4 [&_h1]:text-left [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h1]:text-white [&_h1]:md:text-5xl [&_p]:text-left [&_p]:text-sm [&_p]:leading-5 [&_p]:text-gray-300 [&_p]:md:text-xl [&_p]:md:leading-8">
                    {leftContent}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Form area */}
            <div className="flex w-full flex-col items-center justify-center gap-6 px-4 md:px-0 lg:w-[43%] lg:items-end lg:self-stretch 2xl:gap-10">
              <div className="flex w-full max-w-[440px] flex-col gap-4">
                <div className="space-y-6 text-white [&_.ztdl-p]:text-gray-400">
                  {hasLeftRightStructure ? rightContent : leftContent}
                </div>
              </div>
            </div>
          </div>
        </ThemeWrapper>
      );
    }

    // Non-side-by-side / mobile: everything wrapped in gradient card
    return (
      <ThemeWrapper branding={branding}>
        <div className="relative mx-auto w-full max-w-[440px] px-4 py-4">
          <div
            className={`overflow-hidden rounded-2xl p-6 py-8 ${gradientClasses}`}
          >
            <div className="mx-auto flex flex-col items-center space-y-8">
              <div className="relative -mb-4 flex flex-row items-center justify-center">
                {branding && (
                  <Logo
                    lightSrc={branding.lightTheme?.logoUrl}
                    darkSrc={branding.darkTheme?.logoUrl}
                    height={150}
                    width={150}
                  />
                )}
              </div>

              {hasLeftRightStructure ? (
                <>
                  <div className="mb-4 flex w-full flex-col items-center text-center text-white [&_.ztdl-p]:text-gray-400">
                    {leftContent}
                  </div>
                  <div className="w-full text-white [&_.ztdl-p]:text-gray-400">
                    {rightContent}
                  </div>
                </>
              ) : (
                <div className="w-full text-white [&_.ztdl-p]:text-gray-400">
                  {actualChildren}
                </div>
              )}

              <div className="flex flex-row justify-between"></div>
            </div>
          </div>
        </div>
      </ThemeWrapper>
    );
  }

  return (
    <ThemeWrapper branding={branding}>
      {isSideBySide
        ? // Side-by-side layout: first child goes left, second child goes right
          (() => {
            const childArray = Children.toArray(actualChildren);
            const leftContent = childArray[0] || null;
            const rightContent = childArray[1] || null;

            // If there's only one child, it's likely the old format - keep it on the right side
            const hasLeftRightStructure = childArray.length === 2;

            return (
              <div className="relative mx-auto w-full max-w-[1100px] px-8 py-4">
                <Card>
                  <div className="flex min-h-[400px]">
                    {/* Left side: First child + branding */}
                    <div className="from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 flex w-1/2 flex-col justify-center bg-gradient-to-br p-4 lg:p-8">
                      <div className="mx-auto max-w-[440px] space-y-8">
                        {/* Logo and branding */}
                        {branding && (
                          <Logo
                            lightSrc={branding.lightTheme?.logoUrl}
                            darkSrc={branding.darkTheme?.logoUrl}
                            height={150}
                            width={150}
                          />
                        )}

                        {/* First child content (title, description) - only if we have left/right structure */}
                        {hasLeftRightStructure && (
                          <div className="flex flex-col items-start space-y-4 text-left">
                            {/* Apply larger styling to the content */}
                            <div className="space-y-6 [&_h1]:text-left [&_h1]:text-4xl [&_h1]:leading-tight [&_h1]:text-gray-900 [&_h1]:dark:text-white [&_h1]:lg:text-4xl [&_p]:text-left [&_p]:leading-relaxed [&_p]:text-gray-700 [&_p]:dark:text-gray-300">
                              {leftContent}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side: Second child (form) or single child if old format */}
                    <div className="flex w-1/2 items-center justify-center p-4 lg:p-8">
                      <div className="w-full max-w-[440px]">
                        <div className="space-y-6">{hasLeftRightStructure ? rightContent : leftContent}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })()
        : // Traditional top-to-bottom layout - center title/description, left-align forms
          (() => {
            const childArray = Children.toArray(actualChildren);
            const titleContent = childArray[0] || null;
            const formContent = childArray[1] || null;
            const hasMultipleChildren = childArray.length > 1;

            return (
              <div className="relative mx-auto w-full max-w-[440px] px-4 py-4">
                <Card>
                  <div className="mx-auto flex flex-col items-center space-y-8">
                    <div className="relative -mb-4 flex flex-row items-center justify-center">
                      {branding && (
                        <Logo
                          lightSrc={branding.lightTheme?.logoUrl}
                          darkSrc={branding.darkTheme?.logoUrl}
                          height={150}
                          width={150}
                        />
                      )}
                    </div>

                    {hasMultipleChildren ? (
                      <>
                        {/* Title and description - center aligned */}
                        <div className="mb-4 flex w-full flex-col items-center text-center">{titleContent}</div>

                        {/* Form content - left aligned */}
                        <div className="w-full">{formContent}</div>
                      </>
                    ) : (
                      // Single child - use original behavior
                      <div className="w-full">{actualChildren}</div>
                    )}

                    <div className="flex flex-row justify-between"></div>
                  </div>
                </Card>
              </div>
            );
          })()}
    </ThemeWrapper>
  );
}
