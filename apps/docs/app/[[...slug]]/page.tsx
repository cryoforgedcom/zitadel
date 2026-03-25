import { getPageImage, getPage, source } from '@/lib/source';
import {
  DocsBody,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Feedback } from '@/components/feedback';
import { MarkdownCopyButton, ViewOptionsPopover } from '@/components/ai/page-actions';

export default async function Page(props: any) {
  const params = await props.params;
  const { page, source: pageSource } = getPage(params.slug);
  if (!page) notFound();

  // Async mode: content is compiled on-demand when load() is called,
  // not eagerly when the module is imported. This prevents the bundler
  // from compiling all ~1,100 MDX files at once.
  const { body: MDX, toc } = await page.data.load();

  return (
    <DocsPage toc={toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            Callout,
            Tab,
            Tabs,
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(pageSource, page),
          })}
        />
      </DocsBody>
      <div className="flex flex-row gap-2 items-center border-b pt-2 pb-6">
        <MarkdownCopyButton markdownUrl={`${page.url}.mdx`} />
        <ViewOptionsPopover
          markdownUrl={`${page.url}.mdx`}
          githubUrl={`https://github.com/zitadel/zitadel/blob/main/apps/docs/content/${page.slugs.join('/')}.mdx`}
        />
      </div>
      <Feedback />
    </DocsPage>
  );
}

export const dynamicParams = true;
export const revalidate = false;

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: any,
): Promise<Metadata> {
  const params = await props.params;
  const { page } = getPage(params.slug);
  if (!page) notFound();
  const baseUrl = 'https://zitadel.com/docs';
  const url = params.slug ? `${baseUrl}/${params.slug.join('/')}` : baseUrl;

  let canonicalUrl = url;

  if (params.slug?.[0]?.startsWith('v')) {
    const unversionedSlug = params.slug.slice(1);
    const unversionedPage = source.getPage(unversionedSlug);
    if (unversionedPage) {
      canonicalUrl = `${baseUrl}${unversionedPage.url === '/' ? '' : unversionedPage.url}`;
    }
  }

  let description = page.data.description;
  if (!description) {
    description = `Explore ZITADEL documentation for ${page.data.title}. Learn how to integrate, manage, and secure your applications with our comprehensive identity and access management solutions.`;
  }

  return {
    title: page.data.title,
    description: description.length > 200 ? description.substring(0, 197) + '...' : description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
