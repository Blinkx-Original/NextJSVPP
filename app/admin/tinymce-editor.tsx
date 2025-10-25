'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { textareaStyle } from './panel-styles';

const TINYMCE_CDN_URL = 'https://cdn.tiny.cloud/1/no-api-key/tinymce/6/tinymce.min.js';

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
      script.src = TINYMCE_CDN_URL;
      script.referrerPolicy = 'origin';
      script.addEventListener('load', () => {
        resolve();
      });
      script.addEventListener('error', () => {
        tinymceLoader = null;
        reject(new Error('No se pudo cargar TinyMCE.'));
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
  value: string;
  onChange: (value: string) => void;
  slug?: string | null;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

type EditorMode = 'visual' | 'html';

export default function TinyMceEditor({
  value,
  onChange,
  slug,
  disabled = false,
  placeholder,
  id
}: TinyMceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<any | null>(null);
  const lastValueRef = useRef<string>('');
  const latestValueRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('visual');
  const [sourceValue, setSourceValue] = useState<string>(value);
  const modeRef = useRef<EditorMode>('visual');

  const autosavePrefix = useMemo(() => {
    return slug ? `product-desc-${slug}` : 'product-desc';
  }, [slug]);

  useEffect(() => {
    setSourceValue(value);
  }, [value]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined') {
      return () => {};
    }

    loadTinyMce()
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
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

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isReady || typeof window === 'undefined') {
      return;
    }
    const tinymce = window.tinymce;
    if (!tinymce || !textareaRef.current) {
      return;
    }

    let destroyed = false;

    const initEditor = async () => {
      const existing = tinymce.EditorManager?.editors ?? [];
      for (const editor of existing) {
        if (editor?.targetElm === textareaRef.current) {
          editor.remove();
        }
      }

      try {
        const created = await tinymce.init({
          target: textareaRef.current,
          height: 560,
          menubar: 'file edit view insert format tools table help',
          plugins:
            'autolink autosave charmap code codesample fullscreen hr image link lists paste preview searchreplace table wordcount',
          toolbar:
            'undo redo | blocks | bold italic underline strikethrough | alignleft aligncenter alignright alignjustify | bullist numlist checklist outdent indent | link unlink | blockquote hr table | removeformat | codesample code preview fullscreen | customInsertPdf',
          default_link_target: '_blank',
          link_rel_list: [
            { title: 'Ninguno', value: '' },
            { title: 'nofollow', value: 'nofollow' },
            { title: 'sponsored', value: 'sponsored' }
          ],
          block_formats: 'Párrafo=p;Heading 2=h2;Heading 3=h3;Heading 4=h4',
          branding: false,
          statusbar: true,
          paste_as_text: false,
          paste_webkit_styles: 'color font-size',
          autosave_interval: '10s',
          autosave_restore_when_empty: true,
          autosave_retention: '30m',
          autosave_prefix: `${autosavePrefix}-`,
          convert_urls: false,
          image_caption: true,
          image_title: true,
          file_picker_types: 'image',
          placeholder,
          setup: (editor: any) => {
            editorRef.current = editor;
            editor.on('init', () => {
              editor.setContent(latestValueRef.current || '');
              lastValueRef.current = editor.getContent({ format: 'html' }) || '';
              editor.setMode(disabled || modeRef.current === 'html' ? 'readonly' : 'design');
              const container: HTMLElement | null = editor.getContainer?.() ?? null;
              if (container) {
                container.style.display = modeRef.current === 'visual' ? '' : 'none';
              }
            });
            editor.on('change input undo redo keyup setcontent', () => {
              const content = editor.getContent({ format: 'html' }) || '';
              if (content === lastValueRef.current) {
                return;
              }
              lastValueRef.current = content;
              onChangeRef.current?.(content);
            });
            editor.ui.registry.addButton('customInsertPdf', {
              icon: 'new-document',
              tooltip: 'Insertar PDF',
              text: '',
              onAction: () => {
                const url = window.prompt('URL del PDF (https://...)');
                if (!url) {
                  return;
                }
                const label = window.prompt('Texto del enlace del PDF', 'Descargar PDF');
                const safeUrl = url.trim();
                if (!/^https?:\/\//i.test(safeUrl)) {
                  alert('La URL debe comenzar con http:// o https://');
                  return;
                }
                const linkText = (label ?? 'Descargar PDF').trim() || 'Descargar PDF';
                editor.insertContent(
                  `<p><a href="${safeUrl}" target="_blank" rel="noopener">${linkText}</a></p>`
                );
              }
            });
            editor.on('remove', () => {
              if (!destroyed) {
                editorRef.current = null;
              }
            });
          },
          file_picker_callback: (callback: (url: string, meta?: Record<string, string>) => void) => {
            const url = window.prompt('URL de la imagen (https://...)');
            if (!url) {
              return;
            }
            const alt = window.prompt('Texto ALT de la imagen');
            callback(url.trim(), { alt: (alt ?? '').trim() });
          }
        });

        if (destroyed) {
          if (Array.isArray(created)) {
            created.forEach((editor: any) => editor.remove());
          } else if (created?.remove) {
            created.remove();
          }
          return;
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
  }, [autosavePrefix, disabled, isReady, placeholder]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    const editor = editorRef.current;
    const currentContent = editor.getContent({ format: 'html' }) || '';
    if (value !== currentContent) {
      editor.setContent(value || '');
      lastValueRef.current = editor.getContent({ format: 'html' }) || '';
    }
  }, [value]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.setMode(disabled || mode === 'html' ? 'readonly' : 'design');
  }, [disabled, mode]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    const container: HTMLElement | null = editorRef.current.getContainer?.() ?? null;
    if (container) {
      container.style.display = mode === 'visual' ? '' : 'none';
    }
    if (mode === 'html') {
      const content = editorRef.current.getContent({ format: 'html' }) || '';
      lastValueRef.current = content;
      setSourceValue(content);
    }
  }, [mode]);

  const handleSourceChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setSourceValue(nextValue);
    lastValueRef.current = nextValue;
    onChangeRef.current?.(nextValue);
  };

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

  if (loadError) {
    return (
      <div style={{ ...textareaStyle, minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span>{loadError}</span>
      </div>
    );
  }

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
          background: '#fff'
        }}
      >
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            ...textareaStyle,
            minHeight: '34rem',
            resize: 'vertical' as const,
            visibility: isReady ? 'hidden' : 'visible',
            display: mode === 'visual' ? 'block' : 'none',
            border: 'none',
            borderRadius: 0
          }}
          disabled={disabled || mode === 'html'}
        />
        {mode === 'html' ? (
          <textarea
            value={sourceValue}
            onChange={handleSourceChange}
            disabled={disabled}
            style={{
              ...textareaStyle,
              minHeight: '34rem',
              border: 'none',
              borderRadius: 0,
              fontFamily: 'SFMono-Regular, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              padding: '1rem',
              resize: 'vertical' as const,
              outline: 'none'
            }}
          />
        ) : null}
        {!isReady ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(248, 250, 252, 0.85)',
              color: '#475569',
              fontSize: '0.95rem'
            }}
          >
            Cargando editor…
          </div>
        ) : null}
      </div>
    </div>
  );
}
