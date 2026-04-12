import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { keymap, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { uploadImage } from './image-upload';

function wrapSelection(view: EditorView, marker: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const wrapped = `${marker}${selected}${marker}`;
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from + marker.length, head: to + marker.length },
  });
  return true;
}

function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = `[${selected}]()`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 1, head: from + 1 + selected.length },
  });
  return true;
}

const markdownKeymap = keymap.of([
  { key: 'Mod-b', run: (v) => wrapSelection(v, '**') },
  { key: 'Mod-i', run: (v) => wrapSelection(v, '_') },
  { key: 'Mod-Shift-x', run: (v) => wrapSelection(v, '~~') },
  { key: 'Mod-e', run: (v) => wrapSelection(v, '`') },
  { key: 'Mod-k', run: insertLink },
]);

class LinkWidget extends WidgetType {
  constructor(readonly text: string, readonly url: string, readonly linkFrom: number) { super(); }
  toDOM() {
    const a = document.createElement('a');
    a.textContent = this.text;
    a.href = /^https?:\/\//.test(this.url) ? this.url : `https://${this.url}`;
    a.className = 'cm-collapsed-link';
    a.target = '_blank';
    const from = this.linkFrom;
    a.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cmEl = a.closest('.cm-editor');
      const view = cmEl && EditorView.findFromDOM(cmEl as HTMLElement);
      if (!view) return;
      if (e.shiftKey) {
        window.open(a.href, '_blank');
      } else {
        const charW = a.offsetWidth / this.text.length;
        const charIdx = Math.min(Math.round(e.offsetX / charW), this.text.length);
        view.dispatch({ selection: { anchor: from + 1 + charIdx } });
        view.focus();
      }
    });
    return a;
  }
  eq(other: LinkWidget) { return this.text === other.text && this.url === other.url; }
}

function parseImageUrl(raw: string): { url: string; baseUrl: string; width: number | null } {
  try {
    const u = new URL(raw, 'http://x');
    const w = u.searchParams.get('w');
    u.searchParams.delete('w');
    const baseUrl = u.pathname + (u.search || '');
    return { url: raw, baseUrl, width: w ? parseInt(w, 10) : null };
  } catch {
    return { url: raw, baseUrl: raw, width: null };
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly baseUrl: string,
    readonly width: number | null,
    readonly nodeFrom: number,
    readonly nodeTo: number,
    readonly rawUrlFrom: number,
    readonly rawUrlTo: number,
  ) { super(); }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-image-widget';

    const inner = document.createElement('div');
    inner.className = 'cm-image-inner';

    const img = document.createElement('img');
    img.src = this.baseUrl;
    img.alt = this.alt;
    if (this.width) img.style.width = `${this.width}px`;

    const leftHandle = document.createElement('div');
    leftHandle.className = 'cm-resize-handle cm-resize-left';

    const rightHandle = document.createElement('div');
    rightHandle.className = 'cm-resize-handle cm-resize-right';

    const setupResize = (handle: HTMLElement, side: 'left' | 'right') => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = img.offsetWidth;

        const onMove = (ev: MouseEvent) => {
          const dx = side === 'right' ? ev.clientX - startX : startX - ev.clientX;
          const newW = Math.max(50, startW + dx);
          img.style.width = `${newW}px`;
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);

          const finalW = img.offsetWidth;
          const cmEl = container.closest('.cm-editor');
          const view = cmEl && EditorView.findFromDOM(cmEl as HTMLElement);
          if (!view) return;

          const newUrlText = `${this.baseUrl}?w=${finalW}`;
          view.dispatch({
            changes: { from: this.rawUrlFrom, to: this.rawUrlTo, insert: newUrlText },
          });
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    };

    setupResize(leftHandle, 'left');
    setupResize(rightHandle, 'right');

    inner.appendChild(leftHandle);
    inner.appendChild(img);
    inner.appendChild(rightHandle);
    container.appendChild(inner);

    // Click on image to edit raw markdown (left click only)
    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).classList.contains('cm-resize-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      const cmEl = container.closest('.cm-editor');
      const view = cmEl && EditorView.findFromDOM(cmEl as HTMLElement);
      if (!view) return;
      view.dispatch({ selection: { anchor: this.nodeFrom + 2 } });
      view.focus();
    });

    return container;
  }

  eq(other: ImageWidget) {
    return this.baseUrl === other.baseUrl && this.width === other.width && this.alt === other.alt;
  }
}

const boldMark = Decoration.mark({ class: 'cm-md-bold' });
const italicMark = Decoration.mark({ class: 'cm-md-italic' });
const hideMark = Decoration.replace({});

const collapseMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const deco: any[] = [];
      const { from: curFrom, to: curTo } = view.state.selection.main;
      syntaxTree(view.state).iterate({
        enter(node) {
          const inside = curFrom >= node.from && curTo <= node.to;

          if (node.name === 'Image' && !inside) {
            const marks: { from: number; to: number }[] = [];
            let rawUrl = '';
            let urlFrom = 0;
            let urlTo = 0;
            let altText = '';
            const cursor = node.node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === 'LinkMark') marks.push({ from: cursor.from, to: cursor.to });
                if (cursor.name === 'URL') {
                  rawUrl = view.state.sliceDoc(cursor.from, cursor.to);
                  urlFrom = cursor.from;
                  urlTo = cursor.to;
                }
              } while (cursor.nextSibling());
            }
            // Image marks: ![, ], (, )
            if (marks.length >= 4 && rawUrl) {
              altText = view.state.sliceDoc(marks[0].to, marks[1].from);
              const { baseUrl, width } = parseImageUrl(rawUrl);
              deco.push(Decoration.replace({
                widget: new ImageWidget(altText, baseUrl, width, node.from, node.to, urlFrom, urlTo),
              }).range(node.from, node.to));
            }
            return false;
          }

          if (node.name === 'Link' && !inside) {
            const marks: { from: number; to: number }[] = [];
            let url = '';
            const cursor = node.node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === 'LinkMark') marks.push({ from: cursor.from, to: cursor.to });
                if (cursor.name === 'URL') url = view.state.sliceDoc(cursor.from, cursor.to);
              } while (cursor.nextSibling());
            }
            if (marks.length >= 4 && url) {
              const linkText = view.state.sliceDoc(marks[0].to, marks[1].from);
              deco.push(Decoration.replace({
                widget: new LinkWidget(linkText, url, node.from),
              }).range(node.from, node.to));
            }
          }

          if ((node.name === 'StrongEmphasis' || node.name === 'Emphasis') && !inside) {
            const mark = node.name === 'StrongEmphasis' ? boldMark : italicMark;
            const emphMarks: { from: number; to: number }[] = [];
            const cursor = node.node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === 'EmphasisMark') emphMarks.push({ from: cursor.from, to: cursor.to });
              } while (cursor.nextSibling());
            }
            if (emphMarks.length >= 2) {
              const first = emphMarks[0];
              const last = emphMarks[emphMarks.length - 1];
              deco.push(hideMark.range(first.from, first.to));
              deco.push(mark.range(first.to, last.from));
              deco.push(hideMark.range(last.from, last.to));
            }
          }
        },
      });
      return Decoration.set(deco, true);
    }
  },
  { decorations: (v) => v.decorations }
);

function getImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  return Array.from(dataTransfer.files).filter((f) => f.type.startsWith('image/'));
}

function handleImageInsert(view: EditorView, files: File[], pos?: number) {
  for (const file of files) {
    const insertPos = pos ?? view.state.selection.main.head;
    const placeholder = '![Uploading...]()\n';
    view.dispatch({ changes: { from: insertPos, insert: placeholder } });

    const placeholderFrom = insertPos;
    uploadImage(file).then((imageUrl) => {
      // Find and replace the placeholder
      const doc = view.state.doc.toString();
      const idx = doc.indexOf('![Uploading...]()', placeholderFrom);
      if (idx !== -1) {
        const replacement = `![image](${imageUrl})\n`;
        view.dispatch({
          changes: { from: idx, to: idx + '![Uploading...]()'.length, insert: replacement.trimEnd() },
        });
      }
    }).catch(() => {
      // Remove placeholder on failure
      const doc = view.state.doc.toString();
      const idx = doc.indexOf('![Uploading...]()', placeholderFrom);
      if (idx !== -1) {
        view.dispatch({
          changes: { from: idx, to: idx + '![Uploading...]()\n'.length, insert: '' },
        });
      }
    });
  }
}

const imageDropPaste = EditorView.domEventHandlers({
  drop(event, view) {
    const files = getImageFiles(event.dataTransfer);
    if (files.length === 0) return false;
    event.preventDefault();
    view.dom.classList.remove('cm-drag-over');
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    handleImageInsert(view, files, pos ?? undefined);
    return true;
  },
  paste(event, view) {
    const files = getImageFiles(event.clipboardData);
    if (files.length === 0) return false;
    event.preventDefault();
    handleImageInsert(view, files);
    return true;
  },
  dragover(event, view) {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      view.dom.classList.add('cm-drag-over');
    }
    return false;
  },
  dragleave(_event, view) {
    view.dom.classList.remove('cm-drag-over');
    return false;
  },
});

function minLines(n: number): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const lines = tr.newDoc.lines;
    if (lines >= n) return tr;
    const padding = '\n'.repeat(n - lines);
    return [tr, { changes: { from: tr.newDoc.length, insert: padding } }];
  });
}

export function createMarkdownEditor(root: HTMLElement, hidden: HTMLInputElement) {
  const minLinesCompartment = new Compartment();

  const view = new EditorView({
    state: EditorState.create({
      doc: '\n\n',
      extensions: [
        markdownKeymap,
        basicSetup,
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        minLinesCompartment.of(minLines(3)),
        collapseMarkdown,
        imageDropPaste,
      ],
    }),
    parent: root,
  });

  (root as any).__setMinLines = (n: number) => {
    view.dispatch({ effects: minLinesCompartment.reconfigure(minLines(n)) });
    const lines = view.state.doc.lines;
    if (lines < n) {
      // Pad to reach minimum
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\n'.repeat(n - lines) } });
    } else if (lines > n) {
      // Trim trailing empty lines down to minimum
      const doc = view.state.doc;
      let trimTo = doc.length;
      for (let i = lines; i > n; i--) {
        const line = doc.line(i);
        if (line.text.trim() !== '') break;
        trimTo = line.from > 0 ? line.from - 1 : line.from;
      }
      if (trimTo < doc.length) {
        view.dispatch({ changes: { from: trimTo, to: doc.length } });
      }
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') root.classList.add('shift-held');
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') root.classList.remove('shift-held');
  });

  const form = root.closest('form');
  form?.addEventListener('submit', () => {
    hidden.value = view.state.doc.toString().trim();
  });

  return view;
}
