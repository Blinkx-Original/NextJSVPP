/*
 * Custom TinyMCE React wrapper with autosave draft cleanup.
 *
 * This component wraps a TinyMCE editor instance and exposes a
 * `clearDraft` method on its ref. The `clearDraft` method will remove
 * any localStorage entries created by the TinyMCE autosave plugin. This
 * prevents previously auto‑saved drafts from overriding freshly saved
 * descriptions after a page refresh.
 */

'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from 'react';
import { textareaStyle } from './panel-styles';

// URL pointing to the TinyMCE script. We load TinyMCE on demand from the CDN.
const TINYMCE_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tinymce@6.8.3/tinymce.min.js';

let tinymceLoader: Promise<void> | null = null;

function loadTinyMce(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (window.tinymce) {
    return Promise.resolve();
  }
  if (!tinymceLoader) {
    tinymceLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TINYMCE_SCRIPT_URL;
      script.referrerPolicy = 'origin';
      script.addEventListener('load', () => {
        resolve();
      });
      script.addEventListener('error', () => {
        tinymceLoader = null;
        reject(new Error('No se pudo cargar TinyMCE. Verifica la conexión de red.'));
      });
      document.head.appendChild(script);
    });
  }
  return tinymceLoader;
}

declare global {
  interface Window {
    tinymce?: any;
  }
}

export interface TinyMceEditorProps {
  /**
   * The HTML content to display in the editor.
   */
  value: string;
  /**
   * Called whenever the editor content changes. Receives the new HTML.
   */
  onChange: (value: string) => void;
  /**
   * Product slug used to namespace autosave drafts.  If omitted a default
   * prefix will be used.
   */
  slug?: string | null;
  /**
   * Disable editing. When disabled the editor becomes read‑only.
   */
  disabled?: boolean;
  /**
   * Placeholder text shown when the editor is empty.
   */
  placeholder?: string;
  /**
   * Optional identifier used to differentiate multiple editors on a page.
   */
  id?: string;
}

export interface TinyMceEditorHandle {
  /**
   * Clears any locally stored autosave drafts for this editor. This should
   * be called after a successful server save to ensure the autosave
   * plugin does not restore stale content on the next page load.
   */
  clearDraft: () => void;
}

type EditorMode = 'visual' | 'html';

const TinyMceEditor = forwardRef<TinyMceEditorHandle, TinyMceEditorProps>(
  ({ value, onChange, slug, disabled = false, placeholder, id }, ref) => {
    const editorRef = useRef<any | null>(null);
    const onChangeRef = useRef(onChange);
    const latestValueRef = useRef<string>(value || '');
    const lastEmittedValueRef = useRef<string>(value || '');
    const suppressChangeRef = useRef(false);
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [editorInitialized, setEditorInitialized] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mode, setMode] = useState<EditorMode>('visual');
    const [sourceValue, setSourceValue] = useState<string>(value);
    const modeRef = useRef<EditorMode>('visual');

    // Compute a prefix for autosave keys based on the product slug.  We do not
    // include the trailing dash here because TinyMCE will append its own
    // identifiers.
    const autosavePrefix = useMemo(() => {
      return slug ? `product-desc-${slug}` : 'product-desc';
    }, [slug]);

    const hostId = useMemo(() => `tinymce-host-${id ?? 'editor'}`, [id]);
    const containerId = useMemo(() => `tinymce-container-${id ?? 'editor'}`, [id]);

    // Keep the onChange callback up to date.
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    // Keep the current mode in a ref so we can use it in callbacks.
    useEffect(() => {
      modeRef.current = mode;
    }, [mode]);

    // Update the latest value when the prop changes.
    useEffect(() => {
      setSourceValue(value);
      latestValueRef.current = value;
      lastEmittedValueRef.current = value;
    }, [value]);

    // Load the TinyMCE script on mount.
    useEffect(() => {
      let cancelled = false;
      if (typeof window === 'undefined') {
        return;
      }
      loadTinyMce()
        .then(() => {
          if (!cancelled) {
            setScriptLoaded(true);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setLoadError((error as Error).message);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []);

    // Initialise the editor whenever the script is loaded or other deps change.
    useEffect(() => {
      if (!scriptLoaded || typeof window === 'undefined') {
        return;
      }
      const tinymce = window.tinymce;
      if (!tinymce) {
        return;
      }
      const hostElement = document.getElementById(hostId) as HTMLElement | null;
      if (!hostElement) {
        return;
      }
      let destroyed = false;
      const initEditor = async () => {
        setEditorInitialized(false);
        const existingEditors = tinymce.EditorManager?.editors ?? [];
        for (const editor of existingEditors) {
          if (editor?.id === hostId || editor?.targetElm === hostElement) {
            editor.remove();
          }
        }
        try {
          const createdEditors = await tinymce.init({
            target: hostElement,
            height: 600,
            min_height: 560,
            width: '100%',
            menubar: 'file edit view insert format tools table help',
            plugins: [
              'advlist',
              'anchor',
              'autolink',
              'charmap',
              'code',
              'codesample',
              'fullscreen',
              'hr',
              'image',
              'link',
              'lists',
              'paste',
              'preview',
              'searchreplace',
              'table',
              'visualblocks',
              'wordcount'
            ].join(' '),
            toolbar:
              'undo redo | blocks | bold italic underline strikethrough | alignleft aligncenter alignright alignjustify | bullist numlist checklist outdent indent | link unlink | blockquote hr table | removeformat | codesample | fullscreen preview | customInsertPdf',
            block_formats: 'Paragraph=p;Heading 1=h1;Heading 2=h2;Heading 3=h3;Heading 4=h4',
            default_link_target: '_blank',
            link_rel_list: [
              { title: 'Ninguno', value: '' },
              { title: 'nofollow', value: 'nofollow' },
              { title: 'sponsored', value: 'sponsored' }
            ],
            branding: false,
            statusbar: true,
            paste_as_text: false,
            paste_block_drop: true,
            paste_data_images: false,
            paste_webkit_styles: 'color font-size font-weight',
            // Configure autosave.  Restore drafts only when explicitly chosen via
            // the menu or toolbar, not automatically on empty editors.  This
            // prevents stale drafts from overriding server‑saved content.
            autosave_interval: '10s',
            autosave_restore_when_empty: false,
            autosave_retention: '30m',
            autosave_prefix: `${autosavePrefix}-`,
            convert_urls: false,
            image_caption: true,
            image_title: true,
            file_picker_types: 'image',
            placeholder,
            content_style:
              'body { font-family: "Inter", "Helvetica Neue", Arial, sans-serif; font-size: 16px; line-height: 1.7; color: #0f172a; } a { color: #2563eb; } table { width: 100%; border-collapse: collapse; } table td, table th { border: 1px solid #e2e8f0; padding: 8px; }',
            setup: (editor: any) => {
              editorRef.current = editor;
              editor.on('init', () => {
                suppressChangeRef.current = true;
                editor.setContent(latestValueRef.current || '');
                suppressChangeRef.current = false;
                if (disabled || modeRef.current === 'html') {
                  editor.mode.set('readonly');
                }
                const container: HTMLElement | null = editor.getContainer?.() ?? null;
                if (container) {
                  container.style.width = '100%';
                  container.style.maxWidth = '100%';
                  container.style.display = modeRef.current === 'visual' ? '' : 'none';
                }
                setEditorInitialized(true);
              });
              const emitChange = () => {
                if (suppressChangeRef.current) {
                  return;
                }
                const content = editor.getContent({ format: 'html' }) || '';
                if (content === lastEmittedValueRef.current) {
                  return;
                }
                lastEmittedValueRef.current = content;
                onChangeRef.current?.(content);
              };
              const changeEvents = [
                'change',
                'input',
                'undo',
                'redo',
                'keyup',
                'setcontent',
                'Change',
                'Input',
                'Undo',
                'Redo',
                'KeyUp',
                'SetContent'
              ];
              changeEvents.forEach((eventName) => {
                editor.on(eventName, emitChange);
              });
              editor.on('remove', () => {
                if (!destroyed) {
                  editorRef.current = null;
                }
              });
              editor.ui.registry.addButton('customInsertPdf', {
                icon: 'new-document',
                tooltip: 'Insertar PDF',
                onAction: () => {
                  const url = window.prompt('URL del PDF (https://...)');
                  if (!url) {
                    return;
                  }
                  const trimmed = url.trim();
                  if (!/^https?:\/\//i.test(trimmed)) {
                    alert('La URL debe comenzar con http:// o https://');
                    return;
                  }
                  const label = window.prompt('Texto del enlace del PDF', 'Descargar PDF');
                  const linkText = (label ?? 'Descargar PDF').trim() || 'Descargar PDF';
                  editor.insertContent(`<p><a href="${trimmed}" target="_blank" rel="noopener">${linkText}</a></p>`);
                }
              });
            },
            file_picker_callback: (
              callback: (url: string, meta?: Record<string, string>) => void,
              _value: string,
              meta: { filetype?: string }
            ) => {
              if (meta.filetype === 'image') {
                const url = window.prompt('URL de la imagen (https://...)');
                if (!url) {
                  return;
                }
                const trimmed = url.trim();
                if (!/^https?:\/\//i.test(trimmed)) {
                  alert('La URL debe comenzar con http:// o https://');
                  return;
                }
                const alt = window.prompt('Texto ALT de la imagen');
                callback(trimmed, { alt: (alt ?? '').trim() });
              }
            }
          });
          if (destroyed) {
            if (Array.isArray(createdEditors)) {
              createdEditors.forEach((editor: any) => editor.remove());
            } else if (createdEditors?.remove) {
              createdEditors.remove();
            }
          }
        } catch (error) {
          setLoadError((error as Error).message);
        }
      };
      initEditor();
      return () => {
        destroyed = true;
        if (editorRef.current) {
          editorRef.current.remove();
          editorRef.current = null;
        }
      };
    }, [autosavePrefix, disabled, hostId, placeholder, scriptLoaded]);

    // Keep the editor updated when props change.
    useEffect(() => {
      if (!editorRef.current) {
        return;
      }
      const editor = editorRef.current;
      const container: HTMLElement | null = editor.getContainer?.() ?? null;
      if (container) {
        container.style.display = mode === 'visual' ? '' : 'none';
      }
      if (mode === 'html') {
        const content = editor.getContent({ format: 'html' }) || '';
        setSourceValue(content);
      }
      editor.mode.set(disabled || mode === 'html' ? 'readonly' : 'design');
    }, [disabled, mode]);

    // Update editor content when value prop changes.
    useEffect(() => {
      if (!editorRef.current) {
        return;
      }
      const editor = editorRef.current;
      const currentContent = editor.getContent({ format: 'html' }) || '';
      if (value !== currentContent) {
        suppressChangeRef.current = true;
        editor.setContent(value || '');
        suppressChangeRef.current = false;
      }
    }, [value]);

    const handleSourceChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setSourceValue(nextValue);
      lastEmittedValueRef.current = nextValue;
      onChangeRef.current?.(nextValue);
    };

    // Render tab buttons for Visual/HTML modes.
    const renderTabs = () => {
      const commonTabStyle = {
        flex: 1,
        padding: '0.6rem 0.75rem',
        border: '1px solid #cbd5f5',
        borderBottom: 'none',
        background: '#f8fafc',
        color: '#0f172a',
        fontWeight: 600,
        fontSize: '0.95rem',
        cursor: 'pointer' as const,
        transition: 'background 0.2s ease',
        outline: 'none'
      };
      const activeTabStyle = {
        ...commonTabStyle,
        background: '#fff',
        borderBottom: '1px solid #fff'
      };
      const inactiveTabStyle = {
        ...commonTabStyle,
        opacity: 0.75
      };
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid #cbd5f5',
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            overflow: 'hidden'
          }}
        >
          <button
            type="button"
            onClick={() => setMode('visual')}
            disabled={mode === 'visual'}
            style={mode === 'visual' ? activeTabStyle : inactiveTabStyle}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode('html')}
            disabled={mode === 'html'}
            style={mode === 'html' ? activeTabStyle : inactiveTabStyle}
          >
            Código HTML
          </button>
        </div>
      );
    };

    // Expose the clearDraft method to parent components via the ref.
    useImperativeHandle(ref, () => ({
      clearDraft: () => {
        // 1) Try to call the TinyMCE autosave plugin removeDraft() method.
        try {
          const editor = editorRef.current;
          if (editor && editor.plugins && typeof editor.plugins.autosave?.removeDraft === 'function') {
            editor.plugins.autosave.removeDraft();
          }
        } catch {
          // Ignore errors.
        }
        // 2) As a fallback, remove any localStorage keys created by TinyMCE autosave.
        if (typeof window !== 'undefined' && window.localStorage) {
          const prefix = `tinymce-autosave-${autosavePrefix}`;
          try {
            // Iterate through keys and remove matching entries.
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
              const key = window.localStorage.key(i);
              if (key && key.startsWith(prefix)) {
                window.localStorage.removeItem(key);
              }
            }
          } catch {
            // Ignore any errors accessing localStorage.
          }
        }
      }
    }), [autosavePrefix]);

    if (loadError) {
      return (
        <div
          style={{
            ...textareaStyle,
            minHeight: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            border: '1px solid #f87171',
            background: '#fef2f2',
            color: '#b91c1c'
          }}
        >
          <span>{loadError}</span>
        </div>
      );
    }

    const showLoadingOverlay = mode === 'visual' && (!scriptLoaded || !editorInitialized);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        {renderTabs()}
        <div
          style={{
            position: 'relative',
            border: '1px solid #cbd5f5',
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            overflow: 'hidden',
            background: '#fff',
            width: '100%'
          }}
        >
          <div
            id={containerId}
            style={{
              display: mode === 'visual' ? 'block' : 'none',
              minHeight: '36rem'
            }}
          >
            <textarea id={hostId} defaultValue={value} style={{ display: 'none' }} />
          </div>
          {mode === 'html' ? (
            <textarea
              value={sourceValue}
              onChange={handleSourceChange}
              disabled={disabled}
              style={{
                ...textareaStyle,
                minHeight: '36rem',
                border: 'none',
                borderRadius: 0,
                fontFamily:
                  'SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                padding: '1rem',
                resize: 'vertical' as const,
                outline: 'none'
              }}
            />
          ) : null}
          {showLoadingOverlay ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(248, 250, 252, 0.92)',
                color: '#475569',
                fontSize: '1rem',
                gap: '0.5rem'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: 0
                }}
              >
                Cargando editor…
              </span>
              <div style={{ display: 'flex', gap: '0.35rem' }} aria-hidden="true">
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#94a3b8',
                    animation: 'tinymce-dot 1s infinite ease-in-out'
                  }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#94a3b8',
                    animation: 'tinymce-dot 1s infinite ease-in-out',
                    animationDelay: '0.15s'
                  }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#94a3b8',
                    animation: 'tinymce-dot 1s infinite ease-in-out',
                    animationDelay: '0.3s'
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
        <style>{`
          @keyframes tinymce-dot {
            0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
            40% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }
);

TinyMceEditor.displayName = 'TinyMceEditor';

export default TinyMceEditor;