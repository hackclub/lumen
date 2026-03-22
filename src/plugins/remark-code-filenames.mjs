/**
 * Allow fenced code blocks to declare a filename using `filename="..."`.
 * Expressive Code already knows how to render `title="..."` as a frame title,
 * so this plugin only rewrites the metadata when a title is not set explicitly.
 */
export function remarkCodeFilenames() {
  return (tree) => {
    visit(tree, (node) => {
      if (node?.type !== 'code' || typeof node.meta !== 'string') return;
      if (/\btitle\s*=/.test(node.meta)) return;

      const filenameMatch = node.meta.match(/\bfilename=(["'])(.*?)\1/);
      if (!filenameMatch) return;

      node.meta = `${node.meta} title=${filenameMatch[1]}${filenameMatch[2]}${filenameMatch[1]}`;
    });
  };
}

function visit(node, visitor) {
  visitor(node);

  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) visit(child, visitor);
}
