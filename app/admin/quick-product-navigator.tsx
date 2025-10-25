'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buttonStyle, inputStyle } from './panel-styles';
import { normalizeProductSlugInput } from '@/lib/product-slug';

interface QuickProductNavigatorProps {
  initialValue?: string;
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.5rem',
  padding: '1rem 1.25rem',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#f8fafc'
};

const formStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: '0.75rem'
};

const helperTextStyle = {
  fontSize: '0.85rem',
  color: '#475569'
};

const errorTextStyle = {
  ...helperTextStyle,
  color: '#ef4444'
};

export default function QuickProductNavigator({ initialValue = '' }: QuickProductNavigatorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const navigateToProduct = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'edit-product');
      params.set('product', slug);
      router.push(`/admin?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const slug = normalizeProductSlugInput(value);
      if (!slug) {
        setError('Ingresa un slug o URL de producto válido.');
        return;
      }
      setError(null);
      navigateToProduct(slug);
    },
    [navigateToProduct, value]
  );

  return (
    <section style={containerStyle} aria-label="Quick product navigation">
      <form style={formStyle} onSubmit={handleSubmit}>
        <input
          style={{ ...inputStyle, flex: '1 1 320px', minWidth: 220 }}
          type="text"
          name="product"
          placeholder="Pega un slug o URL de producto"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError(null);
            }
          }}
        />
        <button type="submit" style={buttonStyle}>
          Editar producto
        </button>
      </form>
      <p style={error ? errorTextStyle : helperTextStyle}>
        {error ?? 'Acepta URLs completas, rutas tipo /p/slug o un slug directo.'}
      </p>
    </section>
  );
}

