import monacoStylesUrl from 'monaco-editor/min/vs/editor/editor.main.css?url';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type * as Monaco from 'monaco-editor';

let monacoPromise: Promise<typeof Monaco> | null = null;
let monacoStylesPromise: Promise<void> | null = null;

const ensureMonacoStyles = () => {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }

  if (!monacoStylesPromise) {
    monacoStylesPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('link[data-monaco-editor-styles="true"]');

      if (existing instanceof HTMLLinkElement) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }

        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => {
          monacoStylesPromise = null;
          reject(new Error('Failed to load Monaco editor styles.'));
        }, { once: true });
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = monacoStylesUrl;
      link.dataset.monacoEditorStyles = 'true';
      link.addEventListener('load', () => {
        link.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      link.addEventListener('error', () => {
        monacoStylesPromise = null;
        reject(new Error('Failed to load Monaco editor styles.'));
      }, { once: true });
      document.head.append(link);
    });
  }

  return monacoStylesPromise;
};

const ensureMonacoEnvironment = () => {
  if (typeof self === 'undefined') return;

  const currentEnvironment = self.MonacoEnvironment;

  if (currentEnvironment?.getWorker) return;

  self.MonacoEnvironment = {
    ...currentEnvironment,
    getWorker(_workerId, _label) {
      return new EditorWorker();
    }
  };
};

export const loadMonaco = () => {
  if (!monacoPromise) {
    monacoPromise = ensureMonacoStyles()
      .then(() => {
        ensureMonacoEnvironment();
        return import('monaco-editor');
      })
      .catch((error) => {
        monacoPromise = null;
        throw error;
      });
  }

  return monacoPromise;
};
