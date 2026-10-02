import Link from 'next/link';
import type { Block, Inline, LegalDocument } from '@/lib/legal';

function renderInline(inline: Inline, key: React.Key) {
  if (typeof inline === 'string') return inline;
  if ('strong' in inline) {
    return (
      <strong key={key} className="font-semibold text-fg">
        {inline.strong}
      </strong>
    );
  }
  return (
    <Link key={key} href={inline.href}>
      {inline.text}
    </Link>
  );
}

function renderInlines(content: Inline[]) {
  return content.map((inline, i) => renderInline(inline, i));
}

function renderBlock(block: Block, i: number) {
  switch (block.kind) {
    case 'h2':
      return (
        <h2
          key={i}
          className="mt-12 text-m-h2 font-semibold leading-[1.15] tracking-[-0.02em] text-fg first:mt-0"
        >
          {block.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 key={i} className="mt-8 text-m-lead font-semibold leading-[1.2] tracking-[-0.01em] text-fg">
          {block.text}
        </h3>
      );
    case 'p':
      return (
        <p key={i} className="mt-4 text-m-body leading-[1.65] text-fg-2">
          {renderInlines(block.content)}
        </p>
      );
    case 'ul':
      return (
        <ul key={i} className="mt-4 flex flex-col gap-2 ps-6 text-m-body leading-[1.65] text-fg-2 marker:text-fg-3">
          {block.items.map((item, j) => (
            <li key={j} className="list-disc">
              {renderInlines(item)}
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div key={i} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-m-body">
            <thead>
              <tr>
                {block.head.map((label, j) => (
                  <th
                    key={j}
                    scope="col"
                    className="border-b border-border-light p-3 text-start font-semibold text-fg"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k} className="border-b border-border-light p-3 align-top text-fg-2">
                      {renderInlines(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Renders a `LegalDocument` (`lib/legal.ts`) on the public site. */
export function LegalDocument({ doc }: { doc: LegalDocument }) {
  return (
    <article className="mx-auto w-full max-w-[70ch] px-6 py-16 lg:py-24">
      <h1 className="text-[clamp(2.25rem,5vw,var(--fs-marketing-h1))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
        {doc.title}
      </h1>
      <p className="mt-3 text-m-body text-fg-3">Last updated {doc.updated}</p>
      {doc.blocks.map((block, i) => renderBlock(block, i))}
    </article>
  );
}
