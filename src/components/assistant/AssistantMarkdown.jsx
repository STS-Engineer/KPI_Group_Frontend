import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { parseInline, parseMarkdown, resolveLink } from "./assistantMarkdown.js";

// An assistant answer, from the parsed Markdown (assistantMarkdown.js) to
// React elements. Links to the app's pages navigate in place (onNavigate lets
// the panel react, e.g. close on a phone); web links open a new tab.

function Inline({ nodes, onNavigate }) {
  return nodes.map((node, index) => {
    if (node.type === "text") {
      // A single line break inside a paragraph stays a line break.
      const parts = node.text.split("\n");
      return (
        <Fragment key={index}>
          {parts.map((part, partIndex) => (
            <Fragment key={partIndex}>
              {partIndex > 0 ? <br /> : null}
              {part}
            </Fragment>
          ))}
        </Fragment>
      );
    }
    if (node.type === "code") {
      return (
        <code key={index} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {node.text}
        </code>
      );
    }
    if (node.type === "strong") {
      return (
        <strong key={index} className="font-semibold text-slate-900 dark:text-white">
          <Inline nodes={node.children} onNavigate={onNavigate} />
        </strong>
      );
    }
    if (node.type === "em") {
      return (
        <em key={index}>
          <Inline nodes={node.children} onNavigate={onNavigate} />
        </em>
      );
    }
    if (node.type === "link") {
      const target = resolveLink(node.href);
      const content = <Inline nodes={node.children} onNavigate={onNavigate} />;
      const linkClass =
        "font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition hover:decoration-blue-600 dark:text-blue-300 dark:decoration-blue-300/30 dark:hover:decoration-blue-300";
      if (target?.kind === "internal") {
        return (
          <Link key={index} to={target.to} onClick={onNavigate} className={linkClass}>
            {content}
          </Link>
        );
      }
      if (target?.kind === "external") {
        return (
          <a key={index} href={target.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {content}
          </a>
        );
      }
      return <Fragment key={index}>{content}</Fragment>;
    }
    return null;
  });
}

const HEADING_CLASSES = {
  1: "text-base font-bold",
  2: "text-[15px] font-bold",
  3: "text-sm font-bold",
};

const ALIGN_CLASSES = { left: "text-left", right: "text-right", center: "text-center" };

function Block({ block, onNavigate }) {
  const inline = (text) => <Inline nodes={parseInline(text)} onNavigate={onNavigate} />;

  switch (block.type) {
    case "heading":
      return (
        <p className={`${HEADING_CLASSES[block.level] || "text-sm font-bold"} pt-1 text-slate-900 dark:text-white`}>
          {inline(block.text)}
        </p>
      );
    case "paragraph":
      return <p>{inline(block.text)}</p>;
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          start={block.start}
          className={`space-y-1 pl-5 ${block.ordered ? "list-decimal marker:font-semibold marker:text-slate-500" : "list-disc marker:text-blue-500"}`}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-0.5">
              {inline(item.text)}
              {item.children.length ? (
                <ul className="mt-1 list-[circle] space-y-0.5 pl-5 marker:text-slate-400">
                  {item.children.map((child, childIndex) => (
                    <li key={childIndex}>{inline(child)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ListTag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-xs leading-5">
            <thead className="bg-slate-50 dark:bg-slate-800/70">
              <tr>
                {block.header.map((cell, index) => (
                  <th
                    key={index}
                    className={`border-b border-slate-200 px-2 py-1.5 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300 ${ALIGN_CLASSES[block.align[index]] || ""}`}
                  >
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  {row.map((cell, index) => (
                    <td key={index} className={`px-2 py-1.5 align-top ${ALIGN_CLASSES[block.align[index]] || ""}`}>
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <blockquote className="rounded-r-lg border-l-[3px] border-orange-500 bg-orange-50/60 px-3 py-2 text-slate-700 dark:bg-orange-500/10 dark:text-slate-200">
          {inline(block.text)}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-[12px] leading-5 text-slate-100 dark:bg-black/40">
          {block.text}
        </pre>
      );
    case "rule":
      return <hr className="border-slate-200 dark:border-slate-700" />;
    default:
      return null;
  }
}

export default function AssistantMarkdown({ text, onNavigate }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="space-y-2.5 break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
      {blocks.map((block, index) => (
        <Block key={index} block={block} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
