// Small Markdown subset for statements and notes: paragraphs, lists, **bold**, *italic*,
// `code`, ```blocks```, [links](url). Input is escaped first, so content cannot inject HTML.
// md(src, { article: true }) also reads headings, | tables | and > quotes (translated articles).

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

// "\|" inside a cell is a literal pipe, not a column border.
const cells = (row) =>
  row.trim().replace(/^\|/, "").replace(/\|$/, "").replaceAll("\\|", "\u0001").split("|").map((c) => inline(c.trim().replaceAll("\u0001", "|")));
const isRule = (row) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(row || "");

export function md(src, { article = false } = {}) {
  return blocks(esc(src).split("\n"), article);
}

function blocks(lines, article) {
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flushPara();
      flushList();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      out.push(`<pre class="code">${code.join("\n")}</pre>`);
      continue;
    }
    if (article) {
      const head = line.match(/^(#{1,4})\s+(.*)/);
      if (head) {
        flushPara();
        flushList();
        const n = Math.max(2, head[1].length);
        out.push(`<h${n}>${inline(head[2])}</h${n}>`);
        continue;
      }
      if (line.trim().startsWith("|") && isRule(lines[i + 1])) {
        flushPara();
        flushList();
        const body = [];
        const top = cells(line);
        for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) body.push(cells(lines[i]));
        i--;
        const tr = (r, tag) => `<tr>${r.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
        out.push(`<div class="table-wrap"><table><thead>${tr(top, "th")}</thead><tbody>${body.map((r) => tr(r, "td")).join("")}</tbody></table></div>`);
        continue;
      }
      if (/^&gt;\s?/.test(line)) {
        flushPara();
        flushList();
        const quote = [];
        for (; i < lines.length && /^&gt;\s?/.test(lines[i]); i++) quote.push(lines[i].replace(/^&gt;\s?/, ""));
        i--;
        out.push(`<blockquote>${blocks(quote, article)}</blockquote>`);
        continue;
      }
    }
    const bullet = line.match(/^\s*[-•]\s+(.*)/);
    const num = line.match(/^\s*\d+\.\s+(.*)/);
    if (bullet || num) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet || num)[1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += " " + line.trim();
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out.join("");
}

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
