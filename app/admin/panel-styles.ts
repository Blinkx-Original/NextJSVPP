import type { CSSProperties } from 'react';

export const cardStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  background: '#fff'
};

export const inputStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  borderColor: '#cbd5f5',
  fontSize: '0.95rem',
  width: '100%',
  boxSizing: 'border-box'
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '4.5rem',
  fontFamily: 'inherit'
};

export const buttonStyle: CSSProperties = {
  padding: '0.65rem 1.25rem',
  borderRadius: 8,
  background: '#0f172a',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: 600,
  width: 'fit-content'
};

export const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.6,
  cursor: 'not-allowed'
};
