import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type * as Monaco from 'monaco-editor';

let monacoPromise: Promise<typeof Monaco> | null = null;

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
    ensureMonacoEnvironment();
    monacoPromise = import('monaco-editor').catch((error) => {
      monacoPromise = null;
      throw error;
    });
  }

  return monacoPromise;
};
